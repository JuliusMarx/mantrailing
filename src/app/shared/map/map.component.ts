import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { IonFab, IonFabButton, IonFabList, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { layersOutline } from 'ionicons/icons';
import type { GeoJSONSource, GeolocateControl, Map as MlMap, Marker } from 'maplibre-gl';
import { bounds } from '../../core/geo';
import { LngLat, WaypointType } from '../../core/models';
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLES, MapStyleKey } from './map-styles';
import { MEETING_POINT_COLOR, waypointInfo } from './waypoint-types';

export interface MapLine {
  id: string;
  coords: LngLat[];
  color?: string;
  width?: number;
  dashed?: boolean;
}

export interface MapMarker {
  id: string;
  lngLat: LngLat;
  type: WaypointType | 'meeting';
  draggable?: boolean;
  selected?: boolean;
  small?: boolean;
  title?: string;
}

const STYLE_STORAGE_KEY = 'mantrailing.mapStyle';

/**
 * Wiederverwendbare MapLibre-Karte: Linien und Marker werden deklarativ über Inputs gesetzt,
 * Tippen und Ziehen kommen als Outputs zurück.
 */
@Component({
  selector: 'app-map',
  imports: [IonFab, IonFabButton, IonFabList, IonIcon],
  template: `
    <div #container class="map"></div>
    @if (showStyleSwitch()) {
      <ion-fab vertical="top" horizontal="end" class="style-fab">
        <ion-fab-button size="small" color="light" aria-label="Kartenstil">
          <ion-icon name="layers-outline" />
        </ion-fab-button>
        <ion-fab-list side="bottom">
          @for (key of styleKeys; track key) {
            <ion-fab-button
              size="small"
              [color]="styleKey() === key ? 'primary' : 'light'"
              (click)="setStyle(key)"
              [attr.aria-label]="styles[key].label"
            >
              <span class="style-label">{{ styles[key].label }}</span>
            </ion-fab-button>
          }
        </ion-fab-list>
      </ion-fab>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    .map {
      position: absolute;
      inset: 0;
    }
    .style-fab {
      margin-top: 4px;
    }
    .style-label {
      font-size: 10px;
      font-weight: 600;
    }
    :host ::ng-deep .maplibregl-ctrl-top-right {
      top: 56px;
    }
  `,
})
export class MapComponent {
  readonly lines = input<MapLine[]>([]);
  readonly markers = input<MapMarker[]>([]);
  readonly center = input<LngLat | null>(null);
  readonly zoom = input<number | null>(null);
  /** Beim ersten Setzen wird die Karte auf diese Koordinaten gezoomt. */
  readonly fitCoords = input<LngLat[] | null>(null);
  readonly showUserLocation = input(false);
  readonly showStyleSwitch = input(true);
  readonly interactive = input(true);

  readonly mapClick = output<LngLat>();
  readonly markerClick = output<string>();
  readonly markerDragEnd = output<{ id: string; lngLat: LngLat }>();
  readonly userPosition = output<GeolocationPosition>();
  readonly ready = output<void>();

  protected readonly styles = MAP_STYLES;
  protected readonly styleKeys = Object.keys(MAP_STYLES) as MapStyleKey[];
  protected readonly styleKey = signal<MapStyleKey>(this.initialStyle());

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private map: MlMap | null = null;
  private maplibre: typeof import('maplibre-gl') | null = null;
  private geolocate: GeolocateControl | null = null;
  private readonly markerObjects = new Map<string, { marker: Marker; key: string }>();
  /** Erhöht sich bei jedem geladenen Stil – Effekte zeichnen dann Quellen neu. */
  private readonly styleVersion = signal(0);
  private fitted = false;

