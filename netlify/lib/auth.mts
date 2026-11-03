// Login mit E-Mail und Passwort: scrypt-Hashes und signierte Tokens (HMAC-SHA256).
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { AuthUser, Db } from './db.mts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const TOKEN_DAYS = 60;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

let cachedSecret: string | null = null;
async function tokenSecret(db: Db): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const secret = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ value: string }>(
      `select value from auth.secrets where name = 'token_secret'`,
    );
    return rows[0]?.value;
  });
  if (!secret) throw new Error('Token-Secret fehlt – Migration nicht ausgeführt?');
  cachedSecret = secret;
  return secret;
}

export async function signToken(db: Db, user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub: user.id, email: user.email, iat: now, exp: now + TOKEN_DAYS * 86400 }));
  const sig = createHmac('sha256', await tokenSecret(db)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function verifyToken(db: Db, token: string): Promise<AuthUser | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', await tokenSecret(db)).update(payload).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    return { id: data.sub, email: data.email };
  } catch {
    return null;
  }
}

export function normalizeEmail(email: unknown): string {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Bitte eine gültige E-Mail-Adresse angeben.');
  return e;
}

export function checkPassword(password: unknown): string {
  const p = String(password ?? '');
  if (p.length < 8) throw new HttpError(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
  return p;
}

/** Lesbares Einmal-Passwort für das Zurücksetzen durch Trainer:innen. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export async function signUp(db: Db, body: Record<string, unknown>) {
  const email = normalizeEmail(body['email']);
  const password = checkPassword(body['password']);
  const fullName = String(body['full_name'] ?? '').trim().slice(0, 120);
  const hash = await hashPassword(password);
  const user = await db.transaction(async (tx) => {
    const exists = await tx.query(`select 1 from auth.users where email = $1`, [email]);
    if (exists.rows.length) throw new HttpError(409, 'Für diese E-Mail-Adresse gibt es schon ein Konto.');
    const { rows } = await tx.query<AuthUser>(
      `insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, $2, $3) returning id, email`,
      [email, hash, JSON.stringify({ full_name: fullName })],
    );
    return rows[0];
  });
  return { token: await signToken(db, user), user };
}

export async function signIn(db: Db, body: Record<string, unknown>) {
  const email = String(body['email'] ?? '').trim().toLowerCase();
  const password = String(body['password'] ?? '');
  const row = await db.transaction(async (tx) => {
    const { rows } = await tx.query<AuthUser & { password_hash: string }>(
      `select id, email, password_hash from auth.users where email = $1`,
      [email],
    );
    return rows[0];
  });
  // Auch bei unbekannter E-Mail hashen, damit die Antwortzeit nichts verrät
  const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
  if (!row || !ok) throw new HttpError(401, 'E-Mail oder Passwort ist falsch.');
  const user = { id: row.id, email: row.email };
  return { token: await signToken(db, user), user };
}

export async function changePassword(db: Db, user: AuthUser, body: Record<string, unknown>) {
  const current = String(body['current_password'] ?? '');
  const next = checkPassword(body['new_password']);
  const hash = await hashPassword(next);
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ password_hash: string }>(
      `select password_hash from auth.users where id = $1`,
      [user.id],
    );
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
      throw new HttpError(400, 'Das aktuelle Passwort stimmt nicht.');
    }
    await tx.query(`update auth.users set password_hash = $1 where id = $2`, [hash, user.id]);
  });
  return { ok: true };
}

/** Trainer:in setzt das Passwort eines Mitglieds der eigenen Schule zurück. */
export async function resetPassword(db: Db, trainer: AuthUser, body: Record<string, unknown>) {
  const target = String(body['user_id'] ?? '');
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `select 1 from memberships me
       join memberships other on other.school_id = me.school_id
       where me.user_id = $1 and me.role = 'trainer' and other.user_id = $2 and other.user_id <> $1`,
      [trainer.id, target],
    );
    if (!rows.length) throw new HttpError(403, 'Keine Berechtigung');
    await tx.query(`update auth.users set password_hash = $1 where id = $2`, [hash, target]);
  });
  return { password };
}
