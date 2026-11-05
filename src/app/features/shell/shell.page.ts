import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonMenuToggle,
  IonNote,
  IonRouterOutlet,
  IonSplitPane,
  IonTitle,
  IonToolbar,
  MenuController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  businessOutline,
  calendarOutline,
  logOutOutline,
  mapOutline,
  pawOutline,
  peopleOutline,
  personCircleOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';

interface NavItem {
  label: string;
  url: string;
  icon: string;
}

/** App-Rahmen: Navigation über ein Menü links (auf großen Bildschirmen dauerhaft sichtbar). */
@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    IonSplitPane,
    IonMenu,
    IonMenuToggle,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonIcon,
    IonLabel,
    IonNote,
    IonRouterOutlet,
  ],
  template: `
    <ion-split-pane contentId="main" when="lg">
      <ion-menu contentId="main" type="overlay">
        <ion-header>
          <ion-toolbar>
            <ion-title>Mantrailing</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <div class="who">
            <strong>{{ auth.profile()?.full_name || auth.email() }}</strong>
            <span>{{ auth.schoolName() }} · {{ auth.isTrainer() ? 'Trainer:in' : 'Kund:in' }}</span>
          </div>

          <ion-list lines="none">
            @for (item of items(); track item.url) {
              <ion-menu-toggle [autoHide]="false">
                <ion-item
                  [routerLink]="item.url"
                  routerLinkActive="active"
                  routerDirection="root"
                  detail="false"
                  button
                >
                  <ion-icon slot="start" [name]="item.icon" />
                  <ion-label>{{ item.label }}</ion-label>
                </ion-item>
              </ion-menu-toggle>
            }
          </ion-list>

          @if (auth.memberships().length > 1) {
            <ion-list lines="none">
              <ion-list-header><ion-label>Hundeschule wechseln</ion-label></ion-list-header>
              @for (m of auth.memberships(); track m.school_id) {
                <ion-menu-toggle [autoHide]="false">
                  <ion-item button detail="false" (click)="switchSchool(m.school_id)" [class.active]="m.school_id === auth.schoolId()">
                    <ion-icon slot="start" name="business-outline" />
                    <ion-label>{{ m.schools?.name }}</ion-label>
                    <ion-note slot="end">{{ m.role === 'trainer' ? 'Trainer:in' : 'Kund:in' }}</ion-note>
                  </ion-item>
                </ion-menu-toggle>
              }
            </ion-list>
          }

          <ion-list lines="none" class="bottom">
            <ion-menu-toggle [autoHide]="false">
              <ion-item button detail="false" (click)="logout()">
                <ion-icon slot="start" name="log-out-outline" />
                <ion-label>Abmelden</ion-label>
              </ion-item>
            </ion-menu-toggle>
          </ion-list>
        </ion-content>
      </ion-menu>

      <ion-router-outlet id="main" />
    </ion-split-pane>
  `,
  styles: `
    ion-list {
      background: transparent;
    }
    .who {
      display: flex;
      flex-direction: column;
      padding: 16px 20px 8px;
      span {
        font-size: 13px;
        color: var(--ion-color-medium);
        margin-top: 2px;
      }
    }
    ion-item {
      --border-radius: 10px;
      margin: 2px 8px;
      font-size: 16px;
    }
    ion-item.active {
      --background: rgba(var(--ion-color-primary-rgb), 0.14);
      --color: var(--ion-color-primary);
      ion-icon {
        color: var(--ion-color-primary);
      }
    }
    .bottom {
      margin-top: 16px;
      border-top: 1px solid var(--ion-color-step-150, #ddd);
      padding-top: 8px;
    }
  `,
})
export class ShellPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly menu = inject(MenuController);

  protected readonly items = computed<NavItem[]>(() => {
    const trainer = this.auth.isTrainer();
    return [
      { label: 'Termine & Umfragen', url: '/app/termine', icon: 'calendar-outline' },
      { label: trainer ? 'Trails' : 'Meine Trails', url: '/app/trails', icon: 'map-outline' },
      ...(trainer ? [{ label: 'Kund:innen', url: '/app/kunden', icon: 'people-outline' }] : []),
      { label: 'Meine Hunde', url: '/app/hunde', icon: 'paw-outline' },
      { label: 'Konto', url: '/app/konto', icon: 'person-circle-outline' },
      ...(this.auth.isAdmin() ? [{ label: 'Backoffice', url: '/admin', icon: 'shield-checkmark-outline' }] : []),
    ];
  });

  constructor() {
    addIcons({
      calendarOutline,
      mapOutline,
      peopleOutline,
      pawOutline,
      personCircleOutline,
      logOutOutline,
      businessOutline,
      shieldCheckmarkOutline,
    });
  }

  async switchSchool(id: string) {
    this.auth.selectSchool(id);
    await this.router.navigateByUrl('/app/termine', { replaceUrl: true });
  }

  async logout() {
    await this.menu.close();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
