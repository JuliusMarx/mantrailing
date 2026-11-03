// Fußweg-Routing über den öffentlichen Valhalla-Server der FOSSGIS (kein API-Key nötig).
// https://valhalla1.openstreetmap.de – Nutzung bitte maßvoll (Fair-Use).
import { HttpError } from './auth.mts';

type LngLat = [number, number];

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';

function isLngLat(v: unknown): v is LngLat {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

/** Dekodiert eine Valhalla-Polyline (Genauigkeit 6) zu [lng, lat]-Paaren. */
export function decodePolyline6(encoded: string): LngLat[] {
  const coords: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

export async function route(body: Record<string, unknown>): Promise<{ coordinates: LngLat[] }> {
  const coordinates = body['coordinates'];
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(isLngLat)) {
    throw new HttpError(400, 'coordinates muss genau zwei [lng, lat]-Paare enthalten');
  }
  const [from, to] = coordinates as LngLat[];
  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'mantrailing-app' },
    body: JSON.stringify({
      locations: [
        { lat: from[1], lon: from[0] },
        { lat: to[1], lon: to[0] },
      ],
      costing: 'pedestrian',
      directions_type: 'none',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new HttpError(502, `Routing fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as { trip?: { legs?: { shape: string }[] } };
  const legs = data.trip?.legs ?? [];
  const line = legs.flatMap((leg) => decodePolyline6(leg.shape));
  if (line.length < 2) throw new HttpError(404, 'Keine Route gefunden');
  return { coordinates: line };
}
