import { computed, signal } from '@angular/core';
import { lineLength } from '../../../core/geo';
import { GeoLine, LngLat, SegmentMode, TrailPoint, TrailSegment, WaypointType } from '../../../core/models';
import type { Router } from '../../../core/routing.service';

/**
 * Zustand des Trail-Editors: Stützpunkte, Segmente dazwischen, Undo/Redo und Routing.
 * Segment i verbindet points[i] und points[i + 1].
 * Unabhängig von der Karte, damit die Logik testbar bleibt.
 */
interface EditorState {
  points: TrailPoint[];
  segments: TrailSegment[];
}

const EMPTY: EditorState = { points: [], segments: [] };
const MAX_HISTORY = 100;

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const pos = (p: TrailPoint): LngLat => [p.lng, p.lat];

function segmentKey(a: TrailPoint, b: TrailPoint) {
  return `${a.lng},${a.lat}|${b.lng},${b.lat}`;
}

/** Neues Segment zwischen a und b; follow-Segmente bleiben leer, bis das Routing antwortet. */
function makeSegment(mode: SegmentMode, a: TrailPoint, b: TrailPoint): TrailSegment {
  if (mode === 'follow') return { mode, coords: null };
  return { mode: mode === 'recorded' ? 'straight' : mode, coords: [pos(a), pos(b)] };
}

/** Passt ein Segment an, nachdem sich einer seiner Endpunkte bewegt hat. */
function refreshSegment(seg: TrailSegment, a: TrailPoint, b: TrailPoint): TrailSegment {
  if (seg.mode === 'recorded' && seg.coords && seg.coords.length >= 2) {
    const coords = seg.coords.slice();
    coords[0] = pos(a);
    coords[coords.length - 1] = pos(b);
    return { mode: 'recorded', coords };
  }
  return makeSegment(seg.mode, a, b);
}

export class TrailEditorStore {
  private readonly state = signal<EditorState>(EMPTY);
  private readonly undoStack = signal<EditorState[]>([]);
  private readonly redoStack = signal<EditorState[]>([]);
  private readonly inFlight = new Map<string, Promise<void>>();

  /** Modus für neu gezeichnete Segmente. */
  readonly drawMode = signal<SegmentMode>('follow');
  readonly selectedId = signal<string | null>(null);
  readonly routingErrors = signal(0);

  readonly points = computed(() => this.state().points);
  readonly segments = computed(() => this.state().segments);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly selectedPoint = computed(() => this.points().find((p) => p.id === this.selectedId()) ?? null);
  readonly routingPending = computed(() => this.segments().some((s) => s.coords === null));

  /** Koordinaten der Segmente; noch nicht geroutete Segmente als Luftlinie. */
  readonly segmentCoords = computed<LngLat[][]>(() => {
    const { points, segments } = this.state();
    return segments.map((s, i) => s.coords ?? [pos(points[i]), pos(points[i + 1])]);
  });

  readonly line = computed<LngLat[]>(() => {
    const { points } = this.state();
    if (points.length === 1) return [pos(points[0])];
    const out: LngLat[] = [];
    for (const coords of this.segmentCoords()) {
      out.push(...(out.length ? coords.slice(1) : coords));
    }
    return out;
  });

  readonly segmentLengths = computed(() => this.segmentCoords().map((c) => lineLength(c)));
  readonly length = computed(() => this.segmentLengths().reduce((sum, l) => sum + l, 0));

  constructor(private readonly router: Router) {}

  // --- Laden / Speichern ---------------------------------------------------

  load(points: TrailPoint[], segments: TrailSegment[]) {
    const segs = points.slice(1).map((b, i) => {
      const s = segments[i];
      return s ? { ...s, coords: s.coords?.slice() ?? null } : makeSegment('follow', points[i], b);
    });
    this.state.set({ points: points.map((p) => ({ ...p })), segments: segs });
    this.undoStack.set([]);
    this.redoStack.set([]);
    this.selectedId.set(null);
    this.resolvePending();
  }

  /** Ersetzt den ganzen Trail als ein rückgängig machbarer Schritt (z. B. nach einer Aufnahme). */
  replace(points: TrailPoint[], segments: TrailSegment[]) {
    this.selectedId.set(null);
    this.commit({ points, segments });
  }

  toGeoLine(): GeoLine | null {
    const line = this.line();
    return line.length >= 2 ? { type: 'LineString', coordinates: line } : null;
  }

  snapshot(): EditorState {
    return this.state();
  }

  // --- Bearbeiten ----------------------------------------------------------

  addPoint(lngLat: LngLat, type?: WaypointType): string {
    const { points, segments } = this.state();
    const point: TrailPoint = {
      id: newId(),
      lng: lngLat[0],
      lat: lngLat[1],
      type: type ?? (points.length === 0 ? 'start' : 'via'),
    };
    const next: EditorState = {
      points: [...points, point],
      segments: points.length
        ? [...segments, makeSegment(this.drawMode(), points[points.length - 1], point)]
        : segments,
    };
    this.commit(next);
    return point.id;
  }

  movePoint(id: string, lngLat: LngLat) {
    const { points, segments } = this.state();
    const i = points.findIndex((p) => p.id === id);
    if (i === -1) return;
    const nextPoints = points.slice();
    nextPoints[i] = { ...points[i], lng: lngLat[0], lat: lngLat[1] };
    const nextSegments = segments.slice();
    if (i > 0) nextSegments[i - 1] = refreshSegment(segments[i - 1], nextPoints[i - 1], nextPoints[i]);
    if (i < segments.length) nextSegments[i] = refreshSegment(segments[i], nextPoints[i], nextPoints[i + 1]);
    this.commit({ points: nextPoints, segments: nextSegments });
  }

