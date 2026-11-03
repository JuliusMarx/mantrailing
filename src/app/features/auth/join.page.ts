import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { JoinInfo, SchoolService } from '../../core/data/school.service';
import { errorMessage } from '../../core/ui.service';

/** Beitritt zu einer Hundeschule über deren Beitrittslink. */
@Component({
  selector: 'app-join',
  imports: [RouterLink, IonContent, IonButton, IonIcon, IonSpinner],
  styleUrl: './auth.scss',
  template: `
    <ion-content class="ion-padding">
      <div class="auth">
        <div class="brand">
          <ion-icon name="paw-outline" />
          <h1>Hundeschule beitreten</h1>
        </div>

        @if (loading()) {
          <div class="ion-text-center"><ion-spinner /></div>
        } @else if (!info()) {
          <div class="card">
            <p>Dieser Beitrittslink ist ungültig oder wurde von der Hundeschule abgeschaltet.</p>
            <p class="muted">Bitte frag deine Trainerin oder deinen Trainer nach dem aktuellen Link.</p>
            <ion-button expand="block" routerLink="/app" (click)="forget()">Weiter</ion-button>
          </div>
        } @else {
          <div class="card">
            <p>Du trittst <strong>{{ info()!.school_name }}</strong> als Kund:in bei.</p>
            <p class="muted">Danach siehst du Termine und Umfragen und kannst deine Hunde anmelden.</p>
          </div>

          @if (auth.session()) {
            @if (alreadyMember()) {
              <ion-button expand="block" (click)="open()">Zur Hundeschule</ion-button>
            } @else {
              <p class="muted ion-text-center">Angemeldet als {{ auth.email() }}</p>
              <ion-button expand="block" (click)="join()" [disabled]="busy()">Beitreten</ion-button>
              <ion-button expand="block" fill="clear" color="medium" (click)="switchAccount()">
                Anderes Konto verwenden
              </ion-button>
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
export class JoinPage implements OnInit {
  readonly token = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly school = inject(SchoolService);
  private readonly router = inject(Router);

  protected readonly info = signal<JoinInfo | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    addIcons({ pawOutline });
  }

  protected alreadyMember() {
    const id = this.info()?.school_id;
    return !!id && this.auth.memberships().some((m) => m.school_id === id);
  }

  async ngOnInit() {
    await this.auth.whenReady();
    try {
      this.info.set(await this.school.joinInfo(this.token()));
      // Link merken, damit der Beitritt nach Registrierung/Login weitergeht
      this.auth.setPendingJoin(this.info() && !this.alreadyMember() ? this.token() : null);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  forget() {
    this.auth.setPendingJoin(null);
  }

  async switchAccount() {
    await this.auth.signOut();
    this.auth.setPendingJoin(this.token());
  }

  async open() {
    this.auth.setPendingJoin(null);
    this.auth.selectSchool(this.info()!.school_id);
    await this.router.navigateByUrl('/app', { replaceUrl: true });
  }

  async join() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.joinSchool(this.token());
      await this.router.navigateByUrl('/app', { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
