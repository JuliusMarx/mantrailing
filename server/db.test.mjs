// Datenbank-Tests (Policies, Trigger, RPCs) direkt in SQL gegen PGlite.
// Start: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openPglite } from "./pglite-db.mjs";

let db;
const ids = {};

async function asAdmin() {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
}
async function asUser(userId) {
  await db.exec(`reset role;`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await db.exec(`set role authenticated;`);
}
async function asAnon() {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false); set role anon;`);
}
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function one(sql, params = []) {
  return (await rows(sql, params))[0];
}
async function createUser(email, name) {
  await asAdmin();
  const r = await one(
    `insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, 'x', $2) returning id`,
    [email, { full_name: name }],
  );
  return r.id;
}
async function addDog(owner, name) {
  await asUser(owner);
  return (await one(`insert into dogs (name) values ($1) returning id`, [name])).id;
}

before(async () => {
  db = await openPglite();

  ids.trainer = await createUser('trainer@test.local', 'Tina Trainer');
  ids.alice = await createUser('alice@test.local', 'Alice Kundin');
  ids.bob = await createUser('bob@test.local', 'Bob Kunde');
  ids.otherTrainer = await createUser('other@test.local', 'Otto Andere Schule');

  await asUser(ids.trainer);
  ids.school = (await one(`select create_school('Spürnasen') as id`)).id;
  await asUser(ids.otherTrainer);
  ids.otherSchool = (await one(`select create_school('Andere Schule') as id`)).id;

  // Über den Beitrittslink der Schule beitreten
  await asUser(ids.trainer);
  ids.joinToken = (await one(`select school_join_token($1) as t`, [ids.school])).t;
  for (const user of [ids.alice, ids.bob]) {
    await asUser(user);
    await db.query(`select join_school($1)`, [ids.joinToken]);
  }

  ids.aliceDog1 = await addDog(ids.alice, 'Luna');
  ids.aliceDog2 = await addDog(ids.alice, 'Balu');
  ids.bobDog1 = await addDog(ids.bob, 'Rex');
  ids.bobDog2 = await addDog(ids.bob, 'Kira');
  ids.otherDog = await addDog(ids.otherTrainer, 'Fremd');
});

test('Profil wird beim Anlegen eines Users erzeugt', async () => {
  await asUser(ids.alice);
  const me = await one(`select full_name from profiles where id = $1`, [ids.alice]);
  assert.equal(me.full_name, 'Alice Kundin');
});

test('Beitrittslink: nur Trainer sehen ihn, Erneuern macht den alten ungültig', async () => {
  // Kund:innen sehen den Token weder direkt noch über die Funktion
  await asUser(ids.alice);
  await assert.rejects(db.query(`select join_token from schools`), /permission denied/);
  await assert.rejects(db.query(`select school_join_token($1)`, [ids.school]), /Keine Berechtigung/);
  await assert.rejects(db.query(`select reset_school_join_token($1, true)`, [ids.school]), /Keine Berechtigung/);

  // Erneut beitreten ändert nichts; eine Trainerin bleibt Trainerin
  await db.query(`select join_school($1)`, [ids.joinToken]);
  await asUser(ids.trainer);
  await db.query(`select join_school($1)`, [ids.joinToken]);
  const role = await one(`select role from memberships where user_id = $1 and school_id = $2`, [ids.trainer, ids.school]);
  assert.equal(role.role, 'trainer');

  const newToken = (await one(`select reset_school_join_token($1, true) as t`, [ids.school])).t;
  assert.notEqual(newToken, ids.joinToken);
  const outsider = await createUser('neu@test.local', 'Neu');
  await asUser(outsider);
  await assert.rejects(db.query(`select join_school($1)`, [ids.joinToken]), /ungültig/);
  await db.query(`select join_school($1)`, [newToken]);
  const m = await one(`select role from memberships where user_id = $1`, [outsider]);
  assert.equal(m.role, 'customer');

  // Abschalten
  await asUser(ids.trainer);
  assert.equal((await one(`select reset_school_join_token($1, false) as t`, [ids.school])).t, null);
  await asAnon();
  assert.equal((await rows(`select * from school_join_info($1)`, [newToken])).length, 0);
  // wieder einschalten für die folgenden Tests
  await asUser(ids.trainer);
  ids.joinToken = (await one(`select reset_school_join_token($1, true) as t`, [ids.school])).t;
});

test('Kunde sieht nur eigene Hunde, Trainer die Hunde seiner Kunden', async () => {
  await asUser(ids.alice);
  const aliceDogs = await rows(`select name from dogs order by name`);
  assert.deepEqual(aliceDogs.map((d) => d.name), ['Balu', 'Luna']);

  await asUser(ids.trainer);
  const trainerDogs = await rows(`select name from dogs order by name`);
  assert.deepEqual(trainerDogs.map((d) => d.name), ['Balu', 'Kira', 'Luna', 'Rex']);
});

test('Kunde sieht keine fremden Schulen und kann keine Termine anlegen', async () => {
  await asUser(ids.alice);
  const schools = await rows(`select name from schools`);
  assert.deepEqual(schools.map((s) => s.name), ['Spürnasen']);
  await assert.rejects(
    db.query(`insert into appointments (school_id, title, starts_at) values ($1, 'x', now() + interval '1 day')`, [
      ids.school,
    ]),
    /row-level security/,
  );
});

test('Anmeldung mit fremdem Hund wird abgelehnt', async () => {
  await asUser(ids.trainer);
  const appt = await one(
    `insert into appointments (school_id, title, starts_at, max_dogs) values ($1, 'Fremdtest', now() + interval '2 days', 5) returning id`,
    [ids.school],
  );
  await asUser(ids.alice);
  await assert.rejects(
    db.query(`select * from register_for_appointment($1, $2)`, [appt.id, [ids.bobDog1]]),
    /gehört nicht dir/,
  );
});

test('Kapazität zählt Hunde, Warteliste und Nachrücken', async () => {
  await asUser(ids.trainer);
  const appt = await one(
    `insert into appointments (school_id, title, starts_at, max_dogs) values ($1, 'Samstag', now() + interval '3 days', 3) returning id`,
    [ids.school],
  );

  await asUser(ids.alice);
  const a = await rows(`select * from register_for_appointment($1, $2)`, [appt.id, [ids.aliceDog1, ids.aliceDog2]]);
  assert.deepEqual(a.map((r) => r.status), ['registered', 'registered']);

  await asUser(ids.bob);
  await db.query(`select * from register_for_appointment($1, $2)`, [appt.id, [ids.bobDog1]]);
  await db.query(`select * from register_for_appointment($1, $2)`, [appt.id, [ids.bobDog2]]);
  const bobRows = await rows(
    `select dog_id, status from appointment_participants where appointment_id = $1 order by created_at`,
    [appt.id],
  );
  assert.deepEqual(bobRows.map((r) => r.status), ['registered', 'waitlist']);

  // Kunde sieht nur eigene Anmeldungen, aber die Zusammenfassung
  const summary = await one(`select * from appointment_summary where appointment_id = $1`, [appt.id]);
  assert.equal(summary.registered_dogs, 3);
  assert.equal(summary.waitlist_dogs, 1);

  await asUser(ids.alice);
  await db.query(`select cancel_registration($1, $2)`, [appt.id, [ids.aliceDog2]]);

  await asUser(ids.trainer);
  const kira = await one(`select status from appointment_participants where appointment_id = $1 and dog_id = $2`, [
    appt.id,
    ids.bobDog2,
  ]);
  assert.equal(kira.status, 'registered');
});

test('Anmeldung geht bis zum Beginn, auch am selben Tag – danach nicht mehr', async () => {
  await asUser(ids.trainer);
  const soon = await one(
    `insert into appointments (school_id, title, starts_at, registration_deadline)
     values ($1, 'Gleich', now() + interval '30 minutes', now() - interval '1 day') returning id`,
    [ids.school],
  );
  const started = await one(
    `insert into appointments (school_id, title, starts_at) values ($1, 'Läuft schon', now() - interval '5 minutes') returning id`,
    [ids.school],
  );
  await asUser(ids.alice);
  // ein alter Anmeldeschluss spielt keine Rolle mehr
  const r = await rows(`select * from register_for_appointment($1, $2)`, [soon.id, [ids.aliceDog1]]);
  assert.equal(r[0].status, 'registered');
  await assert.rejects(
    db.query(`select * from register_for_appointment($1, $2)`, [started.id, [ids.aliceDog1]]),
    /schon begonnen/,
  );
});

test('Umfrage: abstimmen, Zusammenfassung, festlegen', async () => {
  await asUser(ids.trainer);
  const poll = await one(
    `insert into polls (school_id, title) values ($1, 'Wald-Trail') returning id`,
    [ids.school],
  );
  const opts = await rows(
    `insert into poll_options (poll_id, starts_at, max_dogs) values
       ($1, now() + interval '5 days', 2), ($1, now() + interval '6 days', 2), ($1, now() + interval '7 days', 2)
     returning id`,
    [poll.id],
  );

  await asUser(ids.alice);
  await db.query(`select submit_poll_response($1, $2, $3)`, [
    poll.id,
    [ids.aliceDog1, ids.aliceDog2],
    JSON.stringify([
      { option_id: opts[0].id, answer: 'yes' },
      { option_id: opts[1].id, answer: 'no' },
    ]),
  ]);
  await asUser(ids.bob);
  await db.query(`select submit_poll_response($1, $2, $3)`, [
    poll.id,
    [ids.bobDog1],
    JSON.stringify([{ option_id: opts[0].id, answer: 'maybe' }]),
  ]);
  await assert.rejects(
    db.query(`select submit_poll_response($1, $2, '[]')`, [poll.id, [ids.aliceDog1]]),
    /gehört nicht dir/,
  );
  // Kunde darf nicht direkt in poll_votes schreiben
  await assert.rejects(
    db.query(`insert into poll_votes (poll_option_id, user_id, answer) values ($1, $2, 'yes')`, [opts[1].id, ids.bob]),
    /permission denied/,
  );

  const s = await one(`select * from poll_option_summary where poll_option_id = $1`, [opts[0].id]);
  assert.equal(s.yes_dogs, 2);
  assert.equal(s.maybe_dogs, 1);

  await assert.rejects(db.query(`select finalize_poll($1, $2)`, [poll.id, opts[0].id]), /Keine Berechtigung/);

  await asUser(ids.trainer);
  const { finalize_poll: apptId } = await one(`select finalize_poll($1, $2)`, [poll.id, opts[0].id]);
  const parts = await rows(
    `select dog_id, status from appointment_participants where appointment_id = $1 order by status, dog_id`,
    [apptId],
  );
  const byDog = Object.fromEntries(parts.map((p) => [p.dog_id, p.status]));
  assert.equal(byDog[ids.aliceDog1], 'registered');
  assert.equal(byDog[ids.aliceDog2], 'registered');
  assert.equal(byDog[ids.bobDog1], 'waitlist');
  const finalPoll = await one(`select status, appointment_id from polls where id = $1`, [poll.id]);
  assert.equal(finalPoll.status, 'finalized');
  assert.equal(finalPoll.appointment_id, apptId);

  await asUser(ids.alice);
  await assert.rejects(
    db.query(`select submit_poll_response($1, $2, '[]')`, [poll.id, [ids.aliceDog1]]),
    /geschlossen/,
  );
});

test('Abstimmen nur für Vorschläge, die noch nicht begonnen haben', async () => {
  await asUser(ids.trainer);
  // alte Abstimmungsfrist wird ignoriert
  const poll = await one(
    `insert into polls (school_id, title, deadline) values ($1, 'Heute', now() - interval '1 day') returning id`,
    [ids.school],
  );
  const [past, later] = await rows(
    `insert into poll_options (poll_id, starts_at) values ($1, now() - interval '1 hour'), ($1, now() + interval '2 hours')
     returning id`,
    [poll.id],
  );
  await asUser(ids.alice);
  await db.query(`select submit_poll_response($1, $2, $3)`, [
    poll.id,
    [ids.aliceDog1],
    JSON.stringify([
      { option_id: past.id, answer: 'yes' },
      { option_id: later.id, answer: 'yes' },
    ]),
  ]);
  const votes = await rows(`select poll_option_id from poll_votes where user_id = $1 and poll_option_id = any ($2)`, [
    ids.alice,
    [past.id, later.id],
  ]);
  assert.deepEqual(votes.map((v) => v.poll_option_id), [later.id]);

  // nur noch vergangene Vorschläge → geschlossen
  await asUser(ids.trainer);
  const old = await one(`insert into polls (school_id, title) values ($1, 'Vorbei') returning id`, [ids.school]);
  await db.query(`insert into poll_options (poll_id, starts_at) values ($1, now() - interval '1 day')`, [old.id]);
  await asUser(ids.alice);
  await assert.rejects(
    db.query(`select submit_poll_response($1, $2, '[]')`, [old.id, [ids.aliceDog1]]),
    /Vergangenheit/,
  );
});

test('Trails: Länge, Sichtbarkeit über Zuweisung, öffentlicher Link', async () => {
  await asUser(ids.trainer);
  // ca. 111 m nach Norden
  const route = { type: 'LineString', coordinates: [[8.0, 50.0], [8.0, 50.001]] };
  const trail = await one(
    `insert into trails (school_id, name, route) values ($1, 'Parkrunde', $2) returning id, length_m`,
    [ids.school, route],
  );
  assert.ok(Math.abs(Number(trail.length_m) - 111.2) < 0.5, `length_m = ${trail.length_m}`);
  await one(`insert into trails (school_id, name, route) values ($1, 'Geheim', $2) returning id`, [ids.school, route]);

  await asUser(ids.alice);
  assert.equal((await rows(`select id from trails`)).length, 0);

  await asUser(ids.trainer);
  await db.query(`insert into trail_assignments (trail_id, customer_id, message) values ($1, $2, 'Bitte legen')`, [
    trail.id,
    ids.alice,
  ]);
  // Zuweisung an jemanden außerhalb der Schule ist nicht erlaubt
  await assert.rejects(
    db.query(`insert into trail_assignments (trail_id, customer_id) values ($1, $2)`, [trail.id, ids.otherTrainer]),
    /row-level security/,
  );

  await asUser(ids.alice);
  const visible = await rows(`select name from trails`);
  assert.deepEqual(visible.map((t) => t.name), ['Parkrunde']);
  await assert.rejects(db.query(`select enable_trail_share($1)`, [trail.id]), /Keine Berechtigung/);
  await db.query(`select mark_trail_seen($1)`, [trail.id]);
  const seen = await one(`select seen_at from trail_assignments where trail_id = $1`, [trail.id]);
  assert.ok(seen.seen_at);

  await asUser(ids.otherTrainer);
  assert.equal((await rows(`select id from trails`)).length, 0);

  await asUser(ids.trainer);
  const { enable_trail_share: token } = await one(`select enable_trail_share($1)`, [trail.id]);
  assert.equal(token.length, 64);

  await asAnon();
  const shared = await one(`select get_shared_trail($1) as t`, [token]);
  assert.equal(shared.t.name, 'Parkrunde');
  assert.equal(shared.t.school_name, 'Spürnasen');
  assert.equal((await one(`select get_shared_trail('falsch') as t`)).t, null);
  await assert.rejects(db.query(`select * from trails`), /permission denied/);

  await asUser(ids.trainer);
  await db.query(`update trails set share_token = null where id = $1`, [trail.id]);
  await asAnon();
  assert.equal((await one(`select get_shared_trail($1) as t`, [token])).t, null);
});

test('Kunde kann Rollen nicht ändern', async () => {
  await asUser(ids.alice);
  const res = await db.query(`update memberships set role = 'trainer' where user_id = $1`, [ids.alice]);
  assert.equal(res.affectedRows, 0);
});
