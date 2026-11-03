// API-Tests: echter Handler (wie in der Netlify Function) gegen PGlite mit Testdaten.
// Start: npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../netlify/lib/handler.mts';
import { openPglite, pgliteDb } from './pglite-db.mjs';
import { client, seedIfEmpty, TEST_PASSWORD, TEST_USERS } from './seed.mjs';

let handle;
const api = {};

async function login(key) {
  const { token } = await client(handle).post('/auth/login', { email: TEST_USERS[key].email, password: TEST_PASSWORD });
  return client(handle, token);
}

before(async () => {
  handle = createHandler(pgliteDb(await openPglite()));
  await seedIfEmpty(handle);
  for (const key of Object.keys(TEST_USERS)) api[key] = await login(key);
  api.anon = client(handle);
  const [membership] = await api.trainer.op('memberships.mine');
  api.schoolId = membership.school_id;
});

test('Login: falsches Passwort und unbekannte E-Mail', async () => {
  await assert.rejects(
    client(handle).post('/auth/login', { email: TEST_USERS.kunde.email, password: 'falsch-falsch' }),
    /falsch/,
  );
  await assert.rejects(client(handle).post('/auth/login', { email: 'nix@test.local', password: 'x' }), /falsch/);
});

test('Registrierung: doppelte E-Mail und zu kurzes Passwort', async () => {
  await assert.rejects(
    client(handle).post('/auth/signup', { email: TEST_USERS.kunde.email, password: 'langes-passwort' }),
    /schon ein Konto/,
  );
  await assert.rejects(client(handle).post('/auth/signup', { email: 'neu@test.local', password: 'kurz' }), /8 Zeichen/);
});

test('Ohne Login keine Daten, manipuliertes Token wird abgelehnt', async () => {
  await assert.rejects(api.anon.op('dogs.mine'), (e) => e.status === 401);
  await assert.rejects(client(handle, 'abc.def').op('dogs.mine'), (e) => e.status === 401);
});

test('Profil und Mitgliedschaft der Kundin', async () => {
  const me = await api.kunde.op('profile.me');
  assert.equal(me.full_name, 'Karla Kundin');
  const memberships = await api.kunde.op('memberships.mine');
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].role, 'customer');
  assert.equal(memberships[0].schools.name, 'Spürnasen Mantrailing');
});

test('Hunde: Geburtsdatum bleibt ein Datum, fremde Hunde sind unsichtbar', async () => {
  const dogs = await api.kunde.op('dogs.mine');
  assert.deepEqual(dogs.map((d) => d.name), ['Balu', 'Luna']);
  assert.equal(dogs.find((d) => d.name === 'Luna').birth_date, '2021-04-12');
  assert.equal(await api.kunde2.op('dogs.get', { id: dogs[0].id }), null);
  await assert.rejects(api.kunde2.op('dogs.save', { id: dogs[0].id, input: { name: 'Geklaut' } }), (e) => e.status === 404);
});

test('Kundin kann keine Termine anlegen', async () => {
  await assert.rejects(
    api.kunde.op('appointments.save', { schoolId: api.schoolId, input: { title: 'x', starts_at: new Date().toISOString() } }),
    (e) => e.status === 403,
  );
});

test('Anmeldung mit mehreren Hunden, Warteliste nach Hunden', async () => {
  const [appt] = await api.kunde.op('appointments.list', { schoolId: api.schoolId, range: 'upcoming' });
  assert.equal(appt.max_dogs, 3);
  const dogs = await api.kunde.op('dogs.mine');
  const result = await api.kunde.op('appointments.register', { id: appt.id, dogIds: dogs.map((d) => d.id) });
  assert.deepEqual(result.map((r) => r.status), ['registered', 'registered']);

  const [rex] = await api.kunde2.op('dogs.mine');
  await api.kunde2.op('appointments.register', { id: appt.id, dogIds: [rex.id] });
  const after = await api.kunde2.op('appointments.get', { id: appt.id });
  assert.equal(after.summary.registered_dogs, 3);
  assert.equal(after.mine.length, 1);
  assert.equal(after.mine[0].dogs.name, 'Rex');

  // Kunde2 sieht nur die eigene Anmeldung, die Trainerin alle drei
  const all = await api.trainer.op('appointments.participants', { id: appt.id });
  assert.equal(all.length, 3);
  assert.ok(all.every((p) => p.profiles.full_name && p.dogs.name));
});

