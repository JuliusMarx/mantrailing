import { Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline, personAddOutline, trashOutline } from 'ionicons/icons';
import { AdminSchoolMember, AdminService } from '../../core/data/admin.service';
import { Role } from '../../core/models';
import { UiService } from '../../core/ui.service';

/** Backoffice: eine Hundeschule mit Mitgliedern bearbeiten. */
@Component({
  selector: 'app-admin-school',
  imports: [
    DatePipe,
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
    IonBadge,
    IonNote,
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-buttons slot="start"><ion-back-button defaultHref="/admin" /></ion-buttons>
        <ion-title>{{ name() || 'Hundeschule' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (loaded() && !name()) {
        <div class="empty-state"><p>Hundeschule nicht gefunden.</p></div>
      } @else {
        <div class="ion-padding">
          <h1>{{ name() }}</h1>
          <p class="muted">Angelegt am {{ createdAt() | date: 'd. MMMM y' }}</p>
          <ion-button size="small" fill="outline" (click)="rename()">
            <ion-icon slot="start" name="create-outline" />Umbenennen
          </ion-button>
        </div>

        <ion-list>
          <ion-list-header>
            <ion-label>Mitglieder ({{ members().length }})</ion-label>
            <ion-button (click)="addMember()"><ion-icon slot="start" name="person-add-outline" />Hinzufügen</ion-button>
          </ion-list-header>
          @for (m of members(); track m.user_id) {
            <ion-item button detail="false" (click)="memberMenu(m)">
              <ion-label>
                <h3>
                  {{ m.full_name || 'Ohne Namen' }}
                  @if (m.role === 'trainer') { <ion-badge color="primary">Trainer:in</ion-badge> }
                </h3>
                <p>{{ m.email }} · {{ m.dogs }} Hunde</p>
              </ion-label>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>Keine Mitglieder.</ion-note></ion-item>
          }
        </ion-list>

        <div class="ion-padding">
          <ion-button expand="block" fill="clear" color="danger" (click)="remove()">
            <ion-icon slot="start" name="trash-outline" />Hundeschule löschen
          </ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    h1 {
      margin: 0 0 4px;
    }
    h3 ion-badge {
      margin-left: 6px;
      font-size: 11px;
      vertical-align: middle;
    }
  `,
})
export class AdminSchoolPage implements ViewWillEnter {
  readonly id = input.required<string>();

  private readonly admin = inject(AdminService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);

  protected readonly name = signal('');
  protected readonly createdAt = signal<string | null>(null);
  protected readonly members = signal<AdminSchoolMember[]>([]);
  protected readonly loaded = signal(false);

  constructor() {
    addIcons({ createOutline, personAddOutline, trashOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  private async load() {
    try {
      const data = await this.admin.school(this.id());
      this.name.set(data?.school.name ?? '');
      this.createdAt.set(data?.school.created_at ?? null);
      this.members.set(data?.members ?? []);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loaded.set(true);
    }
  }

  async rename() {
    const alert = await this.alerts.create({
      header: 'Hundeschule umbenennen',
      inputs: [{ name: 'name', type: 'text', value: this.name() }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Speichern', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const name = (data?.values?.name ?? '').trim();
    if (role !== 'confirm' || !name) return;
    await this.ui.run(() => this.admin.renameSchool(this.id(), name));
    await this.load();
  }

  async addMember() {
    const alert = await this.alerts.create({
      header: 'Mitglied hinzufügen',
      message: 'Das Konto muss schon existieren.',
      inputs: [{ name: 'email', type: 'email', placeholder: 'E-Mail-Adresse des Kontos' }],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Als Kund:in', role: 'customer' },
        { text: 'Als Trainer:in', role: 'trainer' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'customer' && role !== 'trainer') return;
    const done = await this.ui.run(async () => {
      await this.admin.addMember(this.id(), data?.values?.email ?? '', role as Role);
      return true;
    });
    if (done) await this.load();
  }

  async memberMenu(m: AdminSchoolMember) {
    const sheet = await this.actionSheets.create({
      header: m.full_name || m.email,
      buttons: [
        m.role === 'customer'
          ? { text: 'Zur Trainer:in machen', data: 'trainer' }
          : { text: 'Zur Kund:in machen', data: 'customer' },
        { text: 'Nutzer:in öffnen', data: 'open' },
        { text: 'Aus der Schule entfernen', role: 'destructive', data: 'remove' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'open') await this.router.navigate(['/admin/nutzer', m.user_id]);
    if (data === 'trainer' || data === 'customer') {
      await this.ui.run(() => this.admin.setRole(this.id(), m.user_id, data));
      await this.load();
    }
    if (data === 'remove' && (await this.ui.confirm('Mitglied entfernen?', `${m.full_name || m.email} verliert den Zugriff auf diese Schule.`, 'Entfernen', true))) {
      await this.ui.run(() => this.admin.removeMember(this.id(), m.user_id));
      await this.load();
    }
  }

  async remove() {
    const ok = await this.ui.confirm(
      `„${this.name()}“ löschen?`,
      'Alle Termine, Umfragen, Trails und Mitgliedschaften dieser Schule werden endgültig gelöscht. Konten und Hunde bleiben erhalten.',
      'Endgültig löschen',
      true,
    );
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.admin.deleteSchool(this.id());
      return true;
    });
    if (done) {
      await this.ui.toast('Hundeschule gelöscht', 'success');
      this.nav.navigateBack('/admin');
    }
  }
}
