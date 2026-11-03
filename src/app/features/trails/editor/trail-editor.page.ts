import { Component, computed, effect, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRange,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  arrowRedoOutline,
  arrowUndoOutline,
  checkmark,
  close,
  ellipsisHorizontal,
  locateOutline,
  radioButtonOn,
  search,
  stopCircleOutline,
  swapVerticalOutline,
  trashOutline,
} from 'ionicons/icons';
import { AppointmentsService, AppointmentWithSummary } from '../../../core/data/appointments.service';
import { TrailsService } from '../../../core/data/trails.service';
import { formatDistance, formatDuration, walkingMinutes } from '../../../core/geo';
import { LngLat, SegmentMode, Trail, WaypointType } from '../../../core/models';
import { geocode, GeocodeResult, RoutingService } from '../../../core/routing.service';
import { UiService } from '../../../core/ui.service';
import { MapComponent, MapLine, MapMarker } from '../../../shared/map/map.component';
import { WAYPOINT_TYPES, waypointInfo } from '../../../shared/map/waypoint-types';
import { TrailEditorStore } from './trail-editor.store';
import { TrailRecorder } from './trail-recorder';

const LAST_CENTER_KEY = 'mantrailing.lastCenter';
export const SURFACES = ['Asphalt', 'Pflaster', 'Wiese', 'Waldweg', 'Feldweg', 'Schotter', 'Gemischt'];

@Component({
  selector: 'app-trail-editor',
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    MapComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonChip,
    IonInput,
    IonTextarea,
    IonModal,
    IonList,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonRange,
    IonSearchbar,
    IonSpinner,
  ],
  templateUrl: './trail-editor.page.html',
  styleUrl: './trail-editor.page.scss',
})
export class TrailEditorPage implements OnInit {
  /** Route-Parameter (bei /editor/:id). */
  readonly id = input<string>();

