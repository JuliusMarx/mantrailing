import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonList,
  IonTextarea,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';
import { DogInput, DogsService } from '../../core/data/dogs.service';
import { UiService } from '../../core/ui.service';

@Component({
  selector: 'app-dog-form',
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonContent,
    IonList,
    IonInput,
    IonTextarea,
    IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/app/hunde" /></ion-buttons>
        <ion-title>{{ id() ? 'Hund bearbeiten' : 'Neuer Hund' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="!form.name.trim()" strong>Speichern</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="none" class="form">
        <ion-input fill="outline" label="Name" labelPlacement="floating" [(ngModel)]="form.name" required />
        <ion-input fill="outline" label="Rasse" labelPlacement="floating" [(ngModel)]="form.breed" />
        <ion-input fill="outline" label="Geburtsdatum" labelPlacement="stacked" type="date" [(ngModel)]="form.birth_date" />
        <ion-textarea
          fill="outline"
          label="Besonderheiten"
          labelPlacement="floating"
          placeholder="z. B. läufig, Leinenaggression, Medikamente, Ausbildungsstand"
          [autoGrow]="true"
          [(ngModel)]="form.notes"
        />
      </ion-list>
      @if (id()) {
        <ion-button expand="block" fill="clear" color="danger" (click)="remove()">
          <ion-icon slot="start" name="trash-outline" />Hund löschen
        </ion-button>
      }
    </ion-content>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: transparent;
    }
  `,
})
export class DogFormPage implements OnInit {
  readonly id = input<string>();

  private readonly service = inject(DogsService);
  private readonly ui = inject(UiService);
  private readonly nav = inject(NavController);

  protected form: DogInput = { name: '', breed: null, birth_date: null, notes: null };
  protected readonly loaded = signal(false);

  constructor() {
    addIcons({ trashOutline });
  }

  async ngOnInit() {
    const id = this.id();
    if (id) {
      const dog = await this.ui.run(() => this.service.get(id));
      if (dog) this.form = { name: dog.name, breed: dog.breed, birth_date: dog.birth_date, notes: dog.notes };
    }
    this.loaded.set(true);
  }

  async save() {
    const input: DogInput = {
      name: this.form.name.trim(),
      breed: this.form.breed?.trim() || null,
      birth_date: this.form.birth_date || null,
      notes: this.form.notes?.trim() || null,
    };
    const saved = await this.ui.run(() => this.service.save(input, this.id()));
    if (saved) this.nav.navigateBack('/app/hunde');
  }

  async remove() {
    const ok = await this.ui.confirm(
      'Hund löschen?',
      'Alle Anmeldungen dieses Hundes werden ebenfalls gelöscht.',
      'Löschen',
      true,
    );
    if (!ok) return;
    const done = await this.ui.run(async () => {
      await this.service.remove(this.id()!);
      return true;
    });
    if (done) this.nav.navigateBack('/app/hunde');
  }
}
