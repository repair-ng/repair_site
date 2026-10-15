import { Db, Sql, db, sql } from "./db";
import { displayedRating, isRated, lagosYear, lagosYearStart } from "./rules";

export type YearRating = { year: number; average: number; count: number };
export type Stats = {
  completedJobs: number;
  rated: boolean;               // false => show "Unrated"
  rating: number | null;        // current-year displayed rating (resets each January)
  lifetimeAverage: number | null;
  ratingsThisYear: number;
  history: YearRating[];        // historical yearly ratings, newest first
};

export async function workerStats(workerId: string, d: Db = db): Promise<Stats> {
  const yearStart = lagosYearStart(lagosYear());
  const r = await d.one<{ completed: number; life_avg: number | null; y_avg: number | null; y_count: number; y_points: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM jobs WHERE worker_id = ${workerId} AND status = 'completed') AS completed,
      (SELECT avg(stars)::float8 FROM ratings WHERE worker_id = ${workerId}) AS life_avg,
      (SELECT avg(stars)::float8 FROM ratings WHERE worker_id = ${workerId} AND created_at >= ${yearStart}) AS y_avg,
      (SELECT count(*)::int FROM ratings WHERE worker_id = ${workerId} AND created_at >= ${yearStart}) AS y_count,
      (SELECT coalesce(sum(amount), 0)::int FROM point_awards WHERE worker_id = ${workerId} AND created_at >= ${yearStart}) AS y_points`);
  const history = await d.rows<YearRating>(sql`
    SELECT extract(year FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS year, avg(stars)::float8 AS average, count(*)::int AS count
    FROM ratings WHERE worker_id = ${workerId} GROUP BY 1 ORDER BY 1 DESC`);
  return {
    completedJobs: r.completed, rated: isRated(r.completed), lifetimeAverage: r.life_avg,
    rating: displayedRating({ completedJobs: r.completed, yearAvg: r.y_avg, yearCount: r.y_count, yearPoints: r.y_points }),
    ratingsThisYear: r.y_count, history,
  };
}

export async function businessStats(businessId: string, d: Db = db): Promise<Stats> {
  const yearStart = lagosYearStart(lagosYear());
  const r = await d.one<{ completed: number; life_avg: number | null; y_avg: number | null; y_count: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM jobs WHERE business_id = ${businessId} AND status = 'completed') AS completed,
      (SELECT avg(stars)::float8 FROM ratings WHERE business_id = ${businessId}) AS life_avg,
      (SELECT avg(stars)::float8 FROM ratings WHERE business_id = ${businessId} AND created_at >= ${yearStart}) AS y_avg,
      (SELECT count(*)::int FROM ratings WHERE business_id = ${businessId} AND created_at >= ${yearStart}) AS y_count`);
  const history = await d.rows<YearRating>(sql`
    SELECT extract(year FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS year, avg(stars)::float8 AS average, count(*)::int AS count
    FROM ratings WHERE business_id = ${businessId} GROUP BY 1 ORDER BY 1 DESC`);
  return {
    completedJobs: r.completed, rated: isRated(r.completed), lifetimeAverage: r.life_avg,
    rating: displayedRating({ completedJobs: r.completed, yearAvg: r.y_avg, yearCount: r.y_count, yearPoints: 0 }),
    ratingsThisYear: r.y_count, history,
  };
}

/** Reusable SELECT columns so list endpoints compute the same displayed rating as the profile page. */
export function workerStatCols(yearStart: Date): Sql {
  return sql`
    (SELECT count(*)::int FROM jobs sj WHERE sj.worker_id = u.id AND sj.status = 'completed') AS completed,
    (SELECT avg(sr.stars)::float8 FROM ratings sr WHERE sr.worker_id = u.id AND sr.created_at >= ${yearStart}) AS y_avg,
    (SELECT count(*)::int FROM ratings sr WHERE sr.worker_id = u.id AND sr.created_at >= ${yearStart}) AS y_count,
    (SELECT coalesce(sum(pa.amount), 0)::int FROM point_awards pa WHERE pa.worker_id = u.id AND pa.created_at >= ${yearStart}) AS y_points`;
}

export type StatRow = { completed: number; y_avg: number | null; y_count: number; y_points: number };
export function summarize(r: StatRow) {
  return {
    completedJobs: r.completed,
    rated: isRated(r.completed),
    rating: displayedRating({ completedJobs: r.completed, yearAvg: r.y_avg, yearCount: r.y_count, yearPoints: r.y_points }),
  };
}
