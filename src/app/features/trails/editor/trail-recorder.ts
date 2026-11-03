import { computed, signal } from '@angular/core';
import { distance, lineLength, simplify } from '../../../core/geo';
import { LngLat, TrailPoint, TrailSegment, WaypointType } from '../../../core/models';

/** Ab dieser GPS-Genauigkeit (Meter) werden Positionen verworfen. */
const MAX_ACCURACY_M = 25;
/** Mindestabstand zwischen zwei aufgezeichneten Punkten. */
const MIN_STEP_M = 3;
/** Unrealistische Sprünge (m/s) werden verworfen – zu Fuß ist man nicht so schnell. */
const MAX_SPEED_MS = 8;
/** Toleranz für die Vereinfachung nach der Aufnahme. */
const SIMPLIFY_M = 2;

interface Fix {
  coord: LngLat;
  time: number;
}

/**
 * Zeichnet eine Route per GPS auf. Positionen mit schlechter Genauigkeit oder
 * unplausiblen Sprüngen werden verworfen; Wegpunkte lassen sich unterwegs markieren.
 */
export class TrailRecorder {
  readonly active = signal(false);
  readonly coords = signal<LngLat[]>([]);
  readonly accuracy = signal<number | null>(null);
  readonly marks = signal<{ index: number; type: WaypointType }[]>([]);
  readonly error = signal<string | null>(null);
  readonly length = computed(() => lineLength(this.coords()));

  private watchId: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private last: Fix | null = null;

  async start() {
    if (!('geolocation' in navigator)) {
      this.error.set('Dieses Gerät unterstützt kein GPS.');
      return;
    }
    this.coords.set([]);
    this.marks.set([]);
    this.error.set(null);
    this.last = null;
    this.active.set(true);
    await this.requestWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => this.error.set(err.code === err.PERMISSION_DENIED ? 'Standortzugriff wurde verweigert.' : 'GPS-Signal fehlt.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  /** Markiert die aktuelle Position als Wegpunkt. */
  mark(type: WaypointType) {
    const n = this.coords().length;
    if (!n) return;
    this.marks.update((m) => [...m.filter((x) => x.index !== n - 1), { index: n - 1, type }]);
  }

  /** Beendet die Aufnahme und liefert Punkte und Segmente für den Editor. */
  stop(): { points: TrailPoint[]; segments: TrailSegment[] } | null {
    this.cleanup();
    return TrailRecorder.toTrail(this.coords(), this.marks());
  }

  cancel() {
    this.cleanup();
    this.coords.set([]);
    this.marks.set([]);
  }

  /** Wandelt eine Aufnahme in Stützpunkte (Start, Markierungen, Ende) und aufgezeichnete Segmente um. */
  static toTrail(
    coords: LngLat[],
    marks: { index: number; type: WaypointType }[],
  ): { points: TrailPoint[]; segments: TrailSegment[] } | null {
    if (coords.length < 2) return null;
    const last = coords.length - 1;
    const types = new Map<number, WaypointType>([[0, 'start']]);
    for (const m of marks) if (m.index > 0) types.set(Math.min(m.index, last), m.type);
    if (!types.has(last)) types.set(last, 'hide');
    const indexes = [...types.keys()].sort((a, b) => a - b);

    const stamp = Date.now().toString(36);
    const points: TrailPoint[] = indexes.map((i, n) => ({
      id: `r${stamp}${n}`,
      lng: coords[i][0],
      lat: coords[i][1],
      type: types.get(i)!,
    }));
    const segments: TrailSegment[] = indexes.slice(1).map((end, n) => ({
      mode: 'recorded',
      coords: simplify(coords.slice(indexes[n], end + 1), SIMPLIFY_M),
    }));
    return { points, segments };
  }

  private onPosition(pos: GeolocationPosition) {
    this.accuracy.set(Math.round(pos.coords.accuracy));
    if (pos.coords.accuracy > MAX_ACCURACY_M) return;
    const fix: Fix = { coord: [pos.coords.longitude, pos.coords.latitude], time: pos.timestamp };
    if (this.last) {
      const d = distance(this.last.coord, fix.coord);
      const dt = Math.max(1, (fix.time - this.last.time) / 1000);
      if (d < MIN_STEP_M) return;
      if (d / dt > MAX_SPEED_MS) return;
    }
    this.last = fix;
    this.coords.update((c) => [...c, fix.coord]);
  }

  private onVisibility = () => {
    // Wake Lock geht verloren, wenn die Seite in den Hintergrund wechselt
    if (document.visibilityState === 'visible' && this.active()) this.requestWakeLock();
  };

  private async requestWakeLock() {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private cleanup() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.active.set(false);
  }
}
