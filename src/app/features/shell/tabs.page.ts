import { Component, inject } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, mapOutline, pawOutline, peopleOutline, personCircleOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="termine" href="/app/termine">
          <ion-icon name="calendar-outline" />
          <ion-label>Termine</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="trails" href="/app/trails">
          <ion-icon name="map-outline" />
          <ion-label>Trails</ion-label>
        </ion-tab-button>
        @if (auth.isTrainer()) {
          <ion-tab-button tab="kunden" href="/app/kunden">
            <ion-icon name="people-outline" />
            <ion-label>Kunden</ion-label>
          </ion-tab-button>
        } @else {
          <ion-tab-button tab="hunde" href="/app/hunde">
            <ion-icon name="paw-outline" />
            <ion-label>Hunde</ion-label>
          </ion-tab-button>
        }
        <ion-tab-button tab="konto" href="/app/konto">
          <ion-icon name="person-circle-outline" />
          <ion-label>Konto</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  protected readonly auth = inject(AuthService);

  constructor() {
    addIcons({ calendarOutline, mapOutline, pawOutline, peopleOutline, personCircleOutline });
  }
}
