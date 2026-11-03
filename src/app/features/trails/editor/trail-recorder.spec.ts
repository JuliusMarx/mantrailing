import { LngLat } from '../../../core/models';
import { TrailRecorder } from './trail-recorder';

describe('TrailRecorder.toTrail', () => {
  const coords: LngLat[] = [];
  for (let i = 0; i <= 40; i++) coords.push([8, 50 + i * 0.00005]);

  it('liefert Start und Ende als Stützpunkte mit vereinfachtem Segment', () => {
    const trail = TrailRecorder.toTrail(coords, [])!;
    expect(trail.points.map((p) => p.type)).toEqual(['start', 'hide']);
    expect(trail.segments.length).toBe(1);
    expect(trail.segments[0].mode).toBe('recorded');
    // gerade Linie wird auf zwei Punkte reduziert
    expect(trail.segments[0].coords!.length).toBe(2);
  });

  it('teilt die Aufnahme an markierten Wegpunkten', () => {
    const trail = TrailRecorder.toTrail(coords, [
      { index: 10, type: 'article' },
      { index: 25, type: 'turn' },
    ])!;
    expect(trail.points.map((p) => p.type)).toEqual(['start', 'article', 'turn', 'hide']);
    expect(trail.segments.length).toBe(3);
    expect(trail.points[1].lat).toBeCloseTo(50.0005, 6);
  });

  it('übernimmt eine Markierung am Ende als Endpunkt', () => {
    const trail = TrailRecorder.toTrail(coords, [{ index: 40, type: 'article' }])!;
    expect(trail.points.map((p) => p.type)).toEqual(['start', 'article']);
  });

  it('braucht mindestens zwei Positionen', () => {
    expect(TrailRecorder.toTrail([[8, 50]], [])).toBeNull();
  });
});
