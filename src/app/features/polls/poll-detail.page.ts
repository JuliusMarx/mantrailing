import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmark,
  checkmarkCircle,
  ellipsisVertical,
  locationOutline,
  pawOutline,
  timeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { DogsService } from '../../core/data/dogs.service';
import { PollDetail, PollsService } from '../../core/data/polls.service';
import { Dog, PollDog, PollOption, PollVote, VoteAnswer } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { isPast } from '../../shared/dates';

interface OptionResponses {
  yes: { name: string; dogs: string[] }[];
  maybe: { name: string; dogs: string[] }[];
  no: string[];
}

@Component({
  selector: 'app-poll-detail',
  imports: [
    DatePipe,
    RouterLink,
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
    IonSegment,
    IonSegmentButton,
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
  protected readonly selectedDogs = signal<Set<string>>(new Set());
  protected readonly votes = signal<Record<string, VoteAnswer>>({});
  protected readonly responses = signal<Record<string, OptionResponses>>({});

  protected readonly closed = computed(() => {
    const p = this.detail()?.poll;
    const options = this.detail()?.options ?? [];
    return !p || p.status !== 'open' || options.every((o) => isPast(o.starts_at));
  });

  protected readonly answered = computed(() => (this.detail()?.myDogIds.length ?? 0) > 0);

  protected readonly canSubmit = computed(
    () => !this.closed() && this.selectedDogs().size > 0 && Object.keys(this.votes()).length > 0,
  );

  constructor() {
    addIcons({ timeOutline, locationOutline, pawOutline, checkmark, checkmarkCircle, ellipsisVertical });
  }

  async ionViewWillEnter() {
    await this.load();
  }

  private async load() {
    try {
      const [detail, dogs] = await Promise.all([this.polls.get(this.id()), this.dogsService.mine()]);
      this.detail.set(detail);
      this.myDogs.set(dogs);
      if (!detail) return;
      const preset = detail.myDogIds.length ? detail.myDogIds : dogs.length === 1 ? [dogs[0].id] : [];
      this.selectedDogs.set(new Set(preset));
      this.votes.set({ ...detail.myVotes });
      if (this.auth.isTrainer()) await this.loadResponses(detail.options);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadResponses(options: PollOption[]) {
    if (!options.length) return;
    const { votes, dogs } = await this.polls.responses(this.id());
    const dogsByUser = new Map<string, string[]>();
    for (const d of dogs as PollDog[]) {
      dogsByUser.set(d.user_id, [...(dogsByUser.get(d.user_id) ?? []), d.dogs?.name ?? '?']);
    }
    const result: Record<string, OptionResponses> = {};
    for (const o of options) result[o.id] = { yes: [], maybe: [], no: [] };
    for (const v of votes as PollVote[]) {
      const entry = result[v.poll_option_id];
      if (!entry) continue;
      const name = v.profiles?.full_name || 'Unbekannt';
      if (v.answer === 'no') entry.no.push(name);
      else entry[v.answer].push({ name, dogs: dogsByUser.get(v.user_id) ?? [] });
    }
    this.responses.set(result);
  }

  /** Vorschläge, die schon begonnen haben, kann man nicht mehr wählen. */
  isPast(option: PollOption) {
    return isPast(option.starts_at);
  }

  summary(optionId: string) {
    return this.detail()?.summary.find((s) => s.poll_option_id === optionId);
  }

  toggleDog(id: string) {
    if (this.closed()) return;
    const next = new Set(this.selectedDogs());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedDogs.set(next);
  }

  setVote(optionId: string, answer: VoteAnswer) {
    this.votes.update((v) => ({ ...v, [optionId]: answer }));
  }

  async submit() {
    const options = this.detail()!.options;
    // Nicht beantwortete Optionen gelten als "Nein"; vergangene werden nicht mehr geschickt
    const votes: Record<string, VoteAnswer> = {};
    for (const o of options) if (!isPast(o.starts_at)) votes[o.id] = this.votes()[o.id] ?? 'no';
    this.saving.set(true);
    const ok = await this.ui.run(async () => {
      await this.polls.submit(this.id(), [...this.selectedDogs()], votes);
      return true;
    }, 'Speichern …');
    this.saving.set(false);
    if (!ok) return;
    await this.ui.toast('Danke! Deine Antwort ist gespeichert.', 'success');
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
      'Termin festlegen?',
      `${date} Uhr wird als Termin angelegt. ${s?.yes_dogs ?? 0} Hunde mit „Ja“ werden angemeldet, „Vielleicht“ kommt auf die Warteliste.`,
      'Festlegen',
    );
    if (!ok) return;
    const appointmentId = await this.ui.run(() => this.polls.finalize(this.id(), option.id), 'Termin wird angelegt …');
    if (appointmentId) {
      await this.ui.toast('Termin angelegt', 'success');
      await this.router.navigate(['/app/termine', appointmentId], { replaceUrl: true });
    }
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
    if (data === 'delete' && (await this.ui.confirm('Umfrage löschen?', 'Alle Antworten gehen verloren.', 'Löschen', true))) {
      const done = await this.ui.run(async () => {
        await this.polls.remove(poll.id);
        return true;
      });
      if (done) this.nav.navigateBack('/app/termine');
    }
  }
}
