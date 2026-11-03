import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController,
  AlertController,
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
  IonModal,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { callOutline, mailOutline, pawOutline, personAddOutline, peopleOutline, shareSocialOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { inviteUrl, Member, SchoolService, shareLink } from '../../core/data/school.service';
import { Invitation, Role } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { dogAge } from '../dogs/dogs.page';

@Component({
  selector: 'app-customers',
  imports: [
    DatePipe,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonIcon,
    IonBadge,
    IonNote,
    IonSearchbar,
    IonModal,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonRefresher,
    IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Kund:innen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openInvite()" aria-label="Einladen">
            <ion-icon slot="icon-only" name="person-add-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
          <ion-segment-button value="members"><ion-label>Mitglieder ({{ members().length }})</ion-label></ion-segment-button>
          <ion-segment-button value="invites"><ion-label>Einladungen ({{ invitations().length }})</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      @if (tab() === 'members') {
        <ion-searchbar placeholder="Name oder Hund suchen" [debounce]="150" (ionInput)="query.set($any($event.target).value ?? '')" />
        @if (loaded() && members().length <= 1) {
          <div class="empty-state">
            <ion-icon name="people-outline" />
            <p>Lade deine Kund:innen per Link ein – oben rechts auf das Personen-Symbol tippen.</p>
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
      } @else {
        <ion-list>
          @for (inv of invitations(); track inv.id) {
            <ion-item button detail="false" (click)="invitationMenu(inv)">
              <ion-icon slot="start" name="mail-outline" />
              <ion-label>
                <h3>{{ inv.email }}</h3>
                <p>{{ inv.role === 'trainer' ? 'Trainer:in' : 'Kund:in' }} · gültig bis {{ inv.expires_at | date: 'd. MMM' }}</p>
              </ion-label>
              @if (isExpired(inv)) { <ion-badge slot="end" color="medium">abgelaufen</ion-badge> }
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>Keine offenen Einladungen.</ion-note></ion-item>
          }
        </ion-list>
      }

      <ion-modal [isOpen]="inviteOpen()" [initialBreakpoint]="0.6" [breakpoints]="[0, 0.6, 0.9]" (didDismiss)="inviteOpen.set(false)">
        <ng-template>
          <ion-content class="ion-padding">
            <h2>Einladen</h2>
            <p class="muted">Du bekommst einen Link, den du per WhatsApp, Mail oder SMS verschicken kannst. Er gilt 14 Tage.</p>
            <ion-list lines="none" class="form">
              <ion-input fill="outline" label="E-Mail-Adresse" labelPlacement="floating" type="email" inputmode="email" [(ngModel)]="inviteEmail" />
              <ion-select fill="outline" label="Rolle" labelPlacement="floating" interface="popover" [(ngModel)]="inviteRole">
                <ion-select-option value="customer">Kund:in</ion-select-option>
                <ion-select-option value="trainer">Trainer:in</ion-select-option>
              </ion-select>
            </ion-list>
            <ion-button expand="block" (click)="invite()" [disabled]="!inviteEmail.includes('@')">
              <ion-icon slot="start" name="share-social-outline" />Einladung erstellen &amp; teilen
            </ion-button>
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
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: transparent;
      margin-bottom: 12px;
    }
  `,
})
export class CustomersPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly school = inject(SchoolService);
  private readonly ui = inject(UiService);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);

  protected readonly tab = signal<'members' | 'invites'>('members');
  protected readonly members = signal<Member[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly loaded = signal(false);
  protected readonly query = signal('');
  protected readonly inviteOpen = signal(false);
  protected inviteEmail = '';
  protected inviteRole: Role = 'customer';
  protected readonly age = dogAge;

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
    addIcons({ personAddOutline, pawOutline, mailOutline, peopleOutline, shareSocialOutline, callOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  async load(event?: CustomEvent) {
    try {
      const [members, invitations] = await Promise.all([this.school.members(), this.school.invitations()]);
      this.members.set(members);
      this.invitations.set(invitations);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loaded.set(true);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  protected isExpired(inv: Invitation) {
    return new Date(inv.expires_at).getTime() < Date.now();
  }

  openInvite() {
    this.inviteEmail = '';
    this.inviteRole = 'customer';
    this.inviteOpen.set(true);
  }

  async invite() {
    const inv = await this.ui.run(() => this.school.invite(this.inviteEmail, this.inviteRole));
    if (!inv) return;
    this.inviteOpen.set(false);
    this.invitations.update((list) => [inv, ...list]);
    this.tab.set('invites');
    await this.shareInvitation(inv);
  }

  private async shareInvitation(inv: Invitation) {
    const result = await shareLink(
      `Einladung zu ${this.auth.schoolName()}`,
      `Hallo! Hier ist deine Einladung zu ${this.auth.schoolName()}:`,
      inviteUrl(inv.token),
    );
    if (result === 'copied') await this.ui.toast('Einladungslink kopiert', 'success');
  }

  async invitationMenu(inv: Invitation) {
    const sheet = await this.actionSheets.create({
      header: inv.email,
      buttons: [
        { text: 'Link erneut teilen', data: 'share' },
        { text: 'Einladung zurückziehen', role: 'destructive', data: 'revoke' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'share') await this.shareInvitation(inv);
    if (data === 'revoke') {
      await this.ui.run(() => this.school.revokeInvitation(inv.id));
      this.invitations.update((list) => list.filter((i) => i.id !== inv.id));
    }
  }

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
    if (data === 'reset' && (await this.ui.confirm(`Passwort von ${name} zurücksetzen?`, 'Du bekommst ein neues Passwort, das du der Person weitergibst. Das alte gilt dann nicht mehr.', 'Zurücksetzen'))) {
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
    if (data === 'remove' && (await this.ui.confirm(`${name} entfernen?`, 'Die Person verliert den Zugriff auf Termine und Trails deiner Schule.', 'Entfernen', true))) {
      await this.ui.run(() => this.school.removeMember(m.user_id));
      await this.load();
    }
  }
}
