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
| Routing | OpenRouteService `foot-hiking` über die Edge Function `route-proxy` |
| Ortssuche | Nominatim (OpenStreetMap) |
| Backend | Supabase: Auth, Postgres, RLS, RPCs, Edge Functions |
| Hosting | Netlify (`netlify.toml`) |

## Einrichtung

1. **Supabase-Projekt anlegen** auf [supabase.com](https://supabase.com).
2. **Datenbank:** Den Inhalt von `supabase/migrations/20261103000000_schema.sql` im SQL-Editor ausführen. Alternativ mit der Supabase-CLI: `supabase link` und danach `supabase db push`.
3. **Testdaten (optional):** `supabase/seed.sql` im SQL-Editor ausführen. Die Seed-Datei legt Test-Logins an, die Zugangsdaten stehen am Anfang der Datei.
4. **Auth-Einstellungen:** Unter Authentication → URL Configuration die Site-URL (z. B. die Netlify-URL) und `http://localhost:4200` als Redirect-URL eintragen.
5. **Routing:**
   - Einen kostenlosen API-Key bei [openrouteservice.org](https://openrouteservice.org/dev/#/signup) holen.
   - Den Key als Secret setzen: `supabase secrets set ORS_API_KEY=...`
   - Die Funktion deployen: `supabase functions deploy route-proxy`
   - Ohne Routing funktioniert der Editor trotzdem. Abschnitte werden dann als Luftlinie gezeichnet.
6. **Frontend:** In `src/environments/environment.ts` die Werte `supabaseUrl` und `supabaseAnonKey` eintragen (Project Settings → API).

## Entwicklung

```bash
npm install
npm start            # http://localhost:4200
npm test             # Unit-Tests (Vitest): Editor-Logik, GPS-Aufnahme, Geo-Funktionen
npm run test:db      # Datenbank-Tests (PGlite): RLS, Anmeldung/Warteliste, Umfragen, Teilen
npm run build        # Produktions-Build nach dist/mantrailing/browser
```

Im Entwicklungsmodus lässt sich der Trail-Editor unter `/dev/editor` ohne Login ausprobieren. Speichern geht dort nicht.

## Aufbau

```
src/app/
  core/                    Supabase-Client, Auth, Guards, Modelle, Geo-Funktionen, Routing
  core/data/               Datendienste je Bereich (Hunde, Termine, Umfragen, Trails, Schule)
  shared/map/              MapLibre-Komponente (Linien und Marker deklarativ)
  shared/trail-view/       Trail-Ansicht mit Live-Position und Abweichungswarnung
  features/trails/editor/  Trail-Editor: TrailEditorStore (Logik), TrailRecorder (GPS)
  features/…               Seiten: auth, appointments, polls, trails, dogs, customers, account
supabase/
  migrations/              Schema, RLS-Policies, Trigger, RPCs
  functions/route-proxy/   Edge Function für OpenRouteService
  tests/                   Datenbank-Tests
```

### Datenmodell (Kurzfassung)

- `schools` und `memberships` (Rolle pro Schule), `invitations` (Einladungslink, 14 Tage gültig)
- `dogs` gehören einem Profil
- `appointments` mit `max_dogs` (die Kapazität zählt Hunde). In `appointment_participants` steht pro Hund `registered`, `waitlist` oder `cancelled`. Wird ein Platz frei, rückt automatisch der nächste Hund von der Warteliste nach.
- `polls` mit `poll_options`, `poll_votes` (Ja/Vielleicht/Nein pro Option) und `poll_dogs` (mit welchen Hunden jemand kommt). `finalize_poll()` macht aus einer Option einen Termin.
- `trails`: Die Route ist eine GeoJSON-LineString. Dazu kommen `waypoints` und `segments`, damit der Editor die Route später wieder bearbeiten kann. Die Länge berechnet ein Trigger. `trail_assignments` regelt, welche Kund:innen den Trail sehen. `share_token` dient als öffentlicher Link.

## Ausbaustufen

- Capacitor-Build (Android/iOS) mit GPS-Aufzeichnung im Hintergrund
- Gelaufenen Weg des Hundes mit der geplanten Route vergleichen
- Fotos an Wegpunkten
- Trainingstagebuch und Statistik pro Hund
- GPX-Import und -Export
- Wiederkehrende Termine, iCal-Export
- E-Mail- und Push-Benachrichtigungen
- 10er-Karten
- Offline-Kartencache
