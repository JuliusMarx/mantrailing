import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonAvatar,
  IonButtons,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { DogsService } from '../../core/data/dogs.service';
import { Dog } from '../../core/models';
import { UiService } from '../../core/ui.service';

export function dogAge(birthDate: string | null): string {
  if (!birthDate) return '';
  const born = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 12) return `${Math.max(0, months)} Monate`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 Jahr' : `${years} Jahre`;
}

@Component({
  selector: 'app-dogs',
  imports: [
    IonMenuButton,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonAvatar,
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>Meine Hunde</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/app/hunde/neu" aria-label="Hund hinzufügen">
            <ion-icon slot="icon-only" name="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (loaded() && !dogs().length) {
        <div class="empty-state">
          <ion-icon name="paw-outline" />
          <p>Lege deinen ersten Hund an, damit du ihn zu Terminen anmelden kannst.</p>
        </div>
      }
      <ion-list>
        @for (dog of dogs(); track dog.id) {
          <ion-item [routerLink]="['/app/hunde', dog.id]" detail>
            <ion-avatar slot="start" class="avatar">{{ dog.name.charAt(0) }}</ion-avatar>
            <ion-label>
              <h2>{{ dog.name }}</h2>
              <p>{{ dog.breed || 'Rasse unbekannt' }}{{ dog.birth_date ? ' · ' + age(dog.birth_date) : '' }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
      @if (loaded() && !dogs().length) {
        <div class="ion-padding">
          <ion-button expand="block" routerLink="/app/hunde/neu">Hund hinzufügen</ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .avatar {
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
    }
  `,
})
export class DogsPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly service = inject(DogsService);
  private readonly ui = inject(UiService);

  protected readonly dogs = signal<Dog[]>([]);
  protected readonly loaded = signal(false);
  protected readonly age = dogAge;

  constructor() {
    addIcons({ add, pawOutline });
  }

  async ionViewWillEnter() {
    try {
      this.dogs.set(await this.service.mine());
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loaded.set(true);
    }
  }
}
