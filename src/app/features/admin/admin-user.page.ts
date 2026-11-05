import { Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { keyOutline, pawOutline, trashOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { AdminService, AdminUserDetail } from '../../core/data/admin.service';
import { UiService } from '../../core/ui.service';

/** Backoffice: ein Konto bearbeiten. */
@Component({
  selector: 'app-admin-user',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonInput,
    IonToggle,
    IonBadge,
    IonNote,
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons>
        <ion-title>{{ detail()?.user?.full_name || 'Nutzer:in' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (detail(); as d) {
        <ion-list>
          <ion-list-header><ion-label>Konto</ion-label></ion-list-header>
          <ion-item><ion-input label="Name" labelPlacement="stacked" [(ngModel)]="fullName" /></ion-item>
          <ion-item><ion-input label="E-Mail (Login)" labelPlacement="stacked" type="email" [(ngModel)]="email" /></ion-item>
          <ion-item><ion-input label="Telefon" labelPlacement="stacked" type="tel" [(ngModel)]="phone" /></ion-item>
          <ion-item lines="none">
            <ion-note>Registriert am {{ d.user.created_at | date: 'd. MMMM y, HH:mm' }}</ion-note>
          </ion-item>
        </ion-list>
        <div class="ion-padding-horizontal">
          <ion-button expand="block" (click)="save()">Speichern</ion-button>
        </div>

        <ion-list>
          <ion-item>
            <ion-toggle [checked]="d.user.is_admin" (ionChange)="setAdmin($event.detail.checked)">
              Admin (Backoffice)
            </ion-toggle>
          </ion-item>
        </ion-list>

        <ion-list>
          <ion-list-header><ion-label>Hundeschulen</ion-label></ion-list-header>
          @for (m of d.memberships; track m.school_id) {
            <ion-item [routerLink]="['/admin/schulen', m.school_id]" detail>
              <ion-label>{{ m.school_name }}</ion-label>
              <ion-badge slot="end" [color]="m.role === 'trainer' ? 'primary' : 'medium'">
                {{ m.role === 'trainer' ? 'Trainer:in' : 'Kund:in' }}
              </ion-badge>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>Keiner Hundeschule zugeordnet.</ion-note></ion-item>
          }
        </ion-list>

        <ion-list>
          <ion-list-header><ion-label>Hunde</ion-label></ion-list-header>
          @for (dog of d.dogs; track dog.id) {
            <ion-item>
              <ion-icon slot="start" name="paw-outline" color="medium" />
              <ion-label>
                <h3>{{ dog.name }}</h3>
                <p>{{ dog.breed || 'Rasse unbekannt' }}</p>
              </ion-label>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>Keine Hunde.</ion-note></ion-item>
          }
        </ion-list>

        <div class="ion-padding">
          <ion-button expand="block" fill="outline" (click)="resetPassword()">
            <ion-icon slot="start" name="key-outline" />Passwort zurücksetzen
          </ion-button>
          @if (d.user.id !== auth.userId()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="remove()">
              <ion-icon slot="start" name="trash-outline" />Konto löschen
            </ion-button>
          }
        </div>
      } @else if (loaded()) {
        <div class="empty-state"><p>Konto nicht gefunden.</p></div>
      }
    </ion-content>
  `,
})
export class AdminUserPage implements ViewWillEnter {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly admin = inject(AdminService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);
  private readonly alerts = inject(AlertController);

  protected readonly detail = signal<AdminUserDetail | null>(null);
  protected readonly loaded = signal(false);
  protected fullName = '';
  protected email = '';
  protected phone = '';

  constructor() {
    addIcons({ keyOutline, trashOutline, pawOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  private async load() {
    try {
      const d = await this.admin.user(this.id());
      this.detail.set(d);
      this.fullName = d?.user.full_name ?? '';
      this.email = d?.user.email ?? '';
      this.phone = d?.user.phone ?? '';
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loaded.set(true);
    }
  }

  async save() {
    const ok = await this.ui.run(async () => {
      await this.admin.updateUser(this.id(), {
        full_name: this.fullName.trim(),
        email: this.email.trim(),
        phone: this.phone.trim() || null,
      });
      return true;
    });
    if (ok) {
      await this.ui.toast('Gespeichert', 'success');
      await this.load();
    }
  }

  async setAdmin(admin: boolean) {
    const ok = await this.ui.run(async () => {
      await this.admin.setAdmin(this.id(), admin);
      return true;
    });
    if (ok && this.id() === this.auth.userId() && !admin) this.auth.isAdmin.set(false);
    await this.load();
  }

  async resetPassword() {
    const name = this.detail()?.user.full_name || this.detail()?.user.email;
    if (!(await this.ui.confirm('Passwort zurücksetzen?', `${name} bekommt ein neues Einmal-Passwort, das alte gilt nicht mehr.`, 'Zurücksetzen'))) {
      return;
    }
    const password = await this.ui.run(() => this.admin.resetPassword(this.id()));
    if (!password) return;
    const alert = await this.alerts.create({
      header: 'Neues Passwort',
      message: `Gib ${name} dieses Passwort weiter: ${password} – es lässt sich danach unter „Konto“ ändern.`,
      buttons: [
        { text: 'Kopieren', handler: () => void navigator.clipboard.writeText(password) },
        { text: 'OK', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  async remove() {
    const name = this.detail()?.user.full_name || this.detail()?.user.email;
    const ok = await this.ui.confirm(
      `Konto von ${name} löschen?`,
      'Profil, Hunde, Anmeldungen und Mitgliedschaften werden endgültig gelöscht.',
      'Endgültig löschen',
      true,
    );
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.admin.deleteUser(this.id());
      return true;
    });
    if (done) {
      await this.ui.toast('Konto gelöscht', 'success');
      this.nav.navigateBack('/admin');
    }
  }
}
