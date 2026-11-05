import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
  IonMenuButton,
  IonButtons,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, linkOutline, mapOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { TrailsService } from '../../core/data/trails.service';
import { formatDistance } from '../../core/geo';
import { Trail, TrailAssignment } from '../../core/models';
import { UiService } from '../../core/ui.service';

@Component({
  selector: 'app-trails',
  imports: [
    IonMenuButton,
    IonButtons,
    IonButton,
    DatePipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonBadge,
    IonSkeletonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ auth.isTrainer() ? 'Trails' : 'Meine Trails' }}</ion-title>
        @if (auth.isTrainer()) {
          <ion-buttons slot="end">
            <ion-button routerLink="/editor/neu" aria-label="Neuer Trail">
              <ion-icon slot="icon-only" name="add" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="load($event)">
        <ion-refresher-content />
      </ion-refresher>

      @if (loading()) {
        <ion-list>
          @for (i of [1, 2, 3]; track i) {
            <ion-item><ion-label><ion-skeleton-text animated style="width: 70%" /><ion-skeleton-text animated style="width: 40%" /></ion-label></ion-item>
          }
        </ion-list>
      } @else if (auth.isTrainer()) {
        @if (!trails().length) {
          <div class="empty-state">
            <ion-icon name="map-outline" />
            <p>Noch keine Trails. Tippe oben rechts auf +, um den ersten Trail auf der Karte einzuzeichnen.</p>
          </div>
        }
        <ion-list>
          @for (t of trails(); track t.id) {
            <ion-item [routerLink]="['/app/trails', t.id]" detail>
              <ion-label>
                <h2>{{ t.name }}</h2>
                <p>{{ distance(t.length_m) }}{{ t.surface ? ' · ' + t.surface : '' }}{{ t.difficulty ? ' · Stufe ' + t.difficulty : '' }}</p>
                <p class="muted">Geändert {{ t.updated_at | date: 'd. MMM y' }}</p>
              </ion-label>
              @if (t.share_token) {
                <ion-icon slot="end" name="link-outline" color="medium" aria-label="Geteilt" />
              }
            </ion-item>
          }
        </ion-list>
      } @else {
        @if (!assignments().length) {
          <div class="empty-state">
            <ion-icon name="map-outline" />
            <p>Hier erscheinen Trails, die dir deine Trainerin oder dein Trainer schickt.</p>
          </div>
        }
        <ion-list>
          @for (a of assignments(); track a.id) {
            <ion-item [routerLink]="['/app/trails', a.trail_id]" detail>
              <ion-label>
                <h2>{{ a.trails?.name }}</h2>
                <p>{{ distance(a.trails?.length_m ?? 0) }}{{ a.trails?.surface ? ' · ' + a.trails?.surface : '' }}</p>
                @if (a.message) {
                  <p class="muted">„{{ a.message }}“</p>
                }
                <ion-note>Erhalten {{ a.created_at | date: 'd. MMM' }}</ion-note>
              </ion-label>
              @if (!a.seen_at) {
                <ion-badge slot="end" color="secondary">Neu</ion-badge>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class TrailsPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly service = inject(TrailsService);
  private readonly ui = inject(UiService);

  protected readonly trails = signal<Trail[]>([]);
  protected readonly assignments = signal<TrailAssignment[]>([]);
  protected readonly loading = signal(true);
  protected readonly distance = formatDistance;

  constructor() {
    addIcons({ add, mapOutline, linkOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  async load(event?: CustomEvent) {
    try {
      if (this.auth.isTrainer()) this.trails.set(await this.service.list());
      else this.assignments.set(await this.service.mine());
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }
}
