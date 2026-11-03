import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonList, IonNote, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/ui.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, IonContent, IonInput, IonButton, IonList, IonIcon, IonNote, IonSpinner],
  styleUrl: './auth.scss',
  template: `
    <ion-content class="ion-padding">
      <div class="auth">
        <div class="brand">
          <ion-icon name="paw-outline" />
          <h1>Konto erstellen</h1>
        </div>

        <form (ngSubmit)="submit()">
          <ion-list lines="none">
            <ion-input fill="outline" label="Name" labelPlacement="floating" autocomplete="name"
              name="name" [(ngModel)]="name" required />
            <ion-input fill="outline" label="E-Mail" labelPlacement="floating" type="email"
              autocomplete="email" inputmode="email" name="email" [(ngModel)]="email" required />
            <ion-input fill="outline" label="Passwort (mind. 8 Zeichen)" labelPlacement="floating"
              type="password" autocomplete="new-password" name="password" [(ngModel)]="password" />
          </ion-list>
          @if (error()) {
            <ion-note color="danger">{{ error() }}</ion-note>
          }
          <ion-button expand="block" type="submit" [disabled]="busy() || !valid()">
            @if (busy()) {
              <ion-spinner name="dots" />
            } @else {
              Registrieren
            }
          </ion-button>
        </form>
        <p class="switch">Schon ein Konto? <a routerLink="/login">Anmelden</a></p>
      </div>
    </ion-content>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    addIcons({ pawOutline });
  }

  protected valid() {
    return this.name.trim().length > 1 && this.email.includes('@') && this.password.length >= 8;
  }

  async submit() {
    if (!this.valid()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signUp(this.email.trim(), this.password, this.name.trim());
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
