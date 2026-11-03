import { WaypointType } from '../../core/models';

export interface WaypointTypeInfo {
  type: WaypointType;
  label: string;
  color: string;
  glyph: string;
  icon: string;
}

export const WAYPOINT_TYPES: WaypointTypeInfo[] = [
  { type: 'start', label: 'Start', color: '#2e7d32', glyph: '▶', icon: 'play' },
  { type: 'via', label: 'Stützpunkt', color: '#546e7a', glyph: '', icon: 'ellipse' },
  { type: 'hide', label: 'Versteck / Ziel', color: '#c62828', glyph: '★', icon: 'flag' },
  { type: 'article', label: 'Gegenstand', color: '#6a1b9a', glyph: '◆', icon: 'cube' },
  { type: 'turn', label: 'Abzweigung', color: '#ef6c00', glyph: '↱', icon: 'git-branch' },
  { type: 'note', label: 'Notiz', color: '#1565c0', glyph: 'i', icon: 'information-circle' },
];

export function waypointInfo(type: WaypointType): WaypointTypeInfo {
  return WAYPOINT_TYPES.find((t) => t.type === type) ?? WAYPOINT_TYPES[1];
}

export const MEETING_POINT_COLOR = '#00695c';