test('Umfrage: abstimmen mit Hunden und festlegen', async () => {
  const [poll] = await api.kunde.op('polls.list', { schoolId: api.schoolId });
  assert.equal(poll.answered, false);
  assert.equal(poll.poll_options.length, 3);
  const dogs = await api.kunde.op('dogs.mine');
  await api.kunde.op('polls.submit', {
    id: poll.id,
    dogIds: dogs.map((d) => d.id),
    votes: poll.poll_options.map((o, i) => ({ option_id: o.id, answer: i === 0 ? 'yes' : 'no' })),
  });
  const detail = await api.kunde.op('polls.get', { id: poll.id });
  assert.equal(detail.myDogIds.length, 2);
  assert.equal(detail.myVotes[poll.poll_options[0].id], 'yes');
  assert.equal(detail.summary.find((s) => s.poll_option_id === poll.poll_options[0].id).yes_dogs, 2);

  const responses = await api.trainer.op('polls.responses', { id: poll.id });
  assert.equal(responses.dogs.length, 2);
  await assert.rejects(api.kunde.op('polls.finalize', { id: poll.id, optionId: poll.poll_options[0].id }), /Berechtigung/);

  const apptId = await api.trainer.op('polls.finalize', { id: poll.id, optionId: poll.poll_options[0].id });
  const appt = await api.kunde.op('appointments.get', { id: apptId });
  assert.equal(appt.mine.length, 2);
  assert.ok(appt.mine.every((p) => p.status === 'registered'));
});

test('Trails: speichern, zuweisen, teilen, öffentlicher Link', async () => {
  const route = { type: 'LineString', coordinates: [[8.68, 50.11], [8.68, 50.111]] };
  const waypoints = [
    { id: 'a', lng: 8.68, lat: 50.11, type: 'start' },
    { id: 'b', lng: 8.68, lat: 50.111, type: 'hide', note: 'hinter der Bank' },
  ];
  const segments = [{ mode: 'straight', coords: route.coordinates }];
  const trail = await api.trainer.op('trails.save', {
    schoolId: api.schoolId,
    input: { name: 'Römerrunde', route, waypoints, segments, difficulty: 2 },
  });
  assert.ok(Math.abs(trail.length_m - 111.2) < 0.5);
  const loaded = await api.trainer.op('trails.get', { id: trail.id });
  assert.deepEqual(loaded.waypoints, waypoints);
  assert.deepEqual(loaded.segments, segments);

  assert.equal(await api.kunde.op('trails.get', { id: trail.id }), null);
  const kunde = (await api.kunde.op('profile.me')).id;
  await api.trainer.op('trails.assign', { id: trail.id, customerIds: [kunde], message: 'Bitte Samstag legen' });
  const mine = await api.kunde.op('trails.mine', { schoolId: api.schoolId });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].trails.name, 'Römerrunde');
  assert.equal(mine[0].message, 'Bitte Samstag legen');
  assert.equal((await api.kunde2.op('trails.mine', { schoolId: api.schoolId })).length, 0);

  await assert.rejects(api.kunde.op('trails.enableShare', { id: trail.id }), /Berechtigung/);
  const token = await api.trainer.op('trails.enableShare', { id: trail.id });
  const shared = await api.anon.op('trails.shared', { token });
  assert.equal(shared.name, 'Römerrunde');
  await api.trainer.op('trails.disableShare', { id: trail.id });
  assert.equal(await api.anon.op('trails.shared', { token }), null);
});

test('Beitrittslink: Schulname ohne Login, Beitritt als Kundin', async () => {
  const token = await api.trainer.op('school.joinToken', { schoolId: api.schoolId });
  const info = await api.anon.op('school.joinInfo', { token });
  assert.equal(info.school_name, 'Spürnasen Mantrailing');
  await assert.rejects(api.kunde.op('school.joinToken', { schoolId: api.schoolId }), /Berechtigung/);
  await assert.rejects(api.anon.op('school.join', { token }), (e) => e.status === 401);

  const { token: auth } = await client(handle).post('/auth/signup', { email: 'neu@test.local', password: 'langes-passwort', full_name: 'Nina Neu' });
  const neu = client(handle, auth);
  assert.equal(await neu.op('school.join', { token }), api.schoolId);
  const [m] = await neu.op('memberships.mine');
  assert.equal(m.role, 'customer');
  await assert.rejects(neu.op('school.join', { token: 'x'.repeat(32) }), /ungültig/);

  // Umbenennen geht trotz gesperrter join_token-Spalte
  const renamed = await api.trainer.op('school.rename', { schoolId: api.schoolId, name: 'Spürnasen Mantrailing' });
  assert.equal(renamed.name, 'Spürnasen Mantrailing');
  await assert.rejects(api.kunde.op('school.rename', { schoolId: api.schoolId, name: 'Gekapert' }), /Berechtigung/);
});

test('Passwort: Trainerin setzt zurück, Kundin ändert selbst', async () => {
  const kundeId = (await api.kunde2.op('profile.me')).id;
  await assert.rejects(api.kunde.post('/auth/reset-password', { user_id: kundeId }), (e) => e.status === 403);
  const { password } = await api.trainer.post('/auth/reset-password', { user_id: kundeId });
  const { token } = await client(handle).post('/auth/login', { email: TEST_USERS.kunde2.email, password });
  const k2 = client(handle, token);
  await k2.post('/auth/password', { current_password: password, new_password: TEST_PASSWORD });
  await login('kunde2');
});

test('Konto löschen: Token danach ungültig', async () => {
  const { token } = await client(handle).post('/auth/signup', { email: 'weg@test.local', password: 'langes-passwort', full_name: 'Weg' });
  const tmp = client(handle, token);
  await tmp.op('account.delete');
  await assert.rejects(tmp.op('profile.me'), (e) => e.status === 401);
});
