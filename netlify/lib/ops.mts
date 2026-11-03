// Alle Datenoperationen der App. Jede läuft in einer Transaktion als angemeldeter User
// (bzw. anon) – Row-Level-Security in der Datenbank entscheidet, was erlaubt ist.
// Die Operationen selbst prüfen nur Eingaben und bauen das Antwortformat.
import { HttpError } from './auth.mts';
import type { Tx } from './db.mts';

type Params = Record<string, unknown>;
export interface Op {
  /** Auch ohne Login erlaubt (läuft dann als Rolle anon). */
  anon?: boolean;
  run(tx: Tx, p: Params): Promise<unknown>;
}

// --- Hilfen ------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(p: Params, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `${key} fehlt oder ist ungültig`);
  return v;
}
function optUuid(p: Params, key: string): string | null {
  return p[key] === null || p[key] === undefined || p[key] === '' ? null : uuid(p, key);
}
function uuids(p: Params, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && UUID.test(x))) {
    throw new HttpError(400, `${key} muss eine Liste von IDs sein`);
  }
  return v as string[];
}
function str(p: Params, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${key} fehlt`);
  return v;
}
function oneOf<T extends string>(p: Params, key: string, values: readonly T[]): T {
  const v = p[key];
  if (!values.includes(v as T)) throw new HttpError(400, `${key} ist ungültig`);
  return v as T;
}
function input(p: Params): Params {
  const v = p['input'];
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'input fehlt');
  return v as Params;
}

interface TableSpec {
  table: string;
  columns: string[];
  json?: string[];
}

function values(spec: TableSpec, data: Params): [string[], unknown[]] {
  const cols = spec.columns.filter((c) => c in data);
  const vals = cols.map((c) => {
    const v = data[c];
    return spec.json?.includes(c) && v !== null && v !== undefined ? JSON.stringify(v) : v;
  });
  return [cols, vals];
}

async function insertRow(tx: Tx, spec: TableSpec, data: Params, extra: Params = {}) {
  const [cols, vals] = values({ ...spec, columns: [...spec.columns, ...Object.keys(extra)] }, { ...data, ...extra });
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await tx.query(
    `insert into ${spec.table} (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    vals,
  );
  return rows[0];
}

async function updateRow(tx: Tx, spec: TableSpec, id: string, data: Params) {
  const [cols, vals] = values(spec, data);
  if (!cols.length) throw new HttpError(400, 'Nichts zu ändern');
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const { rows } = await tx.query(
    `update ${spec.table} set ${sets.join(', ')} where id = $${cols.length + 1} returning *`,
    [...vals, id],
  );
  if (!rows[0]) throw new HttpError(404, 'Nicht gefunden oder keine Berechtigung');
  return rows[0];
}

async function first(tx: Tx, sql: string, params: unknown[] = []) {
  return (await tx.query(sql, params)).rows[0] ?? null;
}
async function all(tx: Tx, sql: string, params: unknown[] = []) {
  return (await tx.query(sql, params)).rows;
}
async function scalar(tx: Tx, sql: string, params: unknown[] = []) {
  const row = await first(tx, sql, params);
  return row ? Object.values(row)[0] : null;
}

const DOGS: TableSpec = { table: 'dogs', columns: ['name', 'breed', 'birth_date', 'notes', 'photo_url'] };
const APPOINTMENTS: TableSpec = {
  table: 'appointments',
  columns: ['title', 'starts_at', 'ends_at', 'meeting_point', 'meeting_address', 'max_dogs', 'registration_deadline', 'notes'],
  json: ['meeting_point'],
};
const POLLS: TableSpec = {
  table: 'polls',
  columns: ['title', 'description', 'meeting_point', 'meeting_address', 'deadline'],
  json: ['meeting_point'],
};
const POLL_OPTIONS: TableSpec = { table: 'poll_options', columns: ['starts_at', 'ends_at', 'max_dogs'] };
const TRAILS: TableSpec = {
  table: 'trails',
  columns: ['name', 'description', 'difficulty', 'surface', 'route', 'waypoints', 'segments', 'appointment_id'],
  json: ['route', 'waypoints', 'segments'],
};

const MINE_JSON = `coalesce((
  select json_agg(json_build_object(
    'id', p.id, 'appointment_id', p.appointment_id, 'dog_id', p.dog_id, 'user_id', p.user_id,
    'status', p.status, 'created_at', p.created_at,
    'dogs', json_build_object('id', d.id, 'name', d.name, 'breed', d.breed)
  ) order by p.created_at)
  from appointment_participants p join dogs d on d.id = p.dog_id
  where p.appointment_id = a.id and p.user_id = auth.uid() and p.status <> 'cancelled'
), '[]') as mine`;

