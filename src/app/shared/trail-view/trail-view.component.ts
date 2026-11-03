import { Component, computed, input, signal, viewChild } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { navigateOutline, scanOutline } from 'ionicons/icons';
import { distanceToLine, formatDistance } from '../../core/geo';
import { GeoLine, LngLat, TrailPoint } from '../../core/models';
import { MapComponent, MapLine, MapMarker } from '../map/map.component';

/** Ab dieser Entfernung zur Route gilt man als "abseits". */
const OFF_ROUTE_M = 25;

/**
 * Nur-Lese-Ansicht eines Trails mit Live-Position: zeigt, wie weit man auf der Route ist
 * und warnt, wenn man von ihr abweicht.
 */
@Component({
  selector: 'app-trail-view',
  imports: [MapComponent, IonButton, IonIcon],
  template: `
    <app-map
      [lines]="lines()"
      [markers]="markers()"
      [fitCoords]="coords()"
      [showUserLocation]="true"
      (userPosition)="onPosition($event)"
    />
    @if (progress(); as p) {
      <div class="status" [class.off]="p.off">
        @if (p.off) {
          <strong>Abseits der Route</strong>
          <span>{{ p.distanceText }} entfernt</span>
        } @else {
          <strong>Auf der Route</strong>
          <span>{{ p.alongText }} von {{ totalText() }}</span>
        }
      </div>
    }
    <div class="actions">
      <ion-button size="small" color="light" (click)="fit()" aria-label="Ganze Route zeigen">
        <ion-icon slot="icon-only" name="scan-outline" />
      </ion-button>
      <ion-button size="small" color="light" (click)="locate()" aria-label="Meine Position verfolgen">
        <ion-icon slot="icon-only" name="navigate-outline" />
      </ion-button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      height: 100%;
    }
    app-map {
      position: absolute;
      inset: 0;
    }
    .status {
      position: absolute;
      top: 8px;
      left: 8px;
      right: 64px;
      background: var(--ion-color-success);
      color: #fff;
      border-radius: 12px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      z-index: 5;
    }
    .status.off {
      background: var(--ion-color-danger);
    }
    .actions {
      position: absolute;
      left: 8px;
      bottom: calc(var(--trail-view-bottom, 8px) + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      z-index: 5;
    }
  `,
})
export class TrailViewComponent {
  readonly route = input<GeoLine | null>(null);
  readonly waypoints = input<TrailPoint[]>([]);
  readonly totalLength = input(0);

  private readonly map = viewChild.required(MapComponent);
  private readonly position = signal<LngLat | null>(null);

  protected readonly coords = computed<LngLat[]>(() => {
    const line = this.route()?.coordinates ?? [];
    return line.length ? line : this.waypoints().map((p) => [p.lng, p.lat] as LngLat);
  });

  protected readonly lines = computed<MapLine[]>(() => [
    { id: 'route', coords: this.route()?.coordinates ?? [], color: '#d84315', width: 5 },
  ]);

  protected readonly markers = computed<MapMarker[]>(() =>
    this.waypoints()
      .filter((p) => p.type !== 'via')
      .map((p) => ({ id: p.id, lngLat: [p.lng, p.lat] as LngLat, type: p.type, title: p.note })),
  );

  protected readonly totalText = computed(() => formatDistance(this.totalLength()));

  protected readonly progress = computed(() => {
    const pos = this.position();
    const line = this.route()?.coordinates;
    if (!pos || !line?.length) return null;
    const { distance, along } = distanceToLine(pos, line);
    return {
      off: distance > OFF_ROUTE_M,
      distanceText: formatDistance(distance),
      alongText: formatDistance(along),
    };
  });

  constructor() {
    addIcons({ navigateOutline, scanOutline });
  }

  protected onPosition(pos: GeolocationPosition) {
    this.position.set([pos.coords.longitude, pos.coords.latitude]);
  }

  fit() {
    this.map().fitTo(this.coords());
  }

  locate() {
    this.map().locate();
  }
}
