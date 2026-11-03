import { inject, Injectable } from '@angular/core';
import { LngLat } from './models';
import { SupabaseService } from './supabase.service';

export type Router = (from: LngLat, to: LngLat) => Promise<LngLat[]>;

/** Fußweg-Routing über die Edge Function `route-proxy` (OpenRouteService). */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly cache = new Map<string, LngLat[]>();

  readonly route: Router = async (from, to) => {
    const key = `${from.join(',')}|${to.join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { data, error } = await this.supabase.functions.invoke<{ coordinates: LngLat[] }>(
      'route-proxy',
      { body: { coordinates: [from, to] } },
    );
    if (error || !data?.coordinates?.length) throw error ?? new Error('Keine Route gefunden');
    // Endpunkte exakt auf die gesetzten Punkte legen (ORS rastet auf den nächsten Weg ein).
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