const APPOINTMENT_SELECT = `select a.*,
  case when s.appointment_id is null then null
       else json_build_object('appointment_id', s.appointment_id, 'registered_dogs', s.registered_dogs,
                              'waitlist_dogs', s.waitlist_dogs) end as summary,
  ${MINE_JSON}
  from appointments a left join appointment_summary s on s.appointment_id = a.id`;

const TRAIL_LIST_COLUMNS = `id, school_id, name, description, difficulty, surface, length_m::float8 as length_m,
  appointment_id, share_token, created_at, updated_at, route`;

// --- Operationen ---------------------------------------------------------------

export const OPS: Record<string, Op> = {
  // Profil und Mitgliedschaften
  'profile.me': {
    run: (tx) => first(tx, `select id, full_name, phone from profiles where id = auth.uid()`),
  },
  'profile.update': {
    async run(tx, p) {
      const data = input(p);
      return first(
        tx,
        `update profiles set full_name = coalesce($1, full_name), phone = $2 where id = auth.uid()
         returning id, full_name, phone`,
        [typeof data['full_name'] === 'string' ? data['full_name'].slice(0, 120) : null, data['phone'] ?? null],
      );
    },
  },
  'memberships.mine': {
    run: (tx) =>
      all(
        tx,
        `select m.user_id, m.school_id, m.role, json_build_object('id', s.id, 'name', s.name) as schools
         from memberships m join schools s on s.id = m.school_id
         where m.user_id = auth.uid() order by m.created_at`,
      ),
  },
  'school.create': {
    run: (tx, p) => scalar(tx, `select create_school($1)`, [str(p, 'name')]),
  },
  'school.rename': {
    async run(tx, p) {
      const row = await first(tx, `update schools set name = $1 where id = $2 returning id, name`, [
        str(p, 'name').trim(),
        uuid(p, 'schoolId'),
      ]);
      if (!row) throw new HttpError(403, 'Keine Berechtigung');
      return row;
    },
  },

  // Beitrittslink der Schule
  'school.joinInfo': {
    anon: true,
    run: (tx, p) => first(tx, `select * from school_join_info($1)`, [str(p, 'token')]),
  },
  'school.join': {
    run: (tx, p) => scalar(tx, `select join_school($1)`, [str(p, 'token')]),
  },
  'school.joinToken': {
    run: (tx, p) => scalar(tx, `select school_join_token($1)`, [uuid(p, 'schoolId')]),
  },
  'school.resetJoinToken': {
    run: (tx, p) =>
      scalar(tx, `select reset_school_join_token($1, $2)`, [uuid(p, 'schoolId'), p['enabled'] !== false]),
  },

  // Mitglieder (Trainer)
  'members.list': {
    run: (tx, p) =>
      all(
        tx,
        `select m.user_id, m.school_id, m.role,
           json_build_object('id', pr.id, 'full_name', pr.full_name, 'phone', pr.phone) as profiles,
           coalesce((select json_agg(d order by d.name) from dogs d where d.owner_id = m.user_id), '[]') as dogs
         from memberships m left join profiles pr on pr.id = m.user_id
         where m.school_id = $1 and ($2::text is null or m.role = $2)
         order by pr.full_name`,
        [uuid(p, 'schoolId'), p['role'] ?? null],
      ),
  },
  'members.setRole': {
    async run(tx, p) {
      const rows = await all(
        tx,
        `update memberships set role = $1 where school_id = $2 and user_id = $3 returning user_id`,
        [oneOf(p, 'role', ['trainer', 'customer'] as const), uuid(p, 'schoolId'), uuid(p, 'userId')],
      );
      if (!rows.length) throw new HttpError(403, 'Keine Berechtigung');
      return rows[0];
    },
  },
  'members.remove': {
    run: (tx, p) =>
      all(tx, `delete from memberships where school_id = $1 and user_id = $2`, [uuid(p, 'schoolId'), uuid(p, 'userId')]),
  },

  // Hunde
  'dogs.mine': {
    run: (tx) => all(tx, `select * from dogs where owner_id = auth.uid() order by name`),
  },
  'dogs.get': {
    run: (tx, p) => first(tx, `select * from dogs where id = $1`, [uuid(p, 'id')]),
  },
  'dogs.save': {
    run: (tx, p) => (p['id'] ? updateRow(tx, DOGS, uuid(p, 'id'), input(p)) : insertRow(tx, DOGS, input(p))),
  },
  'dogs.remove': {
    run: (tx, p) => all(tx, `delete from dogs where id = $1 and owner_id = auth.uid()`, [uuid(p, 'id')]),
  },

  // Termine
  'appointments.list': {
    run(tx, p) {
      const upcoming = oneOf(p, 'range', ['upcoming', 'past'] as const) === 'upcoming';
      return all(
        tx,
        `${APPOINTMENT_SELECT} where a.school_id = $1 and ${
          upcoming
            ? `a.starts_at >= now() - interval '6 hours' order by a.starts_at`
            : `a.starts_at < now() - interval '6 hours' order by a.starts_at desc limit 50`
        }`,
        [uuid(p, 'schoolId')],
      );
    },
  },
  'appointments.get': {
    run: (tx, p) => first(tx, `${APPOINTMENT_SELECT} where a.id = $1`, [uuid(p, 'id')]),
  },
  'appointments.participants': {
    run: (tx, p) =>
      all(
        tx,
        `select p.*, json_build_object('id', d.id, 'name', d.name, 'breed', d.breed) as dogs,
           json_build_object('id', pr.id, 'full_name', pr.full_name) as profiles
         from appointment_participants p
         join dogs d on d.id = p.dog_id
         left join profiles pr on pr.id = p.user_id
         where p.appointment_id = $1 order by p.created_at`,
        [uuid(p, 'id')],
      ),
  },
  'appointments.save': {
    run: (tx, p) =>
      p['id']
        ? updateRow(tx, APPOINTMENTS, uuid(p, 'id'), input(p))
        : insertRow(tx, APPOINTMENTS, input(p), { school_id: uuid(p, 'schoolId') }),
  },
  'appointments.setStatus': {
    run: (tx, p) =>
      updateRow(tx, { table: 'appointments', columns: ['status'] }, uuid(p, 'id'), {
        status: oneOf(p, 'status', ['planned', 'cancelled'] as const),
      }),
  },
  'appointments.remove': {
    run: (tx, p) => all(tx, `delete from appointments where id = $1`, [uuid(p, 'id')]),
  },
  'appointments.register': {
    run: (tx, p) =>
      all(tx, `select * from register_for_appointment($1, $2)`, [uuid(p, 'id'), uuids(p, 'dogIds')]),
  },
  'appointments.cancelRegistration': {
    run: (tx, p) => all(tx, `select cancel_registration($1, $2)`, [uuid(p, 'id'), uuids(p, 'dogIds')]),
  },
  'participants.setStatus': {
    run: (tx, p) =>
      updateRow(tx, { table: 'appointment_participants', columns: ['status'] }, uuid(p, 'id'), {
        status: oneOf(p, 'status', ['registered', 'waitlist', 'cancelled'] as const),
      }),
  },

  // Umfragen
  'polls.list': {
    run: (tx, p) =>
      all(
        tx,
        `select pl.*,
           coalesce((select json_agg(o order by o.starts_at) from poll_options o where o.poll_id = pl.id), '[]') as poll_options,
           exists (select 1 from poll_dogs pd where pd.poll_id = pl.id and pd.user_id = auth.uid()) as answered
         from polls pl where pl.school_id = $1 and pl.status <> 'finalized'
         order by pl.created_at desc`,
        [uuid(p, 'schoolId')],
      ),
  },
  'polls.get': {
    async run(tx, p) {
      const id = uuid(p, 'id');
      const poll = await first(tx, `select * from polls where id = $1`, [id]);
      if (!poll) return null;
      const options = await all(tx, `select * from poll_options where poll_id = $1 order by starts_at`, [id]);
      const summary = await all(tx, `select * from poll_option_summary where poll_id = $1`, [id]);
      const dogs = await all(tx, `select dog_id from poll_dogs where poll_id = $1 and user_id = auth.uid()`, [id]);
      const votes = await all(
        tx,
        `select v.poll_option_id, v.answer from poll_votes v join poll_options o on o.id = v.poll_option_id
         where o.poll_id = $1 and v.user_id = auth.uid()`,
        [id],
      );
      return {
        poll,
        options,
        summary,
        myDogIds: dogs.map((d) => d['dog_id']),
        myVotes: Object.fromEntries(votes.map((v) => [v['poll_option_id'], v['answer']])),
      };
    },
  },
  'polls.responses': {
    async run(tx, p) {
      const id = uuid(p, 'id');
      const votes = await all(
        tx,
        `select v.poll_option_id, v.user_id, v.answer,
           json_build_object('id', pr.id, 'full_name', pr.full_name) as profiles
         from poll_votes v join poll_options o on o.id = v.poll_option_id
         left join profiles pr on pr.id = v.user_id
         where o.poll_id = $1`,
        [id],
      );
      const dogs = await all(
        tx,
        `select pd.poll_id, pd.user_id, pd.dog_id, json_build_object('id', d.id, 'name', d.name) as dogs
         from poll_dogs pd join dogs d on d.id = pd.dog_id where pd.poll_id = $1`,
        [id],
      );
      return { votes, dogs };
    },
  },
  'polls.create': {
    async run(tx, p) {
      const options = p['options'];
      if (!Array.isArray(options) || !options.length) throw new HttpError(400, 'Mindestens ein Terminvorschlag');
      const poll = await insertRow(tx, POLLS, input(p), { school_id: uuid(p, 'schoolId') });
      for (const o of options) await insertRow(tx, POLL_OPTIONS, o as Params, { poll_id: poll['id'] });
      return poll;
    },
  },
  'polls.setStatus': {
    run: (tx, p) =>
      updateRow(tx, { table: 'polls', columns: ['status'] }, uuid(p, 'id'), {
        status: oneOf(p, 'status', ['open', 'closed'] as const),
      }),
  },
  'polls.remove': {
    run: (tx, p) => all(tx, `delete from polls where id = $1`, [uuid(p, 'id')]),
  },
  'polls.submit': {
    run: (tx, p) =>
      all(tx, `select submit_poll_response($1, $2, $3)`, [
        uuid(p, 'id'),
        uuids(p, 'dogIds'),
        JSON.stringify(p['votes'] ?? []),
      ]),
  },
  'polls.finalize': {
    run: (tx, p) => scalar(tx, `select finalize_poll($1, $2)`, [uuid(p, 'id'), uuid(p, 'optionId')]),
  },

  // Trails
  'trails.list': {
    run: (tx, p) =>
      all(
        tx,
        `select ${TRAIL_LIST_COLUMNS} from trails
         where school_id = $1 and ($2::uuid is null or appointment_id = $2)
         order by updated_at desc`,
        [uuid(p, 'schoolId'), optUuid(p, 'appointmentId')],
      ),
  },
  'trails.get': {
    run: (tx, p) => first(tx, `select * from trails where id = $1`, [uuid(p, 'id')]),
  },
  'trails.save': {
    run: (tx, p) =>
      p['id']
        ? updateRow(tx, TRAILS, uuid(p, 'id'), input(p))
        : insertRow(tx, TRAILS, input(p), { school_id: uuid(p, 'schoolId') }),
  },
  'trails.remove': {
    run: (tx, p) => all(tx, `delete from trails where id = $1`, [uuid(p, 'id')]),
  },
  'trails.assignments': {
    run: (tx, p) =>
      all(
        tx,
        `select ta.*, json_build_object('id', pr.id, 'full_name', pr.full_name) as profiles
         from trail_assignments ta left join profiles pr on pr.id = ta.customer_id
         where ta.trail_id = $1 order by ta.created_at`,
        [uuid(p, 'id')],
      ),
  },
  'trails.assign': {
    async run(tx, p) {
      const trailId = uuid(p, 'id');
      const message = typeof p['message'] === 'string' && p['message'].trim() ? p['message'].trim() : null;
      for (const customer of uuids(p, 'customerIds')) {
        await tx.query(
          `insert into trail_assignments (trail_id, customer_id, message) values ($1, $2, $3)
           on conflict (trail_id, customer_id) do update set message = excluded.message`,
          [trailId, customer, message],
        );
      }
      return { ok: true };
    },
  },
  'trails.unassign': {
    run: (tx, p) => all(tx, `delete from trail_assignments where id = $1`, [uuid(p, 'id')]),
  },
  'trails.mine': {
    run: (tx, p) =>
      all(
        tx,
        `select ta.*, (select row_to_json(t) from (select ${TRAIL_LIST_COLUMNS} from trails where id = ta.trail_id) t) as trails
         from trail_assignments ta join trails tr on tr.id = ta.trail_id
         where ta.customer_id = auth.uid() and tr.school_id = $1
         order by ta.created_at desc`,
        [uuid(p, 'schoolId')],
      ),
  },
  'trails.markSeen': {
    run: (tx, p) => all(tx, `select mark_trail_seen($1)`, [uuid(p, 'id')]),
  },
  'trails.enableShare': {
    run: (tx, p) => scalar(tx, `select enable_trail_share($1)`, [uuid(p, 'id')]),
  },
  'trails.disableShare': {
    run: (tx, p) => updateRow(tx, { table: 'trails', columns: ['share_token'] }, uuid(p, 'id'), { share_token: null }),
  },
  'trails.shared': {
    anon: true,
    run: (tx, p) => scalar(tx, `select get_shared_trail($1)`, [str(p, 'token')]),
  },

  // Konto
  'account.delete': {
    run: (tx) => all(tx, `select delete_my_account()`),
  },
};
