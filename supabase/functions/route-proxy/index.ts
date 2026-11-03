// Routing-Proxy: berechnet eine Fußweg-Route zwischen zwei Punkten über OpenRouteService.
// Der API-Key bleibt serverseitig (Secret ORS_API_KEY). Supabase prüft das JWT des Aufrufers.
//
// Request:  POST { "coordinates": [[lng, lat], [lng, lat]] }
// Response: { "coordinates": [[lng, lat], ...] }

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isLngLat(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ORS_API_KEY');
  if (!apiKey) return json({ error: 'ORS_API_KEY ist nicht gesetzt' }, 500);

  let coordinates: unknown;
  try {
    ({ coordinates } = await req.json());
  } catch {
    return json({ error: 'Ungültiger Body' }, 400);
  }
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(isLngLat)) {
    return json({ error: 'coordinates muss genau zwei [lng, lat]-Paare enthalten' }, 400);
  }

  const res = await fetch(ORS_URL, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates, instructions: false, elevation: false }),
  });
  if (!res.ok) {
    return json({ error: `Routing fehlgeschlagen (${res.status})`, detail: await res.text() }, 502);
  }
  const data = await res.json();
  const line = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(line) || line.length < 2) return json({ error: 'Keine Route gefunden' }, 404);
  return json({ coordinates: line });
});