  constructor() {
    addIcons({ layersOutline });
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.init();
    });

    destroyRef.onDestroy(() => {
      this.map?.remove();
      this.map = null;
    });

    effect(() => {
      const lines = this.lines();
      if (this.styleVersion() === 0) return;
      untracked(() => this.renderLines(lines));
    });

    effect(() => {
      const markers = this.markers();
      if (this.styleVersion() === 0) return;
      untracked(() => this.renderMarkers(markers));
    });

    effect(() => {
      const coords = this.fitCoords();
      if (this.styleVersion() === 0 || !coords?.length || this.fitted) return;
      this.fitted = true;
      untracked(() => this.fitTo(coords, false));
    });
  }

  private initialStyle(): MapStyleKey {
    try {
      const stored = localStorage.getItem(STYLE_STORAGE_KEY) as MapStyleKey | null;
      if (stored && stored in MAP_STYLES) return stored;
    } catch {
      // ignorieren
    }
    return 'outdoor';
  }

  private async init() {
    // MapLibre erst hier laden, damit es nicht im Haupt-Bundle landet
    // maplibre-gl ist CommonJS: im Produktions-Build steckt die API unter `default`
    const mod = (await import('maplibre-gl')) as typeof import('maplibre-gl') & {
      default?: typeof import('maplibre-gl');
    };
    const maplibre = (this.maplibre = mod.default ?? mod);
    const el = this.container().nativeElement;
    const map = new maplibre.Map({
      container: el,
      style: MAP_STYLES[this.styleKey()].style,
      center: this.center() ?? DEFAULT_CENTER,
      zoom: this.zoom() ?? (this.center() ? 15 : DEFAULT_ZOOM),
      attributionControl: { compact: true },
      interactive: this.interactive(),
      dragRotate: true,
      pitchWithRotate: false,
    });
    this.map = map;
    map.touchZoomRotate.enableRotation();

    map.addControl(new maplibre.NavigationControl({ showZoom: false, visualizePitch: false }), 'top-right');
    if (this.showUserLocation()) {
      this.geolocate = new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: true,
      });
      this.geolocate.on('geolocate', (pos: GeolocationPosition) => this.userPosition.emit(pos));
      map.addControl(this.geolocate, 'top-right');
    }

    map.on('style.load', () => {
      this.localizeLabels();
      this.addLineLayers();
      this.styleVersion.update((v) => v + 1);
      this.renderLines(this.lines());
      if (this.styleVersion() === 1) this.ready.emit();
    });
    map.on('click', (e) => this.mapClick.emit([e.lngLat.lng, e.lngLat.lat]));

    new ResizeObserver(() => map.resize()).observe(el);
  }

  // --- öffentliche API -----------------------------------------------------

  fitTo(coords: LngLat[], animate = true) {
    if (!this.map) return;
    if (coords.length === 1) {
      this.map.jumpTo({ center: coords[0], zoom: Math.max(this.map.getZoom(), 15) });
      return;
    }
    const b = bounds(coords);
    if (b) this.map.fitBounds(b, { padding: 60, maxZoom: 17, animate });
  }

  flyTo(point: LngLat, zoom = 16) {
    this.map?.flyTo({ center: point, zoom });
  }

  getCenter(): LngLat | null {
    const c = this.map?.getCenter();
    return c ? [c.lng, c.lat] : null;
  }

  /** Startet die Standortanzeige (wie Tippen auf den Standort-Button). */
  locate() {
    this.geolocate?.trigger();
  }

  setStyle(key: MapStyleKey) {
    if (key === this.styleKey()) return;
    this.styleKey.set(key);
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, key);
    } catch {
      // ignorieren
    }
    this.map?.setStyle(MAP_STYLES[key].style);
  }

  // --- intern --------------------------------------------------------------

  /** Ortsnamen auf Deutsch anzeigen, wo die Vektorkarte sie hat. */
  private localizeLabels() {
    const map = this.map!;
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== 'symbol') continue;
      const field = map.getLayoutProperty(layer.id, 'text-field');
      if (!field || !JSON.stringify(field).includes('name')) continue;
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:de'], ['get', 'name']]);
    }
  }

  private addLineLayers() {
    const map = this.map!;
    if (map.getSource('lines')) return;
    map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const width = ['coalesce', ['get', 'width'], 5] as unknown as number;
    map.addLayer({
      id: 'lines-casing',
      type: 'line',
      source: 'lines',
      filter: ['!=', ['get', 'dashed'], true],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['+', width, 3] as unknown as number, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'lines',
      type: 'line',
      source: 'lines',
      filter: ['!=', ['get', 'dashed'], true],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'] as unknown as string, 'line-width': width },
    });
    map.addLayer({
      id: 'lines-dashed',
      type: 'line',
      source: 'lines',
      filter: ['==', ['get', 'dashed'], true],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'] as unknown as string,
        'line-width': width,
        'line-dasharray': [1.5, 1.5],
      },
    });
  }

  private renderLines(lines: MapLine[]) {
    const source = this.map?.getSource('lines') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: lines
        .filter((l) => l.coords.length >= 2)
        .map((l) => ({
          type: 'Feature',
          properties: { id: l.id, color: l.color ?? '#d84315', width: l.width ?? 5, dashed: !!l.dashed },
          geometry: { type: 'LineString', coordinates: l.coords },
        })),
    });
  }

  private renderMarkers(markers: MapMarker[]) {
    const map = this.map;
    const maplibre = this.maplibre;
    if (!map || !maplibre) return;
    const seen = new Set<string>();

    for (const m of markers) {
      seen.add(m.id);
      const key = `${m.type}|${!!m.selected}|${!!m.small}|${!!m.draggable}|${m.title ?? ''}`;
      const existing = this.markerObjects.get(m.id);
      if (existing && existing.key === key) {
        existing.marker.setLngLat(m.lngLat);
        continue;
      }
      existing?.marker.remove();
      const marker = new maplibre.Marker({ element: this.markerElement(m), draggable: !!m.draggable })
        .setLngLat(m.lngLat)
        .addTo(map);
      let dragged = false;
      marker.on('dragstart', () => (dragged = true));
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        this.markerDragEnd.emit({ id: m.id, lngLat: [ll.lng, ll.lat] });
        setTimeout(() => (dragged = false), 50);
      });
      marker.getElement().addEventListener('click', (e) => {
        e.stopPropagation();
        if (!dragged) this.markerClick.emit(m.id);
      });
      this.markerObjects.set(m.id, { marker, key });
    }

    for (const [id, { marker }] of this.markerObjects) {
      if (!seen.has(id)) {
        marker.remove();
        this.markerObjects.delete(id);
      }
    }
  }

  private markerElement(m: MapMarker): HTMLElement {
    const el = document.createElement('div');
    const info = m.type === 'meeting' ? null : waypointInfo(m.type);
    el.className = 'wp-marker' + (m.small ? ' small' : '') + (m.selected ? ' selected' : '');
    el.style.background = info?.color ?? MEETING_POINT_COLOR;
    el.textContent = info ? info.glyph : 'P';
    if (m.title || info) el.title = m.title ?? info!.label;
    return el;
  }
}
