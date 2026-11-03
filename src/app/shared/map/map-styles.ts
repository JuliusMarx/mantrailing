import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleKey = 'outdoor' | 'topo' | 'satellite';

function rasterStyle(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

export const MAP_STYLES: Record<MapStyleKey, { label: string; style: string | StyleSpecification }> = {
  outdoor: { label: 'Karte', style: 'https://tiles.openfreemap.org/styles/liberty' },
  topo: {
    label: 'Topo',
    style: rasterStyle(
      ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      17,
    ),
  },
  satellite: {
    label: 'Satellit',
    style: rasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
      19,
    ),
  },
};

export const DEFAULT_CENTER: [number, number] = [10.45, 51.16];
export const DEFAULT_ZOOM = 5;
