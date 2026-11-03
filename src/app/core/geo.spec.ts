import { distance, distanceToLine, formatDistance, formatDuration, lineLength, simplify } from './geo';
import { LngLat } from './models';

describe('geo', () => {
  it('berechnet ca. 111 m für 0,001° Breite', () => {
    expect(distance([8, 50], [8, 50.001])).toBeCloseTo(111.2, 0);
  });

  it('summiert Linienlängen', () => {
    expect(lineLength([[8, 50], [8, 50.001], [8, 50.002]])).toBeCloseTo(222.4, 0);
    expect(lineLength([[8, 50]])).toBe(0);
  });

  it('misst Abstand und Fortschritt zur Linie', () => {
    const line: LngLat[] = [[8, 50], [8, 50.002]];
    const r = distanceToLine([8.0001, 50.001], line);
    expect(r.distance).toBeCloseTo(7.2, 0);
    expect(r.along).toBeCloseTo(111.2, 0);
  });

  it('vereinfacht fast gerade Linien', () => {
    const coords: LngLat[] = [];
    for (let i = 0; i <= 20; i++) coords.push([8 + (i % 2 ? 0.000005 : 0), 50 + i * 0.0001]);
    const s = simplify(coords, 2);
    expect(s.length).toBe(2);
    expect(s[0]).toEqual(coords[0]);
    expect(s[1]).toEqual(coords[20]);
  });

  it('behält echte Ecken', () => {
    const coords: LngLat[] = [[8, 50], [8, 50.001], [8.001, 50.001]];
    expect(simplify(coords, 2)).toEqual(coords);
  });

  it('formatiert Strecken und Dauer', () => {
    expect(formatDistance(850.4)).toBe('850 m');
    expect(formatDistance(1234)).toBe('1,23 km');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
});
