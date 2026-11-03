import { Component, inject, input, OnInit, signal } from '@angular/core';
import { IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar, IonButton } from '@ionic/angular/standalone';
import { TrailsService } from '../../core/data/trails.service';
import { SharedTrail } from '../../core/models';
import { errorMessage } from '../../core/ui.service';
import { TrailFactsComponent } from '../../shared/trail-view/trail-facts.component';
import { TrailViewComponent } from '../../shared/trail-view/trail-view.component';

/** Öffentliche Ansicht eines geteilten Trails – ohne Login. */
@Component({
  selector: 'app-shared-trail',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner, IonButton, TrailViewComponent, TrailFactsComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ trail()?.name ?? 'Geteilter Trail' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [scrollY]="!full()">
      @if (loading()) {
        <div class="ion-padding ion-text-center"><ion-spinner /></div>
      } @else if (!trail()) {
        <div class="empty-state">
          <p>{{ error() || 'Dieser Link ist ungültig oder die Freigabe wurde beendet.' }}</p>
        </div>
      } @else {
        <div class="map-box" [class.full]="full()">
          <app-trail-view [route]="trail()!.route" [waypoints]="trail()!.waypoints" [totalLength]="trail()!.length_m" />
          <ion-button class="toggle" size="small" color="light" (click)="full.set(!full())">
            {{ full() ? 'Details' : 'Vollbild' }}
          </ion-button>
        </div>
        @if (!full()) {
          <div class="ion-padding">
            <p class="muted">Geteilt von {{ trail()!.school_name }}</p>
            <app-trail-facts
              [length]="trail()!.length_m"
              [difficulty]="trail()!.difficulty"
              [surface]="trail()!.surface"
              [description]="trail()!.description"
              [waypoints]="trail()!.waypoints"
            />
            <p class="muted small">
              Tippe auf der Karte auf den Standort-Button, um deine Position zu sehen. Die App
              warnt dich, wenn du von der Route abweichst.
            </p>
          </div>
        }
      }
    </ion-content>
  `,
  styles: `
    .map-box {
      position: relative;
      height: 60vh;
    }
    .map-box.full {
      position: absolute;
      inset: 0;
      height: auto;
    }
    .toggle {
      position: absolute;
      right: 8px;
      bottom: calc(8px + env(safe-area-inset-bottom));
      z-index: 6;
    }
    .small {
      font-size: 13px;
    }
  `,
})
export class SharedTrailPage implements OnInit {
  readonly token = input.required<string>();

  private readonly trails = inject(TrailsService);
  protected readonly trail = signal<SharedTrail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly full = signal(false);

  async ngOnInit() {
    try {
      this.trail.set(await this.trails.getShared(this.token()));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
