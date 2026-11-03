import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ActionSheetController,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add,
  createOutline,
  ellipsisVertical,
  locationOutline,
  mapOutline,
  navigateOutline,
  pawOutline,
  timeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { AppointmentsService, AppointmentWithSummary } from '../../core/data/appointments.service';
import { DogsService } from '../../core/data/dogs.service';
import { TrailsService } from '../../core/data/trails.service';
import { formatDistance, navigationUrl } from '../../core/geo';
import { Dog, Participant, Trail } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isPast } from '../../shared/dates';
import { MapComponent, MapMarker } from '../../shared/map/map.component';

@Component({
  selector: 'app-appointment-detail',
  imports: [
    DatePipe,
    RouterLink,
    MapComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
    IonModal,
    IonCheckbox,
    IonSpinner,
  ],
  templateUrl: './appointment-detail.page.html',
  styleUrl: './appointment-detail.page.scss',
})
export class AppointmentDetailPage implements ViewWillEnter {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly service = inject(AppointmentsService);
  private readonly dogsService = inject(DogsService);
  private readonly trailsService = inject(TrailsService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly actionSheets = inject(ActionSheetController);

  protected readonly appointment = signal<AppointmentWithSummary | null>(null);
  protected readonly participants = signal<Participant[]>([]);
  protected readonly trails = signal<Trail[]>([]);
  protected readonly myDogs = signal<Dog[]>([]);
  protected readonly loading = signal(true);
  protected readonly registerOpen = signal(false);
  protected readonly selectedDogs = signal<Set<string>>(new Set());
  protected readonly distance = formatDistance;

  protected readonly markers = computed<MapMarker[]>(() => {
    const p = this.appointment()?.meeting_point;
    return p ? [{ id: 'meeting', lngLat: p.coordinates, type: 'meeting' }] : [];
  });

  protected readonly registered = computed(() => this.participants().filter((p) => p.status === 'registered'));
  protected readonly waitlist = computed(() => this.participants().filter((p) => p.status === 'waitlist'));

  /** Hunde, die noch nicht angemeldet sind. */
  protected readonly availableDogs = computed(() => {
    const taken = new Set(this.appointment()?.mine.map((p) => p.dog_id));
    return this.myDogs().filter((d) => !taken.has(d.id));
  });

  protected readonly freeSpots = computed(() => {
    const a = this.appointment();
    if (!a?.max_dogs) return null;
    return Math.max(0, a.max_dogs - (a.summary?.registered_dogs ?? 0));
  });

  protected readonly registrationOpen = computed(() => {
    const a = this.appointment();
    return !!a && a.status === 'planned' && !isPast(a.starts_at);
  });

  constructor() {
    addIcons({ createOutline, locationOutline, navigateOutline, timeOutline, pawOutline, add, ellipsisVertical, mapOutline });
  }

  async ionViewWillEnter() {
    await this.load();
  }

  private async load() {
    try {
      const [appointment, dogs] = await Promise.all([this.service.get(this.id()), this.dogsService.mine()]);
      this.appointment.set(appointment);
      this.myDogs.set(dogs);
      if (appointment && this.auth.isTrainer()) {
        const [participants, trails] = await Promise.all([
          this.service.participants(appointment.id),
          this.trailsService.list(appointment.id),
        ]);
        this.participants.set(participants);
        this.trails.set(trails);
      }
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  navUrl() {
    const p = this.appointment()?.meeting_point;
    return p ? navigationUrl(p.coordinates) : null;
  }

  // --- Anmeldung (Kunde) -------------------------------------------------------

  openRegister() {
    const available = this.availableDogs();
    if (!this.myDogs().length) {
      this.ui.toast('Lege zuerst einen Hund an.', 'warning');
      this.router.navigateByUrl('/app/hunde/neu');
      return;
    }
    // Ein Hund: direkt vorauswählen
    this.selectedDogs.set(new Set(available.length === 1 ? [available[0].id] : []));
    this.registerOpen.set(true);
  }

  toggleDog(id: string, checked: boolean) {
    const next = new Set(this.selectedDogs());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedDogs.set(next);
  }

  async register() {
    const dogIds = [...this.selectedDogs()];
    const result = await this.ui.run(() => this.service.register(this.id(), dogIds), 'Anmelden …');
    if (!result) return;
    this.registerOpen.set(false);
    const waiting = result.filter((r) => r.status === 'waitlist').length;
    await this.ui.toast(
      waiting ? `${waiting} von ${result.length} Hunden auf der Warteliste` : 'Angemeldet!',
      waiting ? 'warning' : 'success',
    );
    await this.load();
  }

  async cancel(p: Participant) {
    const ok = await this.ui.confirm('Abmelden?', `${p.dogs?.name ?? 'Hund'} von diesem Termin abmelden?`, 'Abmelden', true);
    if (!ok) return;
    await this.ui.run(() => this.service.cancelRegistration(this.id(), [p.dog_id]));
    await this.load();
  }

  // --- Trainer -------------------------------------------------------------------

  async participantMenu(p: Participant) {
    const buttons = [];
    if (p.status === 'waitlist') buttons.push({ text: 'Fest anmelden (über Kapazität)', data: 'registered' });
    if (p.status === 'registered') buttons.push({ text: 'Auf Warteliste setzen', data: 'waitlist' });
    buttons.push({ text: 'Abmelden', role: 'destructive', data: 'cancelled' });
    buttons.push({ text: 'Abbrechen', role: 'cancel' });
    const sheet = await this.actionSheets.create({
      header: `${p.dogs?.name} · ${p.profiles?.full_name}`,
      buttons,
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;
    await this.ui.run(() => this.service.setParticipantStatus(p.id, data));
    await this.load();
  }

  async trainerMenu() {
    const a = this.appointment()!;
    const sheet = await this.actionSheets.create({
      header: a.title,
      buttons: [
        { text: 'Bearbeiten', data: 'edit' },
        { text: 'Trail für diesen Termin zeichnen', data: 'trail' },
        a.status === 'planned'
          ? { text: 'Termin absagen', role: 'destructive', data: 'cancel' }
          : { text: 'Termin wieder aktivieren', data: 'reactivate' },
        { text: 'Termin löschen', role: 'destructive', data: 'delete' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data) {
      case 'edit':
        await this.router.navigate(['/app/termine', a.id, 'bearbeiten']);
        break;
      case 'trail':
        await this.router.navigate(['/editor/neu'], { queryParams: { termin: a.id } });
        break;
      case 'cancel':
        if (await this.ui.confirm('Termin absagen?', 'Alle Teilnehmer:innen sehen den Termin als abgesagt.', 'Absagen', true)) {
          await this.ui.run(() => this.service.setStatus(a.id, 'cancelled'));
          await this.load();
        }
        break;
      case 'reactivate':
        await this.ui.run(() => this.service.setStatus(a.id, 'planned'));
        await this.load();
        break;
      case 'delete':
        if (await this.ui.confirm('Termin löschen?', 'Alle Anmeldungen werden gelöscht.', 'Löschen', true)) {
          const done = await this.ui.run(async () => {
            await this.service.remove(a.id);
            return true;
          });
          if (done) this.nav.navigateBack('/app/termine');
        }
        break;
    }
  }
}
