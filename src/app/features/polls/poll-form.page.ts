import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonList,
  IonListHeader,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, trashOutline } from 'ionicons/icons';
import { PollsService } from '../../core/data/polls.service';
import { GeoPoint } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { fromLocalInput, toLocalInput } from '../../shared/dates';
import { PointPickerComponent } from '../../shared/point-picker.component';

interface OptionDraft {
  start: string;
  endTime: string;
  maxDogs: number | string | null;
}

@Component({
  selector: 'app-poll-form',
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
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/app/termine" /></ion-buttons>
        <ion-title>Terminumfrage</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="!valid()" strong>Starten</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p class="muted">
        Schlage mehrere Termine vor. Deine Kund:innen wählen ihre Hunde aus und stimmen pro Termin
        ab. Danach legst du den besten Termin fest.
      </p>
      <ion-list lines="none" class="form">
        <ion-input fill="outline" label="Titel" labelPlacement="floating" placeholder="z. B. Waldtrail im Stadtwald" [(ngModel)]="title" />
        <ion-textarea fill="outline" label="Beschreibung" labelPlacement="floating" [autoGrow]="true" [(ngModel)]="description" />
        <ion-input fill="outline" label="Abstimmen bis" labelPlacement="stacked" type="datetime-local" [(ngModel)]="deadline" />
      </ion-list>

      <ion-list-header class="ion-no-padding"><ion-label>Terminvorschläge</ion-label></ion-list-header>
      @for (o of options(); track $index; let i = $index) {
        <div class="option">
          <div class="option-head">
            <strong>Vorschlag {{ i + 1 }}</strong>
            @if (options().length > 1) {
              <ion-button fill="clear" color="medium" size="small" (click)="removeOption(i)" aria-label="Vorschlag entfernen">
                <ion-icon slot="icon-only" name="trash-outline" />
              </ion-button>
            }
          </div>
          <ion-input fill="outline" label="Beginn" labelPlacement="stacked" type="datetime-local" [(ngModel)]="o.start" />
          <div class="two">
            <ion-input fill="outline" label="Ende (Uhrzeit)" labelPlacement="stacked" type="time" [(ngModel)]="o.endTime" />
            <ion-input fill="outline" label="Max. Hunde" labelPlacement="stacked" type="number" inputmode="numeric" min="1" placeholder="unbegrenzt" [(ngModel)]="o.maxDogs" />
          </div>
        </div>
      }
      <ion-button expand="block" fill="outline" (click)="addOption()">
        <ion-icon slot="start" name="add" />Weiteren Vorschlag
      </ion-button>

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
    .option {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid var(--ion-color-step-150, #ddd);
      border-radius: 12px;
      padding: 8px 12px 12px;
      margin-bottom: 12px;
    }
    .option-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 32px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  `,
})
export class PollFormPage {
  private readonly polls = inject(PollsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  protected title = '';
  protected description = '';
  protected deadline = '';
  protected address = '';
  protected readonly point = signal<GeoPoint | null>(null);
  protected readonly options = signal<OptionDraft[]>([]);

  constructor() {
    addIcons({ add, trashOutline });
    const first = new Date();
    first.setDate(first.getDate() + 7);
    first.setHours(10, 0, 0, 0);
    this.options.set([{ start: toLocalInput(first.toISOString()), endTime: '12:00', maxDogs: 6 }]);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);
    deadline.setHours(20, 0, 0, 0);
    this.deadline = toLocalInput(deadline.toISOString());
  }

  addOption() {
    const last = this.options()[this.options().length - 1];
    const next = last?.start ? new Date(last.start) : new Date();
    next.setDate(next.getDate() + 1);
    this.options.update((o) => [
      ...o,
      { start: toLocalInput(next.toISOString()), endTime: last?.endTime ?? '', maxDogs: last?.maxDogs ?? null },
    ]);
  }

  removeOption(i: number) {
    this.options.update((o) => o.filter((_, idx) => idx !== i));
  }

  protected valid() {
    return this.title.trim().length > 0 && this.options().length > 0 && this.options().every((o) => !!fromLocalInput(o.start));
  }

  async save() {
    const options = this.options().map((o) => {
      const startsAt = fromLocalInput(o.start)!;
      let endsAt: string | null = null;
      if (o.endTime) {
        const end = new Date(startsAt);
        const [h, m] = o.endTime.split(':').map(Number);
        end.setHours(h, m, 0, 0);
        if (end.getTime() > new Date(startsAt).getTime()) endsAt = end.toISOString();
      }
      const max = o.maxDogs === null || o.maxDogs === '' ? null : Math.round(Number(o.maxDogs));
      return { starts_at: startsAt, ends_at: endsAt, max_dogs: max && max > 0 ? max : null };
    });
    const poll = await this.ui.run(() =>
      this.polls.create(
        {
          title: this.title.trim(),
          description: this.description.trim() || null,
          deadline: fromLocalInput(this.deadline),
          meeting_address: this.address.trim() || null,
          meeting_point: this.point(),
        },
        options,
      ),
    );
    if (poll) await this.router.navigate(['/app/umfragen', poll.id], { replaceUrl: true });
  }
}
