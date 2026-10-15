import { Pool, PoolClient } from "pg";

// ---------------------------------------------------------------------------
// SQL-injection defence, by construction.
//
// Every query in this app is built with the `sql` tagged template below. Each
// ${interpolation} becomes a numbered parameter ($1, $2, ...) that is sent to
// Postgres separately from the query text, so user data can NEVER be parsed
// as SQL. The query functions only accept the `Sql` type — passing a plain
// string (e.g. built with + or a template literal) is a compile error AND a
// runtime error. Dynamic ORDER BY / column names must come from an allow-list
// of pre-written fragments, never from user input.
// ---------------------------------------------------------------------------

export class Sql {
  constructor(readonly text: string, readonly values: unknown[]) {}
}

export function sql(strings: TemplateStringsArray, ...vals: unknown[]): Sql {
  let text = strings[0];
  const values: unknown[] = [];
  vals.forEach((v, i) => {
    if (v instanceof Sql) {
      // Nested fragment: splice its text in, renumbering its placeholders.
      const offset = values.length;
      text += v.text.replace(/\$(\d+)/g, (_, n) => `$${offset + Number(n)}`);
      values.push(...v.values);
    } else {
      values.push(v);
      text += `$${values.length}`;
    }
    text += strings[i + 1];
  });
  return new Sql(text, values);
}

/** Joins fragments with a fixed separator, e.g. joinSql(conds, sql` AND `). */
export function joinSql(parts: Sql[], separator: Sql): Sql {
  if (parts.length === 0) return sql``;
  return parts.slice(1).reduce((acc, p) => sql`${acc}${separator}${p}`, parts[0]);
}

export interface Db {
  rows<T = Record<string, unknown>>(q: Sql): Promise<T[]>;
  one<T = Record<string, unknown>>(q: Sql): Promise<T>;
  maybe<T = Record<string, unknown>>(q: Sql): Promise<T | null>;
  exec(q: Sql): Promise<number>;
}

type Runner = { query: (text: string, values: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

function makeDb(runner: Runner): Db {
  const run = async (q: Sql) => {
    if (!(q instanceof Sql)) throw new Error("Refusing to run a query that was not built with sql``");
    return runner.query(q.text, q.values);
  };
  return {
    async rows(q) { return (await run(q)).rows; },
    async one(q) {
      const r = (await run(q)).rows;
      if (r.length !== 1) throw new Error(`Expected exactly one row, got ${r.length}`);
      return r[0];
    },
    async maybe(q) { return (await run(q)).rows[0] ?? null; },
    async exec(q) { return (await run(q)).rowCount ?? 0; },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __repairPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__repairPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalThis.__repairPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      // Server-side guard rails so a bad query can't hang the database.
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
    });
    globalThis.__repairPool.on("error", (e) => console.error("[pg pool]", e.message));
  }
  return globalThis.__repairPool;
}

export const db: Db = makeDb({ query: (t, v) => getPool().query(t, v as unknown[]) });

/** Runs `fn` in a transaction; commits on success, rolls back on any throw. */
export async function tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(makeDb(client));
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
