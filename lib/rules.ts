// ---------------------------------------------------------------------------
// RE-PAIR business rules — pure functions, no I/O, so they can be unit-tested
// and tuned in ONE place. Money is in kobo (1 NGN = 100 kobo).
// ---------------------------------------------------------------------------

export const NGN = 100;

// --- Fees --------------------------------------------------------------------
export const JOB_FEE_KOBO = 100 * NGN;
export const EXPRESS_JOB_FEE_KOBO = 1000 * NGN;
export const BUSINESS_SKIP_FEE_KOBO = 20_200 * NGN;

/** Monthly company plan, by declared headcount: NGN 500 (≤5 people) up to NGN 3,500 (45+). */
export const PLAN_TIERS: { upTo: number; kobo: number }[] = [
  { upTo: 5, kobo: 500 * NGN },
  { upTo: 15, kobo: 1_000 * NGN },
  { upTo: 25, kobo: 2_000 * NGN },
  { upTo: 44, kobo: 3_000 * NGN },
  { upTo: Infinity, kobo: 3_500 * NGN },
];
export function monthlyFeeKobo(headcount: number): number {
  return (PLAN_TIERS.find((t) => headcount <= t.upTo) ?? PLAN_TIERS[PLAN_TIERS.length - 1]).kobo;
}
export const PLAN_PERIOD_DAYS = 30;

// --- Ratings -----------------------------------------------------------------
export const RATED_AFTER_JOBS = 10;          // "unrated" until this many completed jobs
export const BUSINESS_MIN_JOBS = 20;
export const BUSINESS_MIN_AVG = 4.0;

export const isRated = (completedJobs: number) => completedJobs >= RATED_AFTER_JOBS;

export function meetsBusinessRequirement(completedJobs: number, lifetimeAvg: number | null): boolean {
  return completedJobs >= BUSINESS_MIN_JOBS && lifetimeAvg !== null && lifetimeAvg >= BUSINESS_MIN_AVG;
}

export const MAX_RECOGNITION_BONUS = 0.3;
export const BONUS_PER_POINT = 0.003;
/** Points a company awards to a worker lift their displayed rating slightly (capped). */
export function recognitionBonus(pointsThisYear: number): number {
  return Math.min(MAX_RECOGNITION_BONUS, Math.max(0, pointsThisYear) * BONUS_PER_POINT);
}

export function displayedRating(o: { completedJobs: number; yearAvg: number | null; yearCount: number; yearPoints: number }): number | null {
  if (!isRated(o.completedJobs) || o.yearAvg === null || o.yearCount === 0) return null;
  return Math.round(Math.min(5, o.yearAvg + recognitionBonus(o.yearPoints)) * 100) / 100;
}

// --- Company points ------------------------------------------------------------
export const POINTS_TTL_DAYS = 7;
/** More stars and more employees => bigger pool to distribute (grows with √headcount). */
export function pointsForRating(stars: number, employees: number): number {
  return Math.max(1, Math.round(stars * 5 * Math.sqrt(Math.max(1, employees))));
}

// --- Customer trust points -----------------------------------------------------
/** Customers below 0 points wait longer before their job shows on the board. */
export function postingDelayMinutes(customerPoints: number): number {
  return customerPoints >= 0 ? 0 : Math.min(60, Math.abs(customerPoints) * 3);
}
export const EXPRESS_LEAD_MINUTES = 1;     // express alerts go out 1 minute before the board
export const ENGAGE_WINDOW_MINUTES = 15;   // worker has 15 min to engage after claiming
export const MAX_ACTIVE_CLAIMS = 3;        // anti-hoarding

// --- Geography -----------------------------------------------------------------
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Geo = { areaId: string; lat: number | null; lng: number | null };
export function distanceKm(a: Geo, b: Geo): number | null {
  return a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null ? haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) : null;
}

/** 0..100. Proximity weighs up to 60 (same area + distance), rating up to 40. */
export function recommendationScore(job: Geo, worker: Geo, workerRating: number | null): number {
  const km = distanceKm(job, worker);
  let proximity = 0;
  if (job.areaId === worker.areaId) proximity = 40 + (km !== null ? Math.max(0, 20 - km * 2) : 10);
  else if (km !== null) proximity = Math.max(0, 35 - km * 2);
  const rating = ((workerRating ?? 3) / 5) * 40;
  return proximity + rating;
}

// --- Dates (Nigeria is UTC+1 all year, no DST) ----------------------------------
const WAT_MS = 3_600_000;
export const lagosDate = (now: Date = new Date()): string => new Date(now.getTime() + WAT_MS).toISOString().slice(0, 10);
export const lagosYear = (now: Date = new Date()): number => Number(lagosDate(now).slice(0, 4));
/** Instant when the given year began in Lagos (resets displayed ratings). */
export const lagosYearStart = (year: number): Date => new Date(Date.UTC(year, 0, 1) - WAT_MS);

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

function parseDay(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
const dayNumber = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/** Does a recurring booking fall on `date`? Month/year rules clamp (31st → last day of a short month). */
export function occursOn(freq: Frequency, start: string, end: string | null, date: string): boolean {
  if (date < start || (end !== null && date > end)) return false;
  const s = parseDay(start), d = parseDay(date);
  switch (freq) {
    case "daily": return true;
    case "weekly": return (dayNumber(date) - dayNumber(start)) % 7 === 0;
    case "monthly": return d.day === Math.min(s.day, daysInMonth(d.y, d.m));
    case "yearly": return d.m === s.m && d.day === Math.min(s.day, daysInMonth(d.y, d.m));
  }
}

export function addDays(date: string, n: number): string {
  return new Date(dayNumber(date) * 86_400_000 + n * 86_400_000).toISOString().slice(0, 10);
}

/** Next occurrence on/after `from` (searches up to ~5 years ahead). */
export function nextOccurrence(freq: Frequency, start: string, end: string | null, from: string): string | null {
  const limit = freq === "yearly" ? 366 * 5 : freq === "monthly" ? 400 : 8;
  for (let i = 0; i <= limit; i++) {
    const d = addDays(from < start ? start : from, i);
    if (occursOn(freq, start, end, d)) return d;
  }
  return null;
}
export const REMINDER_OFFSETS = [3, 1, 0] as const;