  removePoint(id: string) {
    const { points, segments } = this.state();
    const i = points.findIndex((p) => p.id === id);
    if (i === -1) return;
    const nextPoints = points.filter((p) => p.id !== id);
    let nextSegments: TrailSegment[];
    if (i === 0) {
      nextSegments = segments.slice(1);
      if (nextPoints[0]?.type === 'via') nextPoints[0] = { ...nextPoints[0], type: 'start' };
    } else if (i === points.length - 1) {
      nextSegments = segments.slice(0, -1);
    } else {
      const before = segments[i - 1];
      const after = segments[i];
      let merged: TrailSegment;
      if (before.mode === 'recorded' && after.mode === 'recorded' && before.coords && after.coords) {
        merged = { mode: 'recorded', coords: [...before.coords, ...after.coords.slice(1)] };
      } else {
        const mode = before.mode === 'recorded' ? 'follow' : before.mode;
        merged = makeSegment(mode, points[i - 1], points[i + 1]);
      }
      nextSegments = [...segments.slice(0, i - 1), merged, ...segments.slice(i + 1)];
    }
    if (this.selectedId() === id) this.selectedId.set(null);
    this.commit({ points: nextPoints, segments: nextSegments });
  }

  updatePoint(id: string, changes: Partial<Pick<TrailPoint, 'type' | 'note'>>) {
    const { points, segments } = this.state();
    if (!points.some((p) => p.id === id)) return;
    this.commit({
      points: points.map((p) => (p.id === id ? { ...p, ...changes } : p)),
      segments,
    });
  }

  setSegmentMode(index: number, mode: SegmentMode) {
    const { points, segments } = this.state();
    const seg = segments[index];
    if (!seg || seg.mode === mode) return;
    const nextSegments = segments.slice();
    nextSegments[index] = makeSegment(mode, points[index], points[index + 1]);
    this.commit({ points, segments: nextSegments });
  }

  /** Modus aller Segmente, die an einem Punkt enden (für "Abschnitt bis hier"). */
  segmentIndexBefore(id: string): number | null {
    const i = this.points().findIndex((p) => p.id === id);
    return i > 0 ? i - 1 : null;
  }

  reverse() {
    const { points, segments } = this.state();
    if (points.length < 2) return;
    this.commit({
      points: points.slice().reverse(),
      segments: segments
        .slice()
        .reverse()
        .map((s) => ({ ...s, coords: s.coords ? s.coords.slice().reverse() : null })),
    });
  }

  clear() {
    if (!this.points().length) return;
    this.selectedId.set(null);
    this.commit(EMPTY);
  }

  undo() {
    const stack = this.undoStack();
    if (!stack.length) return;
    this.redoStack.update((r) => [...r, this.state()]);
    this.undoStack.set(stack.slice(0, -1));
    this.state.set(stack[stack.length - 1]);
    this.dropMissingSelection();
    this.resolvePending();
  }

  redo() {
    const stack = this.redoStack();
    if (!stack.length) return;
    this.undoStack.update((u) => [...u, this.state()]);
    this.redoStack.set(stack.slice(0, -1));
    this.state.set(stack[stack.length - 1]);
    this.dropMissingSelection();
    this.resolvePending();
  }

  /** Wartet, bis alle laufenden Routing-Anfragen beantwortet sind (für Tests und Speichern). */
  async idle() {
    while (this.inFlight.size) await Promise.all([...this.inFlight.values()]);
  }

  // --- intern --------------------------------------------------------------

  private commit(next: EditorState) {
    this.undoStack.update((u) => [...u, this.state()].slice(-MAX_HISTORY));
    this.redoStack.set([]);
    this.state.set(next);
    this.resolvePending();
  }

  private dropMissingSelection() {
    const id = this.selectedId();
    if (id && !this.points().some((p) => p.id === id)) this.selectedId.set(null);
  }

  private resolvePending() {
    const { points, segments } = this.state();
    segments.forEach((seg, i) => {
      if (seg.coords !== null) return;
      const a = points[i];
      const b = points[i + 1];
      const key = segmentKey(a, b);
      if (this.inFlight.has(key)) return;
      const request = this.router(pos(a), pos(b))
        .then((coords) => this.applyRoute(key, coords, false))
        .catch(() => {
          this.routingErrors.update((n) => n + 1);
          this.applyRoute(key, [pos(a), pos(b)], true);
        })
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, request);
    });
  }

  /** Trägt eine Routing-Antwort ein – im aktuellen Zustand und in der Historie. */
  private applyRoute(key: string, coords: LngLat[], fallback: boolean) {
    const patch = (s: EditorState): EditorState => {
      let changed = false;
      const segments = s.segments.map((seg, i) => {
        if (seg.coords === null && seg.mode === 'follow' && segmentKey(s.points[i], s.points[i + 1]) === key) {
          changed = true;
          return fallback ? { mode: seg.mode, coords, fallback } : { mode: seg.mode, coords };
        }
        return seg;
      });
      return changed ? { points: s.points, segments } : s;
    };
    this.state.update(patch);
    this.undoStack.update((stack) => stack.map(patch));
    this.redoStack.update((stack) => stack.map(patch));
  }
}
