import { inject, Injectable } from '@angular/core';
import { LngLat } from './models';
import { ApiService } from './api.service';

export type Router = (from: LngLat, to: LngLat) => Promise<LngLat[]>;

/** Fußweg-Routing über die API (/api/route → Valhalla). */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly api = inject(ApiService);
  private readonly cache = new Map<string, LngLat[]>();

  readonly route: Router = async (from, to) => {
    const key = `${from.join(',')}|${to.join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const data = await this.api.post<{ coordinates: LngLat[] }>('/route', {
      coordinates: [from, to],
    });
    if (!data.coordinates?.length) throw new Error('Keine Route gefunden');
    // Endpunkte exakt auf die gesetzten Punkte legen (das Routing rastet auf den nächsten Weg ein).
    const coords: LngLat[] = [from, ...data.coordinates, to];
    this.cache.set(key, coords);
    return coords;
  };
}

export interface GeocodeResult {
  label: string;
  point: LngLat;
}

/** Ortssuche über Nominatim (OpenStreetMap). Nur auf ausdrückliche Suche, nicht beim Tippen. */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'de');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ortssuche fehlgeschlagen');
  const items: { display_name: string; lon: string; lat: string }[] = await res.json();
  return items.map((i) => ({ label: i.display_name, point: [Number(i.lon), Number(i.lat)] }));
}