  private readonly trails = inject(TrailsService);
  private readonly appointments = inject(AppointmentsService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly actionSheets = inject(ActionSheetController);

  protected readonly store = new TrailEditorStore(inject(RoutingService).route);
  protected readonly recorder = new TrailRecorder();
  protected readonly waypointTypes = WAYPOINT_TYPES.filter((t) => t.type !== 'via');
  protected readonly allTypes = WAYPOINT_TYPES;
  protected readonly surfaces = SURFACES;
  protected readonly info = waypointInfo;

  private readonly map = viewChild.required(MapComponent);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly trail = signal<Trail | null>(null);
  protected readonly saveSheetOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly searchResults = signal<GeocodeResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly upcoming = signal<AppointmentWithSummary[]>([]);
  protected readonly initialCenter = signal<LngLat | null>(this.lastCenter());
  protected readonly fitCoords = signal<LngLat[] | null>(null);
  private savedSnapshot: unknown = null;

  // Formularfelder
  protected name = '';
  protected description = '';
  protected difficulty = 2;
  protected surface: string | null = null;
  protected appointmentId: string | null = null;

  protected readonly lengthText = computed(() => formatDistance(this.store.length()));
  protected readonly durationText = computed(() => formatDuration(walkingMinutes(this.store.length())));
  protected readonly selectedIndex = computed(() =>
    this.store.points().findIndex((p) => p.id === this.store.selectedId()),
  );
  /** Modus des Abschnitts, der am ausgewählten Punkt endet. */
  protected readonly selectedSegmentMode = computed<SegmentMode | null>(() => {
    const i = this.selectedIndex();
    return i > 0 ? (this.store.segments()[i - 1]?.mode ?? null) : null;
  });

  protected readonly mapLines = computed<MapLine[]>(() => {
    const lines: MapLine[] = [];
    if (this.recorder.active()) {
      lines.push({ id: 'rec', coords: this.recorder.coords(), color: '#6a1b9a', width: 5 });
      return lines;
    }
    const segments = this.store.segments();
    this.store.segmentCoords().forEach((coords, i) => {
      const seg = segments[i];
      const pending = seg.coords === null;
      lines.push({
        id: `s${i}`,
        coords,
        color: pending ? '#78909c' : seg.fallback ? '#ef6c00' : '#d84315',
        dashed: pending || seg.mode === 'straight',
        width: 5,
      });
    });
    return lines;
  });

  protected readonly mapMarkers = computed<MapMarker[]>(() => {
    if (this.recorder.active()) {
      const coords = this.recorder.coords();
      return this.recorder.marks().map((m, i) => ({
        id: `m${i}`,
        lngLat: coords[m.index],
        type: m.type,
      }));
    }
    const selected = this.store.selectedId();
    return this.store.points().map((p) => ({
      id: p.id,
      lngLat: [p.lng, p.lat] as LngLat,
      type: p.type,
      draggable: true,
      selected: p.id === selected,
      small: p.type === 'via',
    }));
  });

  constructor() {
    addIcons({
      arrowBack,
      arrowUndoOutline,
      arrowRedoOutline,
      locateOutline,
      checkmark,
      close,
      trashOutline,
      swapVerticalOutline,
      ellipsisHorizontal,
      search,
      radioButtonOn,
      stopCircleOutline,
    });

    let lastErrors = 0;
    effect(() => {
      const errors = this.store.routingErrors();
      if (errors > lastErrors) {
        lastErrors = errors;
        this.ui.toast('Routing nicht erreichbar – Abschnitt als Luftlinie eingezeichnet.', 'warning');
      }
    });
  }

  async ngOnInit() {
    const id = this.id();
    try {
      const upcomingPromise = this.appointments.list('upcoming').catch(() => []);
      if (id) {
        const trail = await this.trails.get(id);
        if (!trail) {
          await this.ui.toast('Trail nicht gefunden', 'danger');
          this.nav.navigateBack('/app/trails');
          return;
        }
        this.trail.set(trail);
        this.name = trail.name;
        this.description = trail.description ?? '';
        this.difficulty = trail.difficulty ?? 2;
        this.surface = trail.surface;
        this.appointmentId = trail.appointment_id;
        this.store.load(trail.waypoints ?? [], trail.segments ?? []);
        const coords = trail.route?.coordinates ?? trail.waypoints.map((p) => [p.lng, p.lat] as LngLat);
        if (coords.length) this.fitCoords.set(coords);
      } else {
        this.appointmentId = this.route.snapshot.queryParamMap.get('termin');
      }
      this.upcoming.set(await upcomingPromise);
      this.savedSnapshot = this.store.snapshot();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Karte ---------------------------------------------------------------

  onMapReady() {
    if (!this.id() && !this.initialCenter()) this.map().locate();
  }

  onMapClick(lngLat: LngLat) {
    if (this.recorder.active()) return;
    if (this.store.selectedId()) {
      this.store.selectedId.set(null);
      return;
    }
    this.store.addPoint(lngLat);
    this.rememberCenter(lngLat);
  }

  onMarkerClick(id: string) {
    if (this.recorder.active()) return;
    this.store.selectedId.set(this.store.selectedId() === id ? null : id);
  }

  onMarkerDrag(e: { id: string; lngLat: LngLat }) {
    this.store.movePoint(e.id, e.lngLat);
  }

  locate() {
    this.map().locate();
  }

  // --- Ausgewählter Punkt ----------------------------------------------------

  setType(type: WaypointType) {
    const id = this.store.selectedId();
    if (id) this.store.updatePoint(id, { type });
  }

  setNote(note: string) {
    const id = this.store.selectedId();
    if (id) this.store.updatePoint(id, { note: note || undefined });
  }

  setSelectedSegmentMode(mode: SegmentMode) {
    const i = this.selectedIndex();
    if (i > 0) this.store.setSegmentMode(i - 1, mode);
  }

  removeSelected() {
    const id = this.store.selectedId();
    if (id) this.store.removePoint(id);
  }

  // --- Menü ------------------------------------------------------------------

  async openMenu() {
    const sheet = await this.actionSheets.create({
      header: 'Trail',
      buttons: [
        { text: 'Route per GPS aufzeichnen', icon: 'radio-button-on', data: 'record' },
        { text: 'Route umkehren', icon: 'swap-vertical-outline', data: 'reverse' },
        { text: 'Alle Punkte löschen', icon: 'trash-outline', role: 'destructive', data: 'clear' },
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data === 'reverse') this.store.reverse();
    if (data === 'clear' && (await this.ui.confirm('Alle Punkte löschen?', 'Das lässt sich rückgängig machen.', 'Löschen', true))) {
      this.store.clear();
    }
    if (data === 'record') await this.startRecording();
  }

  // --- Ortssuche -------------------------------------------------------------

  async search(query: string | null | undefined) {
    const q = (query ?? '').trim();
    if (q.length < 3) return;
    this.searching.set(true);
    try {
      this.searchResults.set(await geocode(q));
      if (!this.searchResults().length) await this.ui.toast('Nichts gefunden');
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.searching.set(false);
    }
  }

  pickResult(r: GeocodeResult) {
    this.map().flyTo(r.point, 16);
    this.rememberCenter(r.point);
    this.searchOpen.set(false);
    this.searchResults.set([]);
  }

  // --- Aufzeichnung ------------------------------------------------------------

  async startRecording() {
    if (this.store.points().length) {
      const ok = await this.ui.confirm(
        'Route aufzeichnen',
        'Die aktuelle Route wird durch die Aufzeichnung ersetzt.',
        'Aufzeichnen',
      );
      if (!ok) return;
    }
    this.store.selectedId.set(null);
    await this.recorder.start();
    this.map().locate();
  }

  async markWhileRecording() {
    const sheet = await this.actionSheets.create({
      header: 'Wegpunkt hier setzen',
      buttons: [
        ...this.waypointTypes
          .filter((t) => t.type !== 'start')
          .map((t) => ({ text: t.label, data: t.type })),
        { text: 'Abbrechen', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (data) {
      this.recorder.mark(data as WaypointType);
      await this.ui.toast(`${waypointInfo(data as WaypointType).label} gesetzt`, 'success');
    }
  }

  async stopRecording() {
    const result = this.recorder.stop();
    if (!result) {
      await this.ui.toast('Zu wenige GPS-Punkte aufgezeichnet.', 'warning');
      return;
    }
    this.store.replace(result.points, result.segments);
    this.map().fitTo(this.store.line());
    await this.ui.toast('Aufzeichnung übernommen – du kannst sie jetzt nachbearbeiten.', 'success');
  }

  async cancelRecording() {
    if (await this.ui.confirm('Aufnahme verwerfen?', 'Die aufgezeichnete Strecke geht verloren.', 'Verwerfen', true)) {
      this.recorder.cancel();
    }
  }

  // --- Speichern ---------------------------------------------------------------

  openSave() {
    if (this.store.points().length < 2) {
      this.ui.toast('Setze mindestens zwei Punkte auf der Karte.', 'warning');
      return;
    }
    this.saveSheetOpen.set(true);
  }

  async save() {
    if (!this.name.trim()) {
      await this.ui.toast('Bitte gib dem Trail einen Namen.', 'warning');
      return;
    }
    this.saving.set(true);
    await this.store.idle();
    const saved = await this.ui.run(() =>
      this.trails.save(
        {
          name: this.name.trim(),
          description: this.description.trim() || null,
          difficulty: this.difficulty,
          surface: this.surface,
          appointment_id: this.appointmentId,
          route: this.store.toGeoLine(),
          waypoints: this.store.points(),
          segments: this.store.segments(),
        },
        this.trail()?.id,
      ),
      'Speichern …',
    );
    this.saving.set(false);
    if (!saved) return;
    this.savedSnapshot = this.store.snapshot();
    this.saveSheetOpen.set(false);
    await this.ui.toast('Trail gespeichert', 'success');
    await this.router.navigate(['/app/trails', saved.id], { replaceUrl: true });
  }

  async back() {
    const dirty = this.store.snapshot() !== this.savedSnapshot;
    if (this.recorder.active() || dirty) {
      const ok = await this.ui.confirm(
        'Änderungen verwerfen?',
        'Der Trail wurde noch nicht gespeichert.',
        'Verwerfen',
        true,
      );
      if (!ok) return;
      this.recorder.cancel();
    }
    const id = this.trail()?.id;
    this.nav.navigateBack(id ? ['/app/trails', id] : '/app/trails');
  }

  // --- intern ------------------------------------------------------------------

  private lastCenter(): LngLat | null {
    try {
      const raw = localStorage.getItem(LAST_CENTER_KEY);
      return raw ? (JSON.parse(raw) as LngLat) : null;
    } catch {
      return null;
    }
  }

  private rememberCenter(point: LngLat) {
    try {
      localStorage.setItem(LAST_CENTER_KEY, JSON.stringify(point));
    } catch {
      // ignorieren
    }
  }
}
