import { Component, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet /></ion-app>`,
})
export class App {
  constructor() {
    // Neue Version der PWA sofort übernehmen, statt die alte aus dem Cache weiterzuzeigen
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) return;
    updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') location.reload();
    });
    updates.checkForUpdate().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updates.checkForUpdate().catch(() => undefined);
    });
  }
}
