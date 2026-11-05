import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonList, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { UiService } from '../../core/ui.service';

/** Onboarding für angemeldete Nutzer ohne Schule. */
@Component({
  selector: 'app-welcome',
  imports: [FormsModule, RouterLink, IonContent, IonButton, IonIcon, IonInput, IonList, IonNote],
  styleUrl: './auth.scss',
  template: `
    <ion-content class="ion-padding">
      <div class="auth">
        <div class="brand">
          <ion-icon name="paw-outline" />
          <h1>Willkommen{{ auth.profile()?.full_name ? ', ' + auth.profile()!.full_name : '' }}!</h1>
          <p class="muted">Du bist noch keiner Hundeschule zugeordnet.</p>
        </div>

        <div class="card">
          <h3>Ich bin Kund:in</h3>
          <p class="muted">
            Deine Trainerin oder dein Trainer schickt dir den Beitrittslink der Hundeschule. Öffne
            ihn einfach oder füge ihn hier ein.
          </p>
          <ion-list lines="none">
            <ion-input fill="outline" label="Beitrittslink" labelPlacement="floating" name="link" [(ngModel)]="link" />
          </ion-list>
          <ion-button expand="block" (click)="openJoinLink()" [disabled]="!link">Beitreten</ion-button>
        </div>

        <div class="card">
          <h3>Ich bin Trainer:in</h3>
          <p class="muted">Lege deine eigene Hundeschule an und lade danach deine Kund:innen ein.</p>
          <ion-list lines="none">
            <ion-input fill="outline" label="Name der Hundeschule" labelPlacement="floating" name="school" [(ngModel)]="schoolName" />
          </ion-list>
          <ion-button expand="block" (click)="createSchool()" [disabled]="schoolName.trim().length < 2 || busy()">
            Hundeschule anlegen
          </ion-button>
        </div>

        @if (auth.isAdmin()) {
          <ion-button expand="block" color="dark" routerLink="/admin">Zum Backoffice</ion-button>
        }
        @if (error()) {
          <ion-note color="danger">{{ error() }}</ion-note>
        }
        <ion-button expand="block" fill="clear" color="medium" (click)="logout()">Abmelden</ion-button>
      </div>
    </ion-content>
  `,
})
export class WelcomePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ui = inject(UiService);

  protected link = '';
  protected schoolName = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    addIcons({ pawOutline });
  }

  openJoinLink() {
    const token = this.link.trim().split('/beitreten/').pop()?.split(/[?#/]/)[0];
    if (!token) {
      this.error.set('Das sieht nicht nach einem Beitrittslink aus.');
      return;
    }
    this.router.navigate(['/beitreten', token]);
  }

  async createSchool() {
    this.busy.set(true);
    const id = await this.ui.run(() => this.auth.createSchool(this.schoolName.trim()));
    this.busy.set(false);
    if (id) await this.router.navigateByUrl('/app', { replaceUrl: true });
  }

  async logout() {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
