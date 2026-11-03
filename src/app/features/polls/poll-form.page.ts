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
import { UiService } from '../../core/ui.service';
import { fromLocalInput, toLocalInput } from '../../shared/dates';

interface OptionDraft {
  start: string;
  maxDogs: number | string | null;
}

@Component({
  selector: 'app-poll-form',
  imports: [
    FormsModule,
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
        ab – bis der jeweilige Termin beginnt. Danach legst du den besten Termin fest; den
        Treffpunkt trägst du später am Termin ein.
      </p>
      <ion-list lines="none" class="form">
        <ion-input fill="outline" label="Titel" labelPlacement="floating" placeholder="z. B. Waldtrail im Stadtwald" [(ngModel)]="title" />
        <ion-textarea fill="outline" label="Beschreibung" labelPlacement="floating" [autoGrow]="true" [(ngModel)]="description" />
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
          <div class="two">
            <ion-input fill="outline" label="Beginn" labelPlacement="stacked" type="datetime-local" [(ngModel)]="o.start" />
            <ion-input fill="outline" label="Max. Hunde" labelPlacement="stacked" type="number" inputmode="numeric" min="1" placeholder="unbegrenzt" [(ngModel)]="o.maxDogs" />
          </div>
        </div>
      }
      <ion-button expand="block" fill="outline" (click)="addOption()">
        <ion-icon slot="start" name="add" />Weiteren Vorschlag
      </ion-button>
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
      grid-template-columns: 3fr 2fr;
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
  protected readonly options = signal<OptionDraft[]>([]);

  constructor() {
    addIcons({ add, trashOutline });
    const first = new Date();
    first.setDate(first.getDate() + 7);
    first.setHours(10, 0, 0, 0);
    this.options.set([{ start: toLocalInput(first.toISOString()), maxDogs: 6 }]);
  }

  addOption() {
    const last = this.options()[this.options().length - 1];
    const next = last?.start ? new Date(last.start) : new Date();
    next.setDate(next.getDate() + 1);
    this.options.update((o) => [
      ...o,
      { start: toLocalInput(next.toISOString()), maxDogs: last?.maxDogs ?? null },
    ]);
  }

  removeOption(i: number) {
    this.options.update((o) => o.filter((_, idx) => idx !== i));
  }

  protected valid() {
    return this.title.trim().length > 0 && this.options().length > 0 && this.options().every((o) => !!fromLocalInput(o.start));
  }

  async save() {
    if (this.options().some((o) => new Date(o.start).getTime() <= Date.now())) {
      await this.ui.toast('Ein Terminvorschlag liegt in der Vergangenheit.', 'warning');
      return;
    }
    const options = this.options().map((o) => {
      const max = o.maxDogs === null || o.maxDogs === '' ? null : Math.round(Number(o.maxDogs));
      return { starts_at: fromLocalInput(o.start)!, ends_at: null, max_dogs: max && max > 0 ? max : null };
    });
    const poll = await this.ui.run(() =>
      this.polls.create(
        {
          title: this.title.trim(),
          description: this.description.trim() || null,
          deadline: null,
          meeting_address: null,
          meeting_point: null,
        },
        options,
      ),
    );
    if (poll) await this.router.navigate(['/app/umfragen', poll.id], { replaceUrl: true });
  }
}
