import { Component, computed, inject, signal } from '@angular/core';
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
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  callOutline,
  copyOutline,
  pawOutline,
  peopleOutline,
  personAddOutline,
  refreshOutline,
  shareSocialOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { joinUrl, Member, SchoolService, shareLink } from '../../core/data/school.service';
import { UiService } from '../../core/ui.service';
import { dogAge } from '../dogs/dogs.page';

@Component({
  selector: 'app-customers',
  imports: [
    IonMenuButton,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonLabel,
    IonList,
    IonItem,
    IonIcon,
    IonBadge,
    IonSearchbar,
    IonModal,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>Kund:innen ({{ members().length }})</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openJoinLink()" aria-label="Beitrittslink">
            <ion-icon slot="icon-only" name="person-add-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      <ion-searchbar placeholder="Name oder Hund suchen" [debounce]="150" (ionInput)="query.set($any($event.target).value ?? '')" />
      @if (loaded() && members().length <= 1) {
        <div class="empty-state">
          <ion-icon name="people-outline" />
          <p>Teile den Beitrittslink deiner Hundeschule, damit deine Kund:innen beitreten können.</p>
          <ion-button (click)="openJoinLink()">Beitrittslink teilen</ion-button>
        </div>
      }
      <ion-list>
        @for (m of filtered(); track m.user_id) {
          <ion-item button detail="false" (click)="memberMenu(m)">
            <ion-label>
              <h2>
                {{ m.profiles?.full_name || 'Ohne Namen' }}
                @if (m.role === 'trainer') { <ion-badge color="primary">Trainer:in</ion-badge> }
                @if (m.user_id === auth.userId()) { <ion-badge color="medium">Du</ion-badge> }
              </h2>
              @for (d of m.dogs; track d.id) {
                <p><ion-icon name="paw-outline" /> {{ d.name }}{{ d.breed ? ' · ' + d.breed : '' }}{{ d.birth_date ? ' · ' + age(d.birth_date) : '' }}</p>
                @if (d.notes) { <p class="muted notes">{{ d.notes }}</p> }
              } @empty {
                <p class="muted">Noch keine Hunde</p>
              }
            </ion-label>
          </ion-item>
        }
      </ion-list>

      <ion-modal [isOpen]="joinOpen()" [initialBreakpoint]="0.75" [breakpoints]="[0, 0.75, 1]" (didDismiss)="joinOpen.set(false)">
        <ng-template>
          <ion-content class="ion-padding">
            <h2>Beitrittslink</h2>
            <p class="muted">
              Wer diesen Link öffnet und sich anmeldet, wird Kund:in von {{ auth.schoolName() }}.
              Teile ihn z. B. in eurer WhatsApp-Gruppe oder auf deiner Website.
            </p>
            @if (joinLoading()) {
              <div class="ion-text-center"><ion-spinner /></div>
            } @else if (joinToken(); as token) {
              <div class="link">{{ url(token) }}</div>
              <ion-button expand="block" (click)="share(token)">
                <ion-icon slot="start" name="share-social-outline" />Link teilen
              </ion-button>
              <ion-button expand="block" fill="outline" (click)="copy(token)">
                <ion-icon slot="start" name="copy-outline" />Kopieren
              </ion-button>
              <ion-button expand="block" fill="clear" (click)="renew()">
                <ion-icon slot="start" name="refresh-outline" />Neuen Link erzeugen
              </ion-button>
              <ion-button expand="block" fill="clear" color="danger" (click)="disable()">Link abschalten</ion-button>
              <p class="muted small">
                Ein neuer Link macht den alten ungültig. Wer schon beigetreten ist, bleibt Mitglied.
              </p>
            } @else {
              <p>Der Beitrittslink ist abgeschaltet. Gerade kann niemand neu beitreten.</p>
              <ion-button expand="block" (click)="renew()">Link einschalten</ion-button>
            }
          </ion-content>
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: `
    h2 ion-badge {
      margin-left: 6px;
      vertical-align: middle;
      font-size: 11px;
    }
    .notes {
      white-space: normal;
      font-size: 13px;
    }
    .link {
      background: var(--ion-color-light);
      border-radius: 8px;
      padding: 10px 12px;
      margin: 12px 0;
      font-family: monospace;
      font-size: 13px;
      word-break: break-all;
    }
    .small {
      font-size: 13px;
    }
  `,
})
export class CustomersPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly school = inject(SchoolService);
  private readonly ui = inject(UiService);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  protected readonly members = signal<Member[]>([]);
  protected readonly loaded = signal(false);
  protected readonly query = signal('');
  protected readonly joinOpen = signal(false);
  protected readonly joinLoading = signal(false);
  protected readonly joinToken = signal<string | null>(null);
  protected readonly age = dogAge;
  protected readonly url = joinUrl;

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.members();
    return this.members().filter(
      (m) =>
        (m.profiles?.full_name ?? '').toLowerCase().includes(q) ||
        m.dogs.some((d) => d.name.toLowerCase().includes(q)),
    );
  });

  constructor() {
    addIcons({
      personAddOutline,
      pawOutline,
      peopleOutline,
      shareSocialOutline,
      callOutline,
      copyOutline,
      refreshOutline,
    });
  }

  ionViewWillEnter() {
    this.load();
  }

  async load(event?: CustomEvent) {
    try {
      this.members.set(await this.school.members());
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loaded.set(true);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  // --- Beitrittslink ---------------------------------------------------------

  async openJoinLink() {
    this.joinOpen.set(true);
    this.joinLoading.set(true);
    try {
      this.joinToken.set(await this.school.joinToken());
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.joinLoading.set(false);
    }
  }

  async share(token: string) {
    const name = this.auth.schoolName();
    const result = await shareLink(name, `Tritt ${name} in der Mantrailing-App bei:`, joinUrl(token));
    if (result === 'copied') await this.ui.toast('Link kopiert', 'success');
  }

  async copy(token: string) {
    await navigator.clipboard.writeText(joinUrl(token));
    await this.ui.toast('Link kopiert', 'success');
  }

  async renew() {
    if (this.joinToken()) {
      const ok = await this.ui.confirm(
        'Neuen Link erzeugen?',
        'Der bisherige Link funktioniert danach nicht mehr.',
        'Erzeugen',
      );
      if (!ok) return;
    }
    const token = await this.ui.run(() => this.school.resetJoinToken(true));
    if (token) this.joinToken.set(token);
  }

  async disable() {
    const ok = await this.ui.confirm(
      'Link abschalten?',
      'Danach kann niemand mehr über den Link beitreten.',
      'Abschalten',
      true,
    );
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.school.resetJoinToken(false);
      return true;
    });
    if (done) this.joinToken.set(null);
  }

  // --- Mitglieder --------------------------------------------------------------

  async memberMenu(m: Member) {
    if (m.user_id === this.auth.userId()) return;
    const name = m.profiles?.full_name || 'Mitglied';
    const buttons: { text: string; role?: string; data?: string }[] = [];
    if (m.profiles?.phone) buttons.push({ text: `Anrufen (${m.profiles.phone})`, data: 'call' });
    buttons.push(
      m.role === 'customer'
        ? { text: 'Zur Trainer:in machen', data: 'trainer' }
        : { text: 'Zur Kund:in machen', data: 'customer' },
    );
    buttons.push({ text: 'Passwort zurücksetzen', data: 'reset' });
    buttons.push({ text: 'Aus der Schule entfernen', role: 'destructive', data: 'remove' });
    buttons.push({ text: 'Abbrechen', role: 'cancel' });
    const sheet = await this.actionSheets.create({ header: name, buttons });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'call') location.href = `tel:${m.profiles!.phone}`;
    if (data === 'trainer' || data === 'customer') {
      await this.ui.run(() => this.school.setRole(m.user_id, data));
      await this.load();
    }
    if (
      data === 'reset' &&
      (await this.ui.confirm(
        `Passwort von ${name} zurücksetzen?`,
        'Du bekommst ein neues Passwort, das du der Person weitergibst. Das alte gilt dann nicht mehr.',
        'Zurücksetzen',
      ))
    ) {
      const password = await this.ui.run(() => this.school.resetPassword(m.user_id));
      if (password) {
        const alert = await this.alerts.create({
          header: 'Neues Passwort',
          message: `Gib ${name} dieses Passwort weiter: ${password} – sie oder er kann es danach unter „Konto“ ändern.`,
          buttons: [
            { text: 'Kopieren', handler: () => void navigator.clipboard.writeText(password) },
            { text: 'OK', role: 'cancel' },
          ],
        });
        await alert.present();
      }
    }
    if (
      data === 'remove' &&
      (await this.ui.confirm(
        `${name} entfernen?`,
        'Die Person verliert den Zugriff auf Termine und Trails deiner Schule.',
        'Entfernen',
        true,
      ))
    ) {
      await this.ui.run(() => this.school.removeMember(m.user_id));
      await this.load();
    }
  }
}
