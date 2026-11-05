# Mantrailing

Mobile Web-App (PWA) für Mantrailing-Hundeschulen: Trails auf der Karte einzeichnen und verschicken, Termine und Terminumfragen mit Hunde-Anmeldung.

- **Trainer:innen** zeichnen Trails (Punkte tippen, die Route folgt den Wegen oder geht als Luftlinie), zeichnen sie per GPS auf, schicken sie Kund:innen oder teilen sie per Link. Sie legen Termine und Umfragen an und verwalten Kund:innen.
- **Kund:innen** verwalten ihr Konto und ihre Hunde, melden sich mit einem oder mehreren Hunden zu Terminen an, stimmen in Umfragen ab und laufen zugewiesene Trails mit Live-Position.
- **Mehrere Hundeschulen** nutzen die App getrennt voneinander. Die Rechte regelt Row-Level-Security in Postgres.

## Stack

| Teil | Technik |
| --- | --- |
| Frontend | Angular 21, Ionic 8 (standalone), Signals, PWA |
| Karte | MapLibre GL, OpenFreeMap (Vektor), OpenTopoMap, Esri-Satellit |
| Backend | Netlify Functions (`netlify/functions/api.mts`) mit eigenem Login (scrypt + signierte Tokens) |
| Datenbank | Netlify Database (Postgres) mit Row-Level-Security; Migrationen in `netlify/database/migrations` |
| Routing | Valhalla der FOSSGIS (`valhalla1.openstreetmap.de`, Profil pedestrian, ohne API-Key) |
| Ortssuche | Nominatim (OpenStreetMap) |

Keine externen Konten nötig: Netlify legt die Datenbank beim Deploy an und führt die Migrationen aus.

## Entwicklung

```bash
npm install
npm run dev          # API mit lokaler Datenbank (PGlite, .data/) + App auf http://localhost:4310
npm test             # Unit-Tests (Vitest): Editor-Logik, GPS-Aufnahme, Geo-Funktionen
npm run test:db      # Datenbank- und API-Tests gegen PGlite
npm run build        # Produktions-Build nach dist/mantrailing/browser
```

Lokal werden beim ersten Start Testdaten angelegt; die Test-Logins stehen in `server/seed.mjs`.
Im Entwicklungsmodus lässt sich der Trail-Editor unter `/dev/editor` ohne Login ausprobieren.

**Backoffice:** Das Konto `admin-7f3k9@mantrailing.app` wird bei der Registrierung automatisch Admin (nur solange es noch keinen Admin gibt). Admins sehen im Menü „Backoffice“ und können dort alle Hundeschulen, Nutzer:innen und Hunde verwalten.

**Login:** E-Mail und Passwort, ohne Bestätigungsmail. Kund:innen treten über den Beitrittslink der Schule bei (Trainer:in → „Kunden“ → Personen-Symbol). Vergessene Passwörter setzt eine Trainerin oder ein Trainer unter „Kunden“ zurück (die App zeigt ein Einmal-Passwort an).

## Aufbau

```
src/app/
  core/                    API-Client, Auth, Guards, Modelle, Geo-Funktionen, Routing
  core/data/               Datendienste je Bereich (Hunde, Termine, Umfragen, Trails, Schule)
  shared/map/              MapLibre-Komponente (Linien und Marker deklarativ)
  shared/trail-view/       Trail-Ansicht mit Live-Position und Abweichungswarnung
  features/trails/editor/  Trail-Editor: TrailEditorStore (Logik), TrailRecorder (GPS)
  features/…               Seiten: auth, appointments, polls, trails, dogs, customers, account
netlify/
  functions/api.mts        API-Einstieg (/api/*)
  lib/                     Handler, Login, Datenoperationen (ops.mts), Routing
  database/migrations/     Schema, RLS-Policies, Trigger, RPCs
server/                    Lokale Entwicklung (PGlite), Testdaten, DB-/API-Tests
```

### Datenmodell (Kurzfassung)

- `schools` und `memberships` (Rolle pro Schule), `join_token` an der Schule (Beitrittslink, erneuerbar und abschaltbar)
- `dogs` gehören einem Profil
- `appointments` mit `max_dogs` (die Kapazität zählt Hunde). In `appointment_participants` steht pro Hund `registered`, `waitlist` oder `cancelled`. Wird ein Platz frei, rückt automatisch der nächste Hund von der Warteliste nach.
- `polls` mit `poll_options` und `poll_option_dogs` (mit welchen Hunden jemand an welchem Vorschlag kommt). `finalize_poll()` macht aus einem Vorschlag einen Termin – auch mehrere pro Umfrage.
- `trails`: Die Route ist eine GeoJSON-LineString. Dazu kommen `waypoints` und `segments`, damit der Editor die Route später wieder bearbeiten kann. Die Länge berechnet ein Trigger. `trail_assignments` regelt, welche Kund:innen den Trail sehen. `share_token` dient als öffentlicher Link.

## Ausbaustufen

- Capacitor-Build (Android/iOS) mit GPS-Aufzeichnung im Hintergrund
- Gelaufenen Weg des Hundes mit der geplanten Route vergleichen
- Fotos an Wegpunkten
- Trainingstagebuch und Statistik pro Hund
- GPX-Import und -Export
- Wiederkehrende Termine, iCal-Export
- E-Mail (Bestätigung, Passwort vergessen) und Push-Benachrichtigungen
- 10er-Karten
- Offline-Kartencache
