import test from "node:test";
import assert from "node:assert/strict";
import * as r from "../lib/rules";

test("monthly plan tiers: ₦500 (≤5) … ₦3,500 (45+)", () => {
  assert.equal(r.monthlyFeeKobo(1), 50_000); assert.equal(r.monthlyFeeKobo(5), 50_000);
  assert.equal(r.monthlyFeeKobo(6), 100_000); assert.equal(r.monthlyFeeKobo(25), 200_000);
  assert.equal(r.monthlyFeeKobo(44), 300_000); assert.equal(r.monthlyFeeKobo(45), 350_000); assert.equal(r.monthlyFeeKobo(900), 350_000);
});
test("fees", () => { assert.equal(r.JOB_FEE_KOBO, 10_000); assert.equal(r.EXPRESS_JOB_FEE_KOBO, 100_000); assert.equal(r.BUSINESS_SKIP_FEE_KOBO, 2_020_000); });
test("business requirement: 20 jobs and 4.0+", () => {
  assert.ok(r.meetsBusinessRequirement(20, 4.0)); assert.ok(!r.meetsBusinessRequirement(19, 5)); assert.ok(!r.meetsBusinessRequirement(30, 3.99)); assert.ok(!r.meetsBusinessRequirement(30, null));
});
test("unrated until 10 jobs; displayed rating needs ratings this year; bonus capped", () => {
  assert.equal(r.displayedRating({ completedJobs: 9, yearAvg: 5, yearCount: 9, yearPoints: 0 }), null);
  assert.equal(r.displayedRating({ completedJobs: 10, yearAvg: 4.2, yearCount: 10, yearPoints: 0 }), 4.2);
  assert.equal(r.displayedRating({ completedJobs: 40, yearAvg: null, yearCount: 0, yearPoints: 0 }), null); // new year => reset
  assert.equal(r.displayedRating({ completedJobs: 10, yearAvg: 4.9, yearCount: 5, yearPoints: 10_000 }), 5); // never above 5
  assert.equal(r.recognitionBonus(10_000), r.MAX_RECOGNITION_BONUS);
});
test("company points grow with rating and headcount", () => {
  assert.ok(r.pointsForRating(5, 45) > r.pointsForRating(5, 5)); assert.ok(r.pointsForRating(5, 5) > r.pointsForRating(3, 5)); assert.ok(r.pointsForRating(1, 1) >= 1);
});
test("customer posting delay", () => {
  assert.equal(r.postingDelayMinutes(3), 0); assert.equal(r.postingDelayMinutes(0), 0); assert.equal(r.postingDelayMinutes(-2), 6); assert.equal(r.postingDelayMinutes(-500), 60);
});
test("recommendation: same area + better rating wins", () => {
  const job = { areaId: "lekki", lat: null, lng: null };
  const near = r.recommendationScore(job, { areaId: "lekki", lat: null, lng: null }, 4.5);
  assert.ok(near > r.recommendationScore(job, { areaId: "ikeja", lat: null, lng: null }, 5));
  assert.ok(r.recommendationScore(job, { areaId: "lekki", lat: null, lng: null }, 5) > near);
  assert.ok(Math.abs(r.haversineKm({ lat: 6.5244, lng: 3.3792 }, { lat: 6.4474, lng: 3.4723 }) - 13) < 2); // Lagos Island ↔ Lekki-ish
});
test("recurrence: daily/weekly/monthly(clamped)/yearly(leap day) & end date", () => {
  assert.ok(r.occursOn("daily", "2026-01-01", null, "2026-06-09"));
  assert.ok(r.occursOn("weekly", "2026-10-05", null, "2026-10-19")); assert.ok(!r.occursOn("weekly", "2026-10-05", null, "2026-10-20"));
  assert.ok(r.occursOn("monthly", "2026-01-31", null, "2026-02-28")); assert.ok(r.occursOn("monthly", "2026-01-31", null, "2026-04-30")); assert.ok(!r.occursOn("monthly", "2026-01-31", null, "2026-04-29"));
  assert.ok(r.occursOn("yearly", "2024-02-29", null, "2027-02-28"));
  assert.ok(!r.occursOn("daily", "2026-01-01", "2026-01-10", "2026-01-11")); assert.ok(!r.occursOn("daily", "2026-02-01", null, "2026-01-31"));
  assert.equal(r.nextOccurrence("weekly", "2026-10-05", null, "2026-10-06"), "2026-10-12");
  assert.equal(r.nextOccurrence("monthly", "2026-01-15", "2026-02-01", "2026-03-01"), null);
});
test("Lagos date/year helpers", () => {
  assert.equal(r.lagosDate(new Date("2026-12-31T23:30:00Z")), "2027-01-01"); // already new year in Lagos
  assert.equal(r.lagosYearStart(2027).toISOString(), "2026-12-31T23:00:00.000Z");
  assert.equal(r.addDays("2026-03-01", -1), "2026-02-28");
});
