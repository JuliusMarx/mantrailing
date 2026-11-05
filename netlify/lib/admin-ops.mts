// Backoffice-Operationen für Plattform-Admins. Sie laufen OHNE Row-Level-Security
// (als Datenbank-Owner) – der Handler prüft vorher, dass der Aufrufer Admin ist.
import { hashPassword, HttpError, normalizeEmail, temporaryPassword } from './auth.mts';
import type { AuthUser, Tx } from './db.mts';

type Params = Record<string, unknown>;
export type AdminOp = (tx: Tx, p: Params, me: AuthUser) => Promise<unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(p: Params, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `${key} fehlt oder ist ungültig`);
  return v;
}
function str(p: Params, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${key} fehlt`);
  return v.trim();
}
function optStr(p: Params, key: string): string | null {
  const v = p[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function role(p: Params): 'trainer' | 'customer' {
  const v = p['role'];
  if (v !== 'trainer' && v !== 'customer') throw new HttpError(400, 'role ist ungültig');
  return v;
}
/** Suchmuster für ilike, leer = alles. */
function search(p: Params): string {
  const q = typeof p['q'] === 'string' ? p['q'].trim() : '';
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

async function all(tx: Tx, sql: string, params: unknown[] = []) {
  return (await tx.query(sql, params)).rows;
}
async function first(tx: Tx, sql: string, params: unknown[] = []) {
  return (await tx.query(sql, params)).rows[0] ?? null;
}
async function exists(tx: Tx, sql: string, params: unknown[]) {
  return !!(await first(tx, sql, params));
}

async function adminCount(tx: Tx) {
  return Number((await first(tx, `select count(*)::int as n from platform_admins`))!['n']);
}

export const ADMIN_OPS: Record<string, AdminOp> = {
  stats: (tx) =>
    first(
      tx,
      `select
         (select count(*) from schools)::int as schools,
         (select count(*) from auth.users)::int as users,
         (select count(*) from dogs)::int as dogs,
         (select count(*) from appointments where starts_at >= now())::int as upcoming_appointments,
         (select count(*) from polls where status = 'open')::int as open_polls,
         (select count(*) from trails)::int as trails`,
    ),

  // --- Hundeschulen ------------------------------------------------------------

  schools: (tx, p) =>
    all(
      tx,
      `select s.id, s.name, s.created_at,
         (select count(*) from memberships m where m.school_id = s.id and m.role = 'customer')::int as customers,
         (select count(*) from memberships m where m.school_id = s.id and m.role = 'trainer')::int as trainers,
         (select count(*) from appointments a where a.school_id = s.id)::int as appointments,
         (select count(*) from trails t where t.school_id = s.id)::int as trails,
         coalesce((select string_agg(pr.full_name, ', ' order by pr.full_name)
                   from memberships m join profiles pr on pr.id = m.user_id
                   where m.school_id = s.id and m.role = 'trainer'), '') as trainer_names
       from schools s
       where s.name ilike $1
       order by s.name`,
      [search(p)],
    ),

  school: async (tx, p) => {
    const id = uuid(p, 'id');
    const school = await first(tx, `select id, name, created_at from schools where id = $1`, [id]);
    if (!school) return null;
    const members = await all(
      tx,
      `select m.user_id, m.role, m.created_at, pr.full_name, u.email,
         (select count(*) from dogs d where d.owner_id = m.user_id)::int as dogs
       from memberships m
       join profiles pr on pr.id = m.user_id
       join auth.users u on u.id = m.user_id
       where m.school_id = $1
       order by m.role desc, pr.full_name`,
      [id],
    );
    return { school, members };
  },

  'school.rename': async (tx, p) => {
    const row = await first(tx, `update schools set name = $1 where id = $2 returning id, name`, [
      str(p, 'name'),
      uuid(p, 'id'),
    ]);
    if (!row) throw new HttpError(404, 'Hundeschule nicht gefunden');
    return row;
  },

  'school.delete': async (tx, p) => {
    await tx.query(`delete from schools where id = $1`, [uuid(p, 'id')]);
    return { ok: true };
  },

  'school.addMember': async (tx, p) => {
    const email = normalizeEmail(p['email']);
    const user = await first(tx, `select id from auth.users where email = $1`, [email]);
    if (!user) throw new HttpError(404, 'Kein Konto mit dieser E-Mail-Adresse');
    await tx.query(
      `insert into memberships (user_id, school_id, role) values ($1, $2, $3)
       on conflict (user_id, school_id) do update set role = excluded.role`,
      [user['id'], uuid(p, 'id'), role(p)],
    );
    return { ok: true };
  },

  'school.setRole': async (tx, p) => {
    await tx.query(`update memberships set role = $1 where school_id = $2 and user_id = $3`, [
      role(p),
      uuid(p, 'id'),
      uuid(p, 'userId'),
    ]);
    return { ok: true };
  },

  'school.removeMember': async (tx, p) => {
    await tx.query(`delete from memberships where school_id = $1 and user_id = $2`, [
      uuid(p, 'id'),
      uuid(p, 'userId'),
    ]);
    return { ok: true };
  },

  // --- Nutzer:innen --------------------------------------------------------------

  users: (tx, p) =>
    all(
      tx,
      `select u.id, u.email, u.created_at, pr.full_name, pr.phone,
         exists (select 1 from platform_admins a where a.user_id = u.id) as is_admin,
         (select count(*) from memberships m where m.user_id = u.id)::int as schools,
         (select count(*) from dogs d where d.owner_id = u.id)::int as dogs
       from auth.users u join profiles pr on pr.id = u.id
       where pr.full_name ilike $1 or u.email ilike $1
       order by pr.full_name, u.email`,
      [search(p)],
    ),

  user: async (tx, p) => {
    const id = uuid(p, 'id');
    const user = await first(
      tx,
      `select u.id, u.email, u.created_at, pr.full_name, pr.phone,
         exists (select 1 from platform_admins a where a.user_id = u.id) as is_admin
       from auth.users u join profiles pr on pr.id = u.id where u.id = $1`,
      [id],
    );
    if (!user) return null;
    const memberships = await all(
      tx,
      `select m.school_id, m.role, s.name as school_name
       from memberships m join schools s on s.id = m.school_id
       where m.user_id = $1 order by s.name`,
      [id],
    );
    const dogs = await all(tx, `select * from dogs where owner_id = $1 order by name`, [id]);
    return { user, memberships, dogs };
  },

  'user.update': async (tx, p) => {
    const id = uuid(p, 'id');
    const email = normalizeEmail(p['email']);
    if (await exists(tx, `select 1 from auth.users where email = $1 and id <> $2`, [email, id])) {
      throw new HttpError(409, 'Diese E-Mail-Adresse gehört schon zu einem anderen Konto.');
    }
    await tx.query(`update auth.users set email = $1 where id = $2`, [email, id]);
    await tx.query(`update profiles set full_name = $1, phone = $2 where id = $3`, [
      str(p, 'full_name').slice(0, 120),
      optStr(p, 'phone'),
      id,
    ]);
    return { ok: true };
  },

  'user.resetPassword': async (tx, p) => {
    const password = temporaryPassword();
    await tx.query(`update auth.users set password_hash = $1 where id = $2`, [
      await hashPassword(password),
      uuid(p, 'id'),
    ]);
    return { password };
  },

  'user.setAdmin': async (tx, p, me) => {
    const id = uuid(p, 'id');
    if (p['admin'] === true) {
      await tx.query(`insert into platform_admins (user_id) values ($1) on conflict do nothing`, [id]);
    } else {
      if (id === me.id && (await adminCount(tx)) <= 1) {
        throw new HttpError(400, 'Du bist der einzige Admin – vergib die Rechte zuerst an jemand anderen.');
      }
      await tx.query(`delete from platform_admins where user_id = $1`, [id]);
    }
    return { ok: true };
  },

  'user.delete': async (tx, p, me) => {
    const id = uuid(p, 'id');
    if (id === me.id) throw new HttpError(400, 'Dein eigenes Konto löschst du unter „Konto“.');
    await tx.query(`delete from auth.users where id = $1`, [id]);
    return { ok: true };
  },

  // --- Hunde ---------------------------------------------------------------------

  dogs: (tx, p) =>
    all(
      tx,
      `select d.*, pr.full_name as owner_name, u.email as owner_email
       from dogs d join profiles pr on pr.id = d.owner_id join auth.users u on u.id = d.owner_id
       where d.name ilike $1 or d.breed ilike $1 or pr.full_name ilike $1
       order by d.name`,
      [search(p)],
    ),

  'dog.save': async (tx, p) => {
    const input = (p['input'] ?? {}) as Params;
    const row = await first(
      tx,
      `update dogs set name = $1, breed = $2, birth_date = $3, notes = $4 where id = $5 returning *`,
      [str(input, 'name'), optStr(input, 'breed'), optStr(input, 'birth_date'), optStr(input, 'notes'), uuid(p, 'id')],
    );
    if (!row) throw new HttpError(404, 'Hund nicht gefunden');
    return row;
  },

  'dog.delete': async (tx, p) => {
    await tx.query(`delete from dogs where id = $1`, [uuid(p, 'id')]);
    return { ok: true };
  },
};
