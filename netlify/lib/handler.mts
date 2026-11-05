// HTTP-Schicht der API: /api/auth/*, /api/op/:name, /api/route, /api/health.
import { changePassword, HttpError, resetPassword, signIn, signUp, verifyToken } from './auth.mts';
import { asUser, type AuthUser, type Db } from './db.mts';
import { ADMIN_OPS } from './admin-ops.mts';
import { OPS } from './ops.mts';
import { route } from './routing.mts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Postgres-Fehler in verständliche Meldungen übersetzen. */
function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const e = err as { code?: string; message?: string };
  const msg = e?.message ?? '';
  if (e?.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return new HttpError(403, 'Keine Berechtigung');
  }
  if (e?.code === 'P0001') return new HttpError(400, msg); // raise exception aus unseren Funktionen
  if (e?.code === '23505') return new HttpError(409, 'Das gibt es schon.');
  if (e?.code === '23503') return new HttpError(400, 'Verknüpfter Eintrag fehlt.');
  if (e?.code === '23514' || e?.code === '22P02' || e?.code === '22007') return new HttpError(400, 'Ungültige Eingabe.');
  console.error(err);
  return new HttpError(500, 'Serverfehler');
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') return {};
  const text = await req.text();
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    throw new HttpError(400, 'Ungültiges JSON');
  }
}

export function createHandler(db: Db) {
  async function currentUser(req: Request): Promise<AuthUser | null> {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return token ? verifyToken(db, token) : null;
  }

  async function requireUser(req: Request): Promise<AuthUser> {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, 'Bitte melde dich an.');
    // Gelöschte Konten: Token ist noch gültig, User aber weg
    const exists = await db.transaction((tx) => tx.query(`select 1 from auth.users where id = $1`, [user.id]));
    if (!exists.rows.length) throw new HttpError(401, 'Bitte melde dich an.');
    return user;
  }

  async function isAdmin(user: AuthUser): Promise<boolean> {
    const res = await db.transaction((tx) =>
      tx.query(`select 1 from platform_admins where user_id = $1`, [user.id]),
    );
    return res.rows.length > 0;
  }

  return async function handle(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    try {
      if (path === '/health') {
        await db.transaction((tx) => tx.query(`select 1 from auth.secrets limit 1`));
        return json({ ok: true });
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Nur POST');
      const body = await readBody(req);

      switch (path) {
        case '/auth/signup':
          return json(await signUp(db, body));
        case '/auth/login':
          return json(await signIn(db, body));
        case '/auth/me': {
          const user = await requireUser(req);
          return json({ user, is_admin: await isAdmin(user) });
        }
        case '/auth/password':
          return json(await changePassword(db, await requireUser(req), body));
        case '/auth/reset-password':
          return json(await resetPassword(db, await requireUser(req), body));
        case '/route':
          await requireUser(req);
          return json(await route(body));
      }

      // Backoffice: nur für Plattform-Admins, ohne Row-Level-Security
      const adminMatch = /^\/admin\/([a-zA-Z.]+)$/.exec(path);
      if (adminMatch) {
        const adminOp = ADMIN_OPS[adminMatch[1]];
        if (!adminOp) throw new HttpError(404, 'Unbekannte Operation');
        const user = await requireUser(req);
        if (!(await isAdmin(user))) throw new HttpError(403, 'Keine Berechtigung');
        const result = await db.transaction(async (tx) => {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: user.id, email: user.email, role: 'admin' }),
          ]);
          return adminOp(tx, body, user);
        });
        return json({ data: result ?? null });
      }

      const match = /^\/op\/([a-zA-Z.]+)$/.exec(path);
      const op = match ? OPS[match[1]] : undefined;
      if (!op) throw new HttpError(404, 'Unbekannte Operation');
      const user = op.anon ? await currentUser(req) : await requireUser(req);
      const result = await asUser(db, user, (tx) => op.run(tx, body));
      return json({ data: result ?? null });
    } catch (err) {
      const e = toHttpError(err);
      return json({ error: e.message }, e.status);
    }
  };
}
