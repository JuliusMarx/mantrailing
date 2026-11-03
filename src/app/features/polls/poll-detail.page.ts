import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, checkmark, checkmarkCircle, ellipsisVertical, pawOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { DogsService } from '../../core/data/dogs.service';
import { PollDetail, PollsService } from '../../core/data/polls.service';
import { Dog, PollChoice, PollOption } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isPast } from '../../shared/dates';

interface OptionResponses {
  people: { name: string; dogs: string[] }[];
}

@Component({
  selector: 'app-poll-detail',
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonChip,
    IonLabel,
    IonSpinner,
  ],
  templateUrl: './poll-detail.page.html',
  styleUrl: './poll-detail.page.scss',
})
export class PollDetailPage implements ViewWillEnter {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly polls = inject(PollsService);
  private readonly dogsService = inject(DogsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly actionSheets = inject(ActionSheetController);

  protected readonly detail = signal<PollDetail | null>(null);
  protected readonly myDogs = signal<Dog[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  /** Meine Auswahl: option_id → Hunde. */
  protected readonly choices = signal<Record<string, string[]>>({});
  protected readonly responses = signal<Record<string, OptionResponses>>({});
  private readonly savedChoices = signal('{}');

  /** Vorschläge, für die man noch abstimmen kann. */
  protected readonly openOptions = computed(() =>
    (this.detail()?.options ?? []).filter((o) => this.editable(o)),
  );

  protected readonly closed = computed(() => {
    const p = this.detail()?.poll;
    return !p || p.status !== 'open' || !this.openOptions().length;
  });

  protected readonly dirty = computed(
    () => JSON.stringify(this.normalized()) !== this.savedChoices(),
  );

  constructor() {
    addIcons({ pawOutline, checkmark, checkmarkCircle, ellipsisVertical, calendarOutline });
  }

  async ionViewWillEnter() {
    await this.load();
  }

  private async load() {
    try {
      const [detail, dogs] = await Promise.all([
        this.polls.get(this.id()),
        this.dogsService.mine(),
      ]);
      this.detail.set(detail);
      this.myDogs.set(dogs);
      if (!detail) return;
      this.choices.set({ ...detail.myChoices });
      this.savedChoices.set(JSON.stringify(this.normalized()));
      if (this.auth.isTrainer()) this.groupResponses(await this.polls.responses(this.id()));
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private groupResponses(rows: PollChoice[]) {
    const result: Record<string, OptionResponses> = {};
    for (const row of rows) {
      const entry = (result[row.poll_option_id] ??= { people: [] });
      const name = row.profiles?.full_name || 'Unbekannt';
      let person = entry.people.find((p) => p.name === name);
      if (!person) entry.people.push((person = { name, dogs: [] }));
      person.dogs.push(row.dogs?.name ?? '?');
    }
    this.responses.set(result);
  }

  /** Auswahl nur für offene Vorschläge, sortiert (für den Vergleich "geändert?"). */
  private normalized() {
    const out: Record<string, string[]> = {};
    for (const o of this.openOptions()) out[o.id] = [...(this.choices()[o.id] ?? [])].sort();
    return out;
  }

  editable(option: PollOption) {
    return (
      !isPast(option.starts_at) && !option.appointment_id && this.detail()?.poll.status === 'open'
    );
  }

  isPast(option: PollOption) {
    return isPast(option.starts_at);
  }

  summary(optionId: string) {
    return this.detail()?.summary.find((s) => s.poll_option_id === optionId);
  }

  isChosen(optionId: string, dogId: string) {
    return (this.choices()[optionId] ?? []).includes(dogId);
  }

  toggleDog(option: PollOption, dogId: string) {
    if (!this.editable(option)) return;
    const current = this.choices()[option.id] ?? [];
    const next = current.includes(dogId) ? current.filter((d) => d !== dogId) : [...current, dogId];
    this.choices.update((c) => ({ ...c, [option.id]: next }));
  }

  async submit() {
    this.saving.set(true);
    const ok = await this.ui.run(async () => {
      await this.polls.submit(this.id(), this.normalized());
      return true;
    }, 'Speichern …');
    this.saving.set(false);
    if (!ok) return;
    await this.ui.toast('Danke! Deine Auswahl ist gespeichert.', 'success');
    await this.load();
  }

  async finalize(option: PollOption) {
    const s = this.summary(option.id);
    const date = new Date(option.starts_at).toLocaleString('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const ok = await this.ui.confirm(
      'Als Termin festlegen?',
      `${date} Uhr wird als Termin angelegt. Die ${s?.dogs ?? 0} dafür gewählten Hunde werden angemeldet` +
        (option.max_dogs ? `, über ${option.max_dogs} Hunde hinaus auf die Warteliste.` : '.') +
        ' Die anderen Vorschläge bleiben offen.',
      'Festlegen',
    );
    if (!ok) return;
    const appointmentId = await this.ui.run(
      () => this.polls.finalize(this.id(), option.id),
      'Termin wird angelegt …',
    );
    if (!appointmentId) return;
    await this.ui.toast('Termin angelegt', 'success');
    await this.load();
  }

  openAppointment(option: PollOption) {
    this.router.navigate(['/app/termine', option.appointment_id]);
  }

  async menu() {
    const poll = this.detail()!.poll;
    const buttons = [];
    if (poll.status === 'open') buttons.push({ text: 'Umfrage schließen', data: 'close' });
    if (poll.status === 'closed') buttons.push({ text: 'Umfrage wieder öffnen', data: 'open' });
    buttons.push({ text: 'Umfrage löschen', role: 'destructive', data: 'delete' });
    buttons.push({ text: 'Abbrechen', role: 'cancel' });
    const sheet = await this.actionSheets.create({ header: poll.title, buttons });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'close' || data === 'open') {
      await this.ui.run(() => this.polls.setStatus(poll.id, data === 'close' ? 'closed' : 'open'));
      await this.load();
    }
    if (
      data === 'delete' &&
      (await this.ui.confirm(
        'Umfrage löschen?',
        'Alle Antworten gehen verloren. Bereits festgelegte Termine bleiben bestehen.',
        'Löschen',
        true,
      ))
    ) {
      const done = await this.ui.run(async () => {
        await this.polls.remove(poll.id);
        return true;
      });
      if (done) this.nav.navigateBack('/app/termine');
    }
  }
}
