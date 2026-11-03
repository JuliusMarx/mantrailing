// Datenbankzugriff für die API. Läuft gegen Netlify Database (pg.Pool) in Produktion
// und gegen PGlite lokal/in Tests – beide erfüllen das Db-Interface.

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Db {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Führt fn als angemeldeter User (Rolle authenticated) bzw. anonym (Rolle anon) aus.
 * Row-Level-Security greift dadurch für jede Abfrage in fn.
 */
export function asUser<T>(db: Db, user: AuthUser | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      user ? JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }) : '',
    ]);
    await tx.query(user ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}

// pg liefert date/numeric/int8 standardmäßig als Date bzw. String – für JSON lieber so:
const DATE_OID = 1082;
const NUMERIC_OID = 1700;
const INT8_OID = 20;

interface PgClient {
  query(config: { text: string; values?: unknown[]; types?: unknown }): Promise<QueryResult>;
  release(): void;
}
interface PgPool {
  connect(): Promise<PgClient>;
}

/** Adapter für einen pg.Pool (Netlify Database). */
export function pgDb(pool: PgPool, getTypeParser: (oid: number, format?: string) => unknown): Db {
  const types = {
    getTypeParser(oid: number, format?: string) {
      if (oid === DATE_OID) return (v: string) => v;
      if (oid === NUMERIC_OID) return (v: string) => parseFloat(v);
      if (oid === INT8_OID) return (v: string) => parseInt(v, 10);
      return getTypeParser(oid, format);
    },
  };
  return {
    async transaction(fn) {
      const client = await pool.connect();
      const tx: Tx = {
        query: (text, values) => client.query({ text, values, types }) as Promise<QueryResult<never>>,
      };
      try {
        await client.query({ text: 'begin' });
        const result = await fn(tx);
        await client.query({ text: 'commit' });
        return result;
      } catch (err) {
        await client.query({ text: 'rollback' }).catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
