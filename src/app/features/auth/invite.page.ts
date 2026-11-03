import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { InvitationInfo, SchoolService } from '../../core/data/school.service';
import { errorMessage } from '../../core/ui.service';

@Component({
  selector: 'app-invite',
  imports: [RouterLink, IonContent, IonButton, IonIcon, IonSpinner],
  styleUrl: './auth.scss',
  template: `
    <ion-content class="ion-padding">
      <div class="auth">
        <div class="brand">
          <ion-icon name="paw-outline" />
          <h1>Einladung</h1>
        </div>

        @if (loading()) {
          <div class="ion-text-center"><ion-spinner /></div>
        } @else if (!info() || !info()!.valid) {
          <div class="card">
            <p>Diese Einladung ist ungültig, abgelaufen oder wurde schon angenommen.</p>
            <ion-button expand="block" routerLink="/app" (click)="forget()">Weiter</ion-button>
          </div>
        } @else {
          <div class="card">
            <p>
              Du wurdest als <strong>{{ info()!.role === 'trainer' ? 'Trainer:in' : 'Kund:in' }}</strong>
              zu <strong>{{ info()!.school_name }}</strong> eingeladen.
            </p>
            <p class="muted">Einladung für {{ info()!.email }}</p>
          </div>

          @if (auth.session()) {
            @if (auth.email()?.toLowerCase() !== info()!.email.toLowerCase()) {
              <p class="muted">
                Du bist als {{ auth.email() }} angemeldet. Die Einladung gilt aber für
                {{ info()!.email }}.
              </p>
              <ion-button expand="block" fill="outline" (click)="switchAccount()">Anderes Konto verwenden</ion-button>
            } @else {
              <ion-button expand="block" (click)="accept()" [disabled]="busy()">Einladung annehmen</ion-button>
            }
          } @else {
            <ion-button expand="block" routerLink="/registrieren">Konto erstellen</ion-button>
            <ion-button expand="block" fill="outline" routerLink="/login">Ich habe schon ein Konto</ion-button>
          }
          @if (error()) {
            <p class="ion-text-center" style="color: var(--ion-color-danger)">{{ error() }}</p>
          }
        }
      </div>
    </ion-content>
  `,
})
export class InvitePage implements OnInit {
  readonly token = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly school = inject(SchoolService);
  private readonly router = inject(Router);

  protected readonly info = signal<InvitationInfo | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    addIcons({ pawOutline });
  }

  async ngOnInit() {
    await this.auth.whenReady();
    try {
      this.info.set(await this.school.invitationInfo(this.token()));
      // Token merken, damit die Einladung nach Registrierung/Login angenommen wird
      if (this.info()?.valid) this.auth.setPendingInvite(this.token());
      else this.auth.setPendingInvite(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  forget() {
    this.auth.setPendingInvite(null);
  }

  async switchAccount() {
    await this.auth.signOut();
    this.auth.setPendingInvite(this.token());
  }

  async accept() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.acceptInvitation(this.token());
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
