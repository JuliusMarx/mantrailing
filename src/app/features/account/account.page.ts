import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { businessOutline, keyOutline, logOutOutline, pawOutline, trashOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { SchoolService } from '../../core/data/school.service';
import { UiService } from '../../core/ui.service';

@Component({
  selector: 'app-account',
  imports: [
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonNote,
    IonRadioGroup,
    IonRadio,
  ],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>Konto</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-list-header><ion-label>Profil</ion-label></ion-list-header>
        <ion-item>
          <ion-input label="Name" labelPlacement="stacked" [(ngModel)]="name" />
        </ion-item>
        <ion-item>
          <ion-input label="Telefon" labelPlacement="stacked" type="tel" inputmode="tel" [(ngModel)]="phone" />
        </ion-item>
        <ion-item lines="none">
          <ion-label class="muted">E-Mail: {{ auth.email() }}</ion-label>
        </ion-item>
      </ion-list>
      <div class="ion-padding-horizontal">
        <ion-button expand="block" (click)="saveProfile()" [disabled]="!dirty()">Profil speichern</ion-button>
      </div>

      @if (auth.isTrainer()) {
        <ion-list>
          <ion-list-header><ion-label>Meine Hunde</ion-label></ion-list-header>
          <ion-item routerLink="/app/hunde" detail>
            <ion-icon slot="start" name="paw-outline" />
            <ion-label>Hunde verwalten</ion-label>
          </ion-item>
        </ion-list>
      }

      <ion-list>
        <ion-list-header><ion-label>Hundeschule</ion-label></ion-list-header>
        @if (auth.memberships().length > 1) {
          <ion-radio-group [value]="auth.schoolId()" (ionChange)="switchSchool($any($event.detail.value))">
            @for (m of auth.memberships(); track m.school_id) {
              <ion-item>
                <ion-radio [value]="m.school_id" justify="space-between">
                  {{ m.schools?.name }}
                  <ion-note>&nbsp;· {{ m.role === 'trainer' ? 'Trainer:in' : 'Kund:in' }}</ion-note>
                </ion-radio>
              </ion-item>
            }
          </ion-radio-group>
        } @else {
          <ion-item>
            <ion-icon slot="start" name="business-outline" />
            <ion-label>
              {{ auth.schoolName() }}
              <p>{{ auth.isTrainer() ? 'Trainer:in' : 'Kund:in' }}</p>
            </ion-label>
          </ion-item>
        }
        @if (auth.isTrainer()) {
          <ion-item button detail="false" (click)="renameSchool()">
            <ion-label color="primary">Schule umbenennen</ion-label>
          </ion-item>
        }
        <ion-item button detail="false" (click)="createSchool()">
          <ion-label color="primary">Weitere Hundeschule anlegen</ion-label>
        </ion-item>
      </ion-list>

      <div class="ion-padding">
        <ion-button expand="block" fill="outline" (click)="changePassword()">
          <ion-icon slot="start" name="key-outline" />Passwort ändern
        </ion-button>
        <ion-button expand="block" fill="outline" (click)="logout()">
          <ion-icon slot="start" name="log-out-outline" />Abmelden
        </ion-button>
        <ion-button expand="block" fill="clear" color="danger" (click)="deleteAccount()">
          <ion-icon slot="start" name="trash-outline" />Konto löschen
        </ion-button>
      </div>
    </ion-content>
  `,
})
export class AccountPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly school = inject(SchoolService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);

  protected name = '';
  protected phone = '';
  private readonly original = signal({ name: '', phone: '' });

  constructor() {
    addIcons({ pawOutline, logOutOutline, trashOutline, businessOutline, keyOutline });
  }

  ionViewWillEnter() {
    const p = this.auth.profile();
    this.name = p?.full_name ?? '';
    this.phone = p?.phone ?? '';
    this.original.set({ name: this.name, phone: this.phone });
  }

  protected dirty() {
    const o = this.original();
    return this.name !== o.name || this.phone !== o.phone;
  }

  async saveProfile() {
    const ok = await this.ui.run(async () => {
      await this.auth.updateProfile({ full_name: this.name.trim(), phone: this.phone.trim() || null });
      return true;
    });
    if (ok) {
      this.original.set({ name: this.name, phone: this.phone });
      await this.ui.toast('Gespeichert', 'success');
    }
  }

  async switchSchool(id: string) {
    this.auth.selectSchool(id);
    await this.router.navigateByUrl('/app/termine', { replaceUrl: true });
  }

  private async prompt(header: string, value = ''): Promise<string | null> {
    const alert = await this.alerts.create({
      header,
      inputs: [{ name: 'value', type: 'text', value, placeholder: 'Name' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'OK', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const v = (data?.values?.value ?? '').trim();
    return role === 'confirm' && v ? v : null;
  }

  async renameSchool() {
    const name = await this.prompt('Schule umbenennen', this.auth.schoolName());
    if (name) await this.ui.run(() => this.school.renameSchool(name));
  }

  async createSchool() {
    const name = await this.prompt('Neue Hundeschule');
    if (!name) return;
    const id = await this.ui.run(() => this.auth.createSchool(name));
    if (id) await this.router.navigateByUrl('/app/termine', { replaceUrl: true });
  }

  async changePassword() {
    const alert = await this.alerts.create({
      header: 'Passwort ändern',
      inputs: [
        { name: 'current', type: 'password', placeholder: 'Aktuelles Passwort', attributes: { autocomplete: 'current-password' } },
        { name: 'next', type: 'password', placeholder: 'Neues Passwort (mind. 8 Zeichen)', attributes: { autocomplete: 'new-password' } },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Ändern', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const { current, next } = data?.values ?? {};
    const ok = await this.ui.run(async () => {
      await this.auth.changePassword(current ?? '', next ?? '');
      return true;
    });
    if (ok) await this.ui.toast('Passwort geändert', 'success');
  }

  async logout() {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async deleteAccount() {
    const ok = await this.ui.confirm(
      'Konto endgültig löschen?',
      'Dein Profil, deine Hunde und Anmeldungen werden gelöscht. Das kann nicht rückgängig gemacht werden.',
      'Endgültig löschen',
      true,
    );
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.auth.deleteAccount();
      return true;
    });
    if (done) await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
