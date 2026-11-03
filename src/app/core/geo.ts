import { LngLat } from './models';

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Entfernung zweier Punkte in Metern (Haversine). */
export function distance(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distance(coords[i - 1], coords[i]);
  return total;
}

/** Projiziert lokal auf eine Ebene (Meter), ausreichend genau für kurze Strecken. */
function toLocal(p: LngLat, origin: LngLat): [number, number] {
  const x = toRad(p[0] - origin[0]) * EARTH_RADIUS_M * Math.cos(toRad(origin[1]));
  const y = toRad(p[1] - origin[1]) * EARTH_RADIUS_M;
  return [x, y];
}

function pointSegmentDistance(p: LngLat, a: LngLat, b: LngLat): { dist: number; t: number } {
  const [px, py] = toLocal(p, a);
  const [bx, by] = toLocal(b, a);
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const dx = px - t * bx;
  const dy = py - t * by;
  return { dist: Math.sqrt(dx * dx + dy * dy), t };
}

/**
 * Kürzeste Entfernung eines Punktes zu einer Linie und die bis dorthin
 * zurückgelegte Strecke entlang der Linie (für "Fortschritt" und "abgewichen").
 */
export function distanceToLine(p: LngLat, line: LngLat[]): { distance: number; along: number } {
  if (line.length === 0) return { distance: Infinity, along: 0 };
  if (line.length === 1) return { distance: distance(p, line[0]), along: 0 };
  let best = { distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const segLen = distance(line[i - 1], line[i]);
    const { dist, t } = pointSegmentDistance(p, line[i - 1], line[i]);
    if (dist < best.distance) best = { distance: dist, along: walked + t * segLen };
    walked += segLen;
  }
  return best;
}

/** Douglas-Peucker-Vereinfachung, Toleranz in Metern. */
export function simplify(coords: LngLat[], toleranceM: number): LngLat[] {
  if (coords.length <= 2) return coords.slice();
  const keep = new Array<boolean>(coords.length).fill(false);
  keep[0] = keep[coords.length - 1] = true;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const { dist } = pointSegmentDistance(coords[i], coords[start], coords[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km`;
}

/** Gehzeit bei gemütlichem Trail-Tempo (ca. 3,5 km/h). */
export function walkingMinutes(m: number, kmh = 3.5): number {
  return Math.round((m / 1000 / kmh) * 60);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min ? `${h} h ${min} min` : `${h} h`;
}

export function bounds(coords: LngLat[]): [LngLat, LngLat] | null {
  if (!coords.length) return null;
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function navigationUrl(point: LngLat): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point[1]},${point[0]}`;
}
