import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonList,
  IonListHeader,
  IonLabel,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AppointmentsService } from '../../core/data/appointments.service';
import { GeoPoint } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { fromLocalInput, toLocalInput } from '../../shared/dates';
import { PointPickerComponent } from '../../shared/point-picker.component';

@Component({
  selector: 'app-appointment-form',
  imports: [
    FormsModule,
    PointPickerComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonLabel,
    IonInput,
    IonTextarea,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/app/termine" /></ion-buttons>
        <ion-title>{{ id() ? 'Termin bearbeiten' : 'Neuer Termin' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="!valid()" strong>Speichern</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="none" class="form">
        <ion-input fill="outline" label="Titel" labelPlacement="floating" placeholder="z. B. Stadttrail Innenstadt" [(ngModel)]="title" />
        <div class="two">
          <ion-input fill="outline" label="Beginn" labelPlacement="stacked" type="datetime-local" [(ngModel)]="start" />
          <ion-input fill="outline" label="Ende" labelPlacement="stacked" type="datetime-local" [(ngModel)]="end" />
        </div>
        <div class="two">
          <ion-input fill="outline" label="Max. Hunde" labelPlacement="stacked" type="number" inputmode="numeric" min="1" placeholder="unbegrenzt" [(ngModel)]="maxDogs" />
          <ion-input fill="outline" label="Anmeldeschluss" labelPlacement="stacked" type="datetime-local" [(ngModel)]="deadline" />
        </div>
        <ion-textarea fill="outline" label="Hinweise" labelPlacement="floating" [autoGrow]="true" placeholder="z. B. Geruchsartikel mitbringen" [(ngModel)]="notes" />
      </ion-list>

      <ion-list-header class="ion-no-padding"><ion-label>Treffpunkt</ion-label></ion-list-header>
      <ion-list lines="none" class="form">
        <ion-input fill="outline" label="Adresse / Beschreibung" labelPlacement="floating" [(ngModel)]="address" />
      </ion-list>
      <app-point-picker [(point)]="point" [address]="address" />
    </ion-content>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: transparent;
      margin-bottom: 12px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class AppointmentFormPage implements OnInit {
  readonly id = input<string>();

  private readonly service = inject(AppointmentsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  protected title = '';
  protected start = '';
  protected end = '';
  protected maxDogs: number | string | null = 6;
  protected deadline = '';
  protected notes = '';
  protected address = '';
  protected readonly point = signal<GeoPoint | null>(null);

  async ngOnInit() {
    const id = this.id();
    if (!id) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(10, 0, 0, 0);
      this.start = toLocalInput(d.toISOString());
      d.setHours(12);
      this.end = toLocalInput(d.toISOString());
      return;
    }
    const a = await this.ui.run(() => this.service.get(id));
    if (!a) return;
    this.title = a.title;
    this.start = toLocalInput(a.starts_at);
    this.end = toLocalInput(a.ends_at);
    this.maxDogs = a.max_dogs;
    this.deadline = toLocalInput(a.registration_deadline);
    this.notes = a.notes ?? '';
    this.address = a.meeting_address ?? '';
    this.point.set(a.meeting_point);
  }

  protected valid() {
    return this.title.trim().length > 0 && !!fromLocalInput(this.start);
  }

  async save() {
    const startsAt = fromLocalInput(this.start)!;
    const endsAt = fromLocalInput(this.end);
    if (endsAt && endsAt < startsAt) {
      await this.ui.toast('Das Ende liegt vor dem Beginn.', 'warning');
      return;
    }
    const max = this.maxDogs === null || this.maxDogs === '' ? null : Number(this.maxDogs);
    const saved = await this.ui.run(() =>
      this.service.save(
        {
          title: this.title.trim(),
          starts_at: startsAt,
          ends_at: endsAt,
          max_dogs: max && max > 0 ? Math.round(max) : null,
          registration_deadline: fromLocalInput(this.deadline),
          notes: this.notes.trim() || null,
          meeting_address: this.address.trim() || null,
          meeting_point: this.point(),
        },
        this.id(),
      ),
    );
    if (saved) await this.router.navigate(['/app/termine', saved.id], { replaceUrl: true });
  }
}
