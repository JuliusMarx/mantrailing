import { LngLat } from '../../../core/models';
import { TrailEditorStore } from './trail-editor.store';

/** Fake-Routing: geht über einen Umweg-Punkt in der Mitte (leicht versetzt). */
function fakeRouter() {
  const calls: [LngLat, LngLat][] = [];
  const router = async (from: LngLat, to: LngLat): Promise<LngLat[]> => {
    calls.push([from, to]);
    const mid: LngLat = [(from[0] + to[0]) / 2 + 0.0005, (from[1] + to[1]) / 2];
    return [from, mid, to];
  };
  return { router, calls };
}

describe('TrailEditorStore', () => {
  it('setzt Punkte, routet Segmente und berechnet die Länge', async () => {
    const { router, calls } = fakeRouter();
    const store = new TrailEditorStore(router);

    store.addPoint([8, 50]);
    expect(store.points()[0].type).toBe('start');
    expect(store.line()).toEqual([[8, 50]]);

    store.addPoint([8, 50.001]);
    expect(store.routingPending()).toBe(true);
    await store.idle();
    expect(store.routingPending()).toBe(false);
    expect(calls.length).toBe(1);
    expect(store.points()[1].type).toBe('via');
    expect(store.line().length).toBe(3);
    // Umweg ist länger als die Luftlinie (111 m)
    expect(store.length()).toBeGreaterThan(115);
  });

  it('nutzt im Luftlinien-Modus kein Routing', async () => {
    const { router, calls } = fakeRouter();
    const store = new TrailEditorStore(router);
    store.drawMode.set('straight');
    store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    await store.idle();
    expect(calls.length).toBe(0);
    expect(store.length()).toBeCloseTo(111.2, 0);
  });

  it('wechselt den Modus pro Segment', async () => {
    const { router } = fakeRouter();
    const store = new TrailEditorStore(router);
    store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    store.addPoint([8, 50.002]);
    await store.idle();
    store.setSegmentMode(1, 'straight');
    expect(store.segments().map((s) => s.mode)).toEqual(['follow', 'straight']);
    expect(store.segmentCoords()[1].length).toBe(2);
    expect(store.segmentCoords()[0].length).toBe(3);
  });

  it('verschiebt Punkte und routet nur die betroffenen Segmente neu', async () => {
    const { router, calls } = fakeRouter();
    const store = new TrailEditorStore(router);
    const a = store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    store.addPoint([8, 50.002]);
    await store.idle();
    expect(calls.length).toBe(2);

    store.movePoint(a, [8.001, 50]);
    await store.idle();
    expect(calls.length).toBe(3);
    expect(store.line()[0]).toEqual([8.001, 50]);
  });

  it('löscht Punkte und verbindet die Nachbarn', async () => {
    const { router } = fakeRouter();
    const store = new TrailEditorStore(router);
    const a = store.addPoint([8, 50]);
    const b = store.addPoint([8, 50.001]);
    store.addPoint([8, 50.002]);
    await store.idle();

    store.removePoint(b);
    await store.idle();
    expect(store.points().length).toBe(2);
    expect(store.segments().length).toBe(1);

    store.removePoint(a);
    expect(store.points().length).toBe(1);
    expect(store.points()[0].type).toBe('start');
    expect(store.segments().length).toBe(0);
  });

  it('macht Schritte rückgängig und wiederholt sie ohne erneutes Routing', async () => {
    const { router, calls } = fakeRouter();
    const store = new TrailEditorStore(router);
    store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    await store.idle();
    const lengthBefore = store.length();

    store.addPoint([8, 50.002]);
    await store.idle();
    expect(store.points().length).toBe(3);

    store.undo();
    expect(store.points().length).toBe(2);
    expect(store.length()).toBeCloseTo(lengthBefore, 5);
    expect(store.canRedo()).toBe(true);

    store.redo();
    await store.idle();
    expect(store.points().length).toBe(3);
    expect(store.routingPending()).toBe(false);
    expect(calls.length).toBe(2);
  });

  it('trägt Routing-Antworten auch nach schnellem Undo korrekt ein', async () => {
    const { router } = fakeRouter();
    const store = new TrailEditorStore(router);
    store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    store.undo(); // Antwort ist noch unterwegs
    await store.idle();
    store.redo();
    expect(store.routingPending()).toBe(false);
    expect(store.line().length).toBe(3);
  });

  it('fällt bei Routing-Fehlern auf die Luftlinie zurück', async () => {
    const store = new TrailEditorStore(async () => {
      throw new Error('offline');
    });
    store.addPoint([8, 50]);
    store.addPoint([8, 50.001]);
    await store.idle();
    expect(store.segments()[0].fallback).toBe(true);
    expect(store.routingErrors()).toBe(1);
    expect(store.length()).toBeCloseTo(111.2, 0);
  });

  it('kehrt die Route um und ändert Wegpunkt-Typen', async () => {
    const { router } = fakeRouter();
    const store = new TrailEditorStore(router);
    const a = store.addPoint([8, 50]);
    const b = store.addPoint([8, 50.001]);
    await store.idle();
    store.updatePoint(b, { type: 'hide', note: 'hinter der Bank' });
    store.reverse();
    expect(store.points().map((p) => p.id)).toEqual([b, a]);
    expect(store.points()[0].note).toBe('hinter der Bank');
    expect(store.line()[0]).toEqual([8, 50.001]);
  });

  it('passt aufgezeichnete Segmente beim Verschieben an, statt sie zu verwerfen', () => {
    const store = new TrailEditorStore(async () => []);
    store.load(
      [
        { id: 'a', lng: 8, lat: 50, type: 'start' },
        { id: 'b', lng: 8, lat: 50.002, type: 'hide' },
      ],
      [{ mode: 'recorded', coords: [[8, 50], [8.0003, 50.001], [8, 50.002]] }],
    );
    store.movePoint('b', [8, 50.0021]);
    const coords = store.segments()[0].coords!;
    expect(coords.length).toBe(3);
    expect(coords[2]).toEqual([8, 50.0021]);
    expect(store.toGeoLine()?.coordinates.length).toBe(3);
  });
});
