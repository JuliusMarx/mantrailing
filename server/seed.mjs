// Testdaten für die lokale Entwicklungsdatenbank (nur lokal, nie in Produktion).
//
// Test-Logins (Passwort für alle: Trail-Test-2026!)
//   trainer@mantrailing.test  – Trainerin der "Spürnasen Mantrailing"
//   kunde@mantrailing.test    – Kundin mit den Hunden Luna und Balu
//   kunde2@mantrailing.test   – Kunde mit dem Hund Rex

export const TEST_PASSWORD = 'Trail-Test-2026!';
export const TEST_USERS = {
  trainer: { email: 'trainer@mantrailing.test', full_name: 'Tina Trainerin' },
  kunde: { email: 'kunde@mantrailing.test', full_name: 'Karla Kundin' },
  kunde2: { email: 'kunde2@mantrailing.test', full_name: 'Konrad Kunde' },
};

/** Kleiner API-Client gegen den Handler (ohne HTTP). */
export function client(handle, token = null) {
  async function post(path, body = {}) {
    const res = await handle(
      new Request(`http://localhost/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    );
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return {
    post,
    op: async (name, params = {}) => (await post(`/op/${name}`, params)).data,
  };
}

async function signup(handle, user) {
  const { token, user: u } = await client(handle).post('/auth/signup', { ...user, password: TEST_PASSWORD });
  return { token, id: u.id, api: client(handle, token) };
}

const day = (offset, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export async function seedIfEmpty(handle) {
  try {
    await client(handle).post('/auth/login', { email: TEST_USERS.trainer.email, password: TEST_PASSWORD });
    return; // schon vorhanden
  } catch {
    // weiter: anlegen
  }
  const trainer = await signup(handle, TEST_USERS.trainer);
  const kunde = await signup(handle, TEST_USERS.kunde);
  const kunde2 = await signup(handle, TEST_USERS.kunde2);

  const schoolId = await trainer.api.op('school.create', { name: 'Spürnasen Mantrailing' });
  for (const k of [kunde, kunde2]) {
    const email = k === kunde ? TEST_USERS.kunde.email : TEST_USERS.kunde2.email;
    const inv = await trainer.api.op('invitations.create', { schoolId, email, role: 'customer' });
    await k.api.op('invitation.accept', { token: inv.token });
  }

  await kunde.api.op('dogs.save', { input: { name: 'Luna', breed: 'Labrador Retriever', birth_date: '2021-04-12' } });
  await kunde.api.op('dogs.save', { input: { name: 'Balu', breed: 'Beagle', birth_date: '2019-09-03' } });
  await kunde2.api.op('dogs.save', { input: { name: 'Rex', breed: 'Deutscher Schäferhund', birth_date: '2020-01-20' } });

  await trainer.api.op('appointments.save', {
    schoolId,
    input: {
      title: 'Stadttrail Innenstadt',
      starts_at: day(4, 9),
      ends_at: day(4, 12),
      meeting_point: { type: 'Point', coordinates: [8.6821, 50.1109] },
      meeting_address: 'Römerberg, Frankfurt am Main',
      max_dogs: 3,
      notes: 'Bitte Geruchsartikel in einer Tüte mitbringen.',
    },
  });
  await trainer.api.op('polls.create', {
    schoolId,
    input: {
      title: 'Waldtrail im Stadtwald',
      description: 'Langer Trail mit 2 h Liegezeit.',
      meeting_address: 'Parkplatz Oberschweinstiege',
      deadline: day(5, 20),
    },
    options: [
      { starts_at: day(9, 9), ends_at: day(9, 12), max_dogs: 5 },
      { starts_at: day(9, 14), ends_at: day(9, 17), max_dogs: 5 },
      { starts_at: day(10, 10), ends_at: day(10, 13), max_dogs: 5 },
    ],
  });
  console.log('Testdaten angelegt (Logins siehe server/seed.mjs).');
}
