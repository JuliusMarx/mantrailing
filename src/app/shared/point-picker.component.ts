import { Component, computed, input, model, signal, viewChild } from '@angular/core';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircleOutline, search } from 'ionicons/icons';
import { GeoPoint, LngLat } from '../core/models';
import { geocode } from '../core/routing.service';
import { MapComponent, MapMarker } from './map/map.component';

/** Treffpunkt wählen: auf die Karte tippen oder die Adresse suchen. */
@Component({
  selector: 'app-point-picker',
  imports: [MapComponent, IonButton, IonIcon, IonSpinner],
  template: `
    <div class="map-wrap">
      <app-map
        [markers]="markers()"
        [center]="point()?.coordinates ?? null"
        [zoom]="point() ? 15 : null"
        [showUserLocation]="true"
        [showStyleSwitch]="false"
        (mapClick)="set($event)"
        (markerDragEnd)="set($event.lngLat)"
      />
    </div>
    <div class="row">
      <ion-button size="small" fill="outline" (click)="searchAddress()" [disabled]="!address() || searching()">
        @if (searching()) {
          <ion-spinner name="dots" />
        } @else {
          <ion-icon slot="start" name="search" />Adresse auf Karte suchen
        }
      </ion-button>
      @if (point()) {
        <ion-button size="small" fill="clear" color="medium" (click)="point.set(null)">
          <ion-icon slot="start" name="close-circle-outline" />Entfernen
        </ion-button>
      }
    </div>
    @if (message()) {
      <p class="muted small">{{ message() }}</p>
    }
  `,
  styles: `
    .map-wrap {
      position: relative;
      height: 220px;
      border-radius: 12px;
      overflow: hidden;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
    }
    .small {
      font-size: 13px;
      margin: 4px 0 0;
    }
  `,
})
export class PointPickerComponent {
  readonly point = model<GeoPoint | null>(null);
  readonly address = input<string | null>(null);

  private readonly map = viewChild.required(MapComponent);
  protected readonly searching = signal(false);
  protected readonly message = signal('Tippe auf die Karte, um den Treffpunkt zu setzen.');

  protected readonly markers = computed<MapMarker[]>(() => {
    const p = this.point();
    return p ? [{ id: 'meeting', lngLat: p.coordinates, type: 'meeting', draggable: true }] : [];
  });

  constructor() {
    addIcons({ search, closeCircleOutline });
  }

  protected set(lngLat: LngLat) {
    this.point.set({ type: 'Point', coordinates: [round(lngLat[0]), round(lngLat[1])] });
    this.message.set('');
  }

  protected async searchAddress() {
    const query = this.address()?.trim();
    if (!query) return;
    this.searching.set(true);
    try {
      const [hit] = await geocode(query);
      if (!hit) {
        this.message.set('Adresse nicht gefunden – setze den Punkt bitte von Hand.');
        return;
      }
      this.set(hit.point);
      this.map().flyTo(hit.point, 16);
    } catch {
      this.message.set('Suche fehlgeschlagen.');
    } finally {
      this.searching.set(false);
    }
  }
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
