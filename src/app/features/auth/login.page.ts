import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonList,
  IonNote,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { isSupabaseConfigured } from '../../core/supabase.service';
import { errorMessage, UiService } from '../../core/ui.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, IonContent, IonInput, IonButton, IonList, IonIcon, IonNote, IonSpinner],
  styleUrl: './auth.scss',
  template: `
    <ion-content class="ion-padding">
      <div class="auth">
        <div class="brand">
          <ion-icon name="paw-outline" />
          <h1>Mantrailing</h1>
          <p class="muted">Trails planen, Termine finden.</p>
        </div>

        @if (!configured) {
          <ion-note color="danger" class="config-hint">
            Supabase ist noch nicht konfiguriert. Trage URL und Anon-Key in
            <code>src/environments/environment.ts</code> ein.
          </ion-note>
        }

        <form (ngSubmit)="submit()">
          <ion-list lines="none">
            <ion-input
              fill="outline"
              label="E-Mail"
              labelPlacement="floating"
              type="email"
              autocomplete="email"
              inputmode="email"
              name="email"
              [(ngModel)]="email"
              required
            />
            <ion-input
              fill="outline"
              label="Passwort"
              labelPlacement="floating"
              type="password"
              autocomplete="current-password"
              name="password"
              [(ngModel)]="password"
            />
          </ion-list>
          @if (error()) {
            <ion-note color="danger">{{ error() }}</ion-note>
          }
          <ion-button expand="block" type="submit" [disabled]="busy() || !email">
            @if (busy()) {
              <ion-spinner name="dots" />
            } @else {
              Anmelden
            }
          </ion-button>
          <ion-button expand="block" fill="clear" (click)="magicLink()" [disabled]="busy() || !email">
            Login-Link per E-Mail
          </ion-button>
        </form>

        <p class="switch">
          Neu hier? <a routerLink="/registrieren">Konto erstellen</a>
        </p>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ui = inject(UiService);

  protected readonly configured = isSupabaseConfigured;
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    addIcons({ pawOutline });
  }

  async submit() {
    if (!this.email || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signIn(this.email.trim(), this.password);
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async magicLink() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.sendMagicLink(this.email.trim());
      await this.ui.toast('Link verschickt – schau in dein Postfach.', 'success');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
