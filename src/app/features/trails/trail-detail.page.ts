import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
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
  IonTextarea,
  IonTitle,
  IonToolbar,
  NavController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeCircleOutline,
  contractOutline,
  createOutline,
  expandOutline,
  linkOutline,
  personAddOutline,
  shareSocialOutline,
  trashOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { Member, SchoolService, shareLink } from '../../core/data/school.service';
import { shareUrl, TrailsService } from '../../core/data/trails.service';
import { Dog, Trail, TrailAssignment } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { TrailFactsComponent } from '../../shared/trail-view/trail-facts.component';
import { TrailViewComponent } from '../../shared/trail-view/trail-view.component';

@Component({
  selector: 'app-trail-detail',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TrailViewComponent,
    TrailFactsComponent,
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
    IonNote,
    IonModal,
    IonCheckbox,
    IonTextarea,
    IonSpinner,
  ],
  templateUrl: './trail-detail.page.html',
  styleUrl: './trail-detail.page.scss',
})
export class TrailDetailPage implements ViewWillEnter {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly trails = inject(TrailsService);
  private readonly school = inject(SchoolService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);

  protected readonly trail = signal<Trail | null>(null);
  protected readonly assignments = signal<TrailAssignment[]>([]);
  protected readonly myAssignment = signal<TrailAssignment | null>(null);
  protected readonly loading = signal(true);
  protected readonly fullscreen = signal(false);

  // Zuweisen-Dialog
  protected readonly assignOpen = signal(false);
  protected readonly customers = signal<Member[]>([]);
  protected readonly selected = signal<Set<string>>(new Set());
  protected message = '';

  protected readonly dogName = (d: Dog) => d.name;
  protected readonly assignedIds = computed(() => new Set(this.assignments().map((a) => a.customer_id)));

  constructor() {
    addIcons({
      createOutline,
      shareSocialOutline,
      linkOutline,
      personAddOutline,
      trashOutline,
      closeCircleOutline,
      expandOutline,
      contractOutline,
    });
  }

  async ionViewWillEnter() {
    try {
      const trail = await this.trails.get(this.id());
      this.trail.set(trail);
      if (!trail) return;
      if (this.auth.isTrainer()) {
        this.assignments.set(await this.trails.assignments(trail.id));
      } else {
        const mine = (await this.trails.mine()).find((a) => a.trail_id === trail.id) ?? null;
        this.myAssignment.set(mine);
        if (mine && !mine.seen_at) await this.trails.markSeen(trail.id);
      }
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Teilen ------------------------------------------------------------------

  async share() {
    const trail = this.trail()!;
    const token = trail.share_token ?? (await this.ui.run(() => this.trails.enableShare(trail.id)));
    if (!token) return;
    this.trail.set({ ...trail, share_token: token });
    const result = await shareLink(
      trail.name,
      `Trail „${trail.name}“ zum Legen`,
      shareUrl(token),
    );
    if (result === 'copied') await this.ui.toast('Link kopiert', 'success');
  }

  async stopSharing() {
    const trail = this.trail()!;
    const ok = await this.ui.confirm(
      'Freigabe beenden?',
      'Der geteilte Link funktioniert danach nicht mehr.',
      'Beenden',
      true,
    );
    if (!ok) return;
    await this.ui.run(() => this.trails.disableShare(trail.id));
    this.trail.set({ ...trail, share_token: null });
  }

  // --- Zuweisen ----------------------------------------------------------------

  async openAssign() {
    this.selected.set(new Set());
    this.message = '';
    this.assignOpen.set(true);
    try {
      this.customers.set(await this.school.members());
    } catch (err) {
      await this.ui.error(err);
    }
  }

  toggle(userId: string, checked: boolean) {
    const next = new Set(this.selected());
    if (checked) next.add(userId);
    else next.delete(userId);
    this.selected.set(next);
  }

  async assign() {
    const trail = this.trail()!;
    const ids = [...this.selected()];
    const ok = await this.ui.run(async () => {
      await this.trails.assign(trail.id, ids, this.message.trim() || null);
      return true;
    });
    if (!ok) return;
    this.assignOpen.set(false);
    this.assignments.set(await this.trails.assignments(trail.id));
    await this.ui.toast(ids.length === 1 ? 'Trail verschickt' : `Trail an ${ids.length} Personen verschickt`, 'success');
  }

  async unassign(a: TrailAssignment) {
    const ok = await this.ui.confirm('Zuweisung entfernen?', `${a.profiles?.full_name} sieht den Trail dann nicht mehr.`, 'Entfernen', true);
    if (!ok) return;
    await this.ui.run(() => this.trails.unassign(a.id));
    this.assignments.update((list) => list.filter((x) => x.id !== a.id));
  }

  async remove() {
    const ok = await this.ui.confirm('Trail löschen?', 'Der Trail und alle Zuweisungen werden gelöscht.', 'Löschen', true);
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.trails.remove(this.id());
      return true;
    });
    if (done) this.nav.navigateBack('/app/trails');
  }
}
