import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ActionSheetController,
  IonBadge,
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, calendarOutline, checkmarkCircle, helpCircleOutline, timeOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { AppointmentsService, AppointmentWithSummary } from '../../core/data/appointments.service';
import { PollsService } from '../../core/data/polls.service';
import { Poll } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isPast } from '../../shared/dates';

type Tab = 'termine' | 'umfragen';

@Component({
  selector: 'app-appointments',
  imports: [
    DatePipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonListHeader,
    IonItem,
    IonBadge,
    IonIcon,
    IonFab,
    IonFabButton,
    IonButton,
    IonRefresher,
    IonRefresherContent,
    IonSkeletonText,
  ],
  templateUrl: './appointments.page.html',
  styleUrl: './appointments.page.scss',
})
export class AppointmentsPage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly pollsService = inject(PollsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly actionSheets = inject(ActionSheetController);

  protected readonly tab = signal<Tab>('termine');
  protected readonly appointments = signal<AppointmentWithSummary[]>([]);
  protected readonly past = signal<AppointmentWithSummary[] | null>(null);
  protected readonly polls = signal<(Poll & { answered: boolean })[]>([]);
  protected readonly loading = signal(true);

  protected readonly openPolls = computed(() =>
    this.polls().filter((p) => p.status === 'open' && !isPast(p.deadline)),
  );
  protected readonly unansweredCount = computed(
    () => this.openPolls().filter((p) => !p.answered).length,
  );

  /** Termine nach Monat gruppiert. */
  protected readonly groups = computed(() => {
    const groups: { label: string; items: AppointmentWithSummary[] }[] = [];
    for (const a of this.appointments()) {
      const label = new Date(a.starts_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(a);
      else groups.push({ label, items: [a] });
    }
    return groups;
  });

  constructor() {
    addIcons({ add, calendarOutline, checkmarkCircle, timeOutline, helpCircleOutline });
  }

  ionViewWillEnter() {
    this.load();
  }

  async load(event?: CustomEvent) {
    try {
      const [appointments, polls] = await Promise.all([
        this.appointmentsService.list('upcoming'),
        this.pollsService.list(),
      ]);
      this.appointments.set(appointments);
      this.polls.set(polls);
      if (this.past()) this.past.set(await this.appointmentsService.list('past'));
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  async showPast() {
    const past = await this.ui.run(() => this.appointmentsService.list('past'));
    if (past) this.past.set(past);
  }

  async create() {
    const sheet = await this.actionSheets.create({
      header: 'Neu',
      buttons: [
        { text: 'Termin anlegen', data: '/app/termine/neu' },
        { text: 'Terminumfrage starten', data: '/app/umfragen/neu' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data) await this.router.navigateByUrl(data);
  }

  protected spots(a: AppointmentWithSummary): string {
    const taken = a.summary?.registered_dogs ?? 0;
    return a.max_dogs ? `${taken}/${a.max_dogs} Hunde` : `${taken} Hunde`;
  }

  protected isFull(a: AppointmentWithSummary) {
    return !!a.max_dogs && (a.summary?.registered_dogs ?? 0) >= a.max_dogs;
  }

  protected pollClosed(p: Poll) {
    return p.status !== 'open' || isPast(p.deadline);
  }

  protected myStatus(a: AppointmentWithSummary): 'registered' | 'waitlist' | null {
    if (a.mine.some((p) => p.status === 'registered')) return 'registered';
    if (a.mine.some((p) => p.status === 'waitlist')) return 'waitlist';
    return null;
  }
}
