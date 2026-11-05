import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, businessOutline, logOutOutline, pawOutline, peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { AdminDog, AdminSchool, AdminService, AdminStats, AdminUser } from '../../core/data/admin.service';
import { UiService } from '../../core/ui.service';

type Tab = 'schools' | 'users' | 'dogs';

/** Backoffice: Übersicht und Listen aller Hundeschulen, Nutzer:innen und Hunde. */
@Component({
  selector: 'app-admin',
  imports: [
    DatePipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSearchbar,
    IonList,
    IonItem,
    IonNote,
    IonBadge,
    IonRefresher,
    IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        @if (auth.memberships().length) {
          <ion-buttons slot="start">
            <ion-button routerLink="/app" aria-label="Zur App"><ion-icon slot="icon-only" name="arrow-back" /></ion-button>
          </ion-buttons>
        }
        <ion-title>Backoffice</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="logout()" aria-label="Abmelden"><ion-icon slot="icon-only" name="log-out-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="setTab($any($event.detail.value))">
          <ion-segment-button value="schools"><ion-label>Schulen</ion-label></ion-segment-button>
          <ion-segment-button value="users"><ion-label>Nutzer</ion-label></ion-segment-button>
          <ion-segment-button value="dogs"><ion-label>Hunde</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      @if (stats(); as s) {
        <div class="stats">
          <div><strong>{{ s.schools }}</strong><span>Schulen</span></div>
          <div><strong>{{ s.users }}</strong><span>Nutzer</span></div>
          <div><strong>{{ s.dogs }}</strong><span>Hunde</span></div>
          <div><strong>{{ s.upcoming_appointments }}</strong><span>Termine</span></div>
          <div><strong>{{ s.open_polls }}</strong><span>Umfragen</span></div>
          <div><strong>{{ s.trails }}</strong><span>Trails</span></div>
        </div>
      }

      <ion-searchbar
        [placeholder]="placeholder()"
        [debounce]="250"
        [value]="query()"
        (ionInput)="search($any($event.target).value ?? '')"
      />

      @switch (tab()) {
        @case ('schools') {
          <ion-list>
            @for (s of schools(); track s.id) {
              <ion-item [routerLink]="['/admin/schulen', s.id]" detail>
                <ion-icon slot="start" name="business-outline" color="medium" />
                <ion-label>
                  <h2>{{ s.name }}</h2>
                  <p>{{ s.trainer_names || 'Keine Trainer:innen' }}</p>
                  <p class="muted">
                    {{ s.customers }} Kund:innen · {{ s.appointments }} Termine · {{ s.trails }} Trails
                  </p>
                </ion-label>
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-note>Keine Hundeschulen gefunden.</ion-note></ion-item>
            }
          </ion-list>
        }
        @case ('users') {
          <ion-list>
            @for (u of users(); track u.id) {
              <ion-item [routerLink]="['/admin/nutzer', u.id]" detail>
                <ion-label>
                  <h2>
                    {{ u.full_name || 'Ohne Namen' }}
                    @if (u.is_admin) { <ion-badge color="dark">Admin</ion-badge> }
                  </h2>
                  <p>{{ u.email }}</p>
                  <p class="muted">
                    {{ u.schools }} {{ u.schools === 1 ? 'Schule' : 'Schulen' }} · {{ u.dogs }} Hunde ·
                    seit {{ u.created_at | date: 'd. MMM y' }}
                  </p>
                </ion-label>
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-note>Keine Nutzer:innen gefunden.</ion-note></ion-item>
            }
          </ion-list>
        }
        @case ('dogs') {
          <ion-list>
            @for (d of dogs(); track d.id) {
              <ion-item button detail="false" (click)="dogMenu(d)">
                <ion-icon slot="start" name="paw-outline" color="medium" />
                <ion-label>
                  <h2>{{ d.name }}</h2>
                  <p>{{ d.breed || 'Rasse unbekannt' }}</p>
                  <p class="muted">{{ d.owner_name }} · {{ d.owner_email }}</p>
                </ion-label>
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-note>Keine Hunde gefunden.</ion-note></ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
  styles: `
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 12px 16px 0;
      div {
        background: var(--ion-color-light);
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
      }
      strong {
        font-size: 20px;
      }
      span {
        font-size: 12px;
        color: var(--ion-color-medium);
      }
    }
    h2 ion-badge {
      margin-left: 6px;
      vertical-align: middle;
      font-size: 11px;
    }
  `,
})
export class AdminPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly admin = inject(AdminService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  protected readonly tab = signal<Tab>('schools');
  protected readonly query = signal('');
  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly schools = signal<AdminSchool[]>([]);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly dogs = signal<AdminDog[]>([]);

  constructor() {
    addIcons({ arrowBack, logOutOutline, businessOutline, peopleOutline, pawOutline, shieldCheckmarkOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  protected placeholder() {
    return { schools: 'Hundeschule suchen', users: 'Name oder E-Mail suchen', dogs: 'Hund, Rasse oder Besitzer:in' }[
      this.tab()
    ];
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.query.set('');
    this.loadList();
  }

  search(q: string) {
    this.query.set(q);
    this.loadList();
  }

  async load(event?: CustomEvent) {
    try {
      const [stats] = await Promise.all([this.admin.stats(), this.loadList()]);
      this.stats.set(stats);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  private async loadList() {
    const q = this.query();
    try {
      switch (this.tab()) {
        case 'schools':
          this.schools.set(await this.admin.schools(q));
          break;
        case 'users':
          this.users.set(await this.admin.users(q));
          break;
        case 'dogs':
          this.dogs.set(await this.admin.dogs(q));
          break;
      }
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async dogMenu(d: AdminDog) {
    const sheet = await this.actionSheets.create({
      header: `${d.name} (${d.owner_name})`,
      buttons: [
        { text: 'Bearbeiten', data: 'edit' },
        { text: 'Besitzer:in anzeigen', data: 'owner' },
        { text: 'Hund löschen', role: 'destructive', data: 'delete' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'owner') await this.router.navigate(['/admin/nutzer', d.owner_id]);
    if (data === 'edit') await this.editDog(d);
    if (data === 'delete' && (await this.ui.confirm(`${d.name} löschen?`, 'Alle Anmeldungen des Hundes werden ebenfalls gelöscht.', 'Löschen', true))) {
      await this.ui.run(() => this.admin.deleteDog(d.id));
      await this.load();
    }
  }

  private async editDog(d: AdminDog) {
    const alert = await this.alerts.create({
      header: 'Hund bearbeiten',
      inputs: [
        { name: 'name', type: 'text', value: d.name, placeholder: 'Name' },
        { name: 'breed', type: 'text', value: d.breed ?? '', placeholder: 'Rasse' },
        { name: 'birth_date', type: 'date', value: d.birth_date ?? '' },
        { name: 'notes', type: 'textarea', value: d.notes ?? '', placeholder: 'Besonderheiten' },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: 'Speichern', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const v = data?.values ?? {};
    const saved = await this.ui.run(() =>
      this.admin.saveDog(d.id, {
        name: (v.name ?? '').trim(),
        breed: v.breed?.trim() || null,
        birth_date: v.birth_date || null,
        notes: v.notes?.trim() || null,
      }),
    );
    if (saved) await this.loadList();
  }

  async logout() {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
