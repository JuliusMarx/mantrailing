import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, memberGuard, trainerGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registrieren',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'invite/:token',
    loadComponent: () => import('./features/auth/invite.page').then((m) => m.InvitePage),
  },
  {
    path: 'willkommen',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 't/:token',
    loadComponent: () =>
      import('./features/shared-trail/shared-trail.page').then((m) => m.SharedTrailPage),
  },
  {
    path: 'editor',
    canActivate: [memberGuard, trainerGuard],
    children: [
      {
        path: 'neu',
        loadComponent: () =>
          import('./features/trails/editor/trail-editor.page').then((m) => m.TrailEditorPage),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/trails/editor/trail-editor.page').then((m) => m.TrailEditorPage),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [memberGuard],
    loadComponent: () => import('./features/shell/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'termine' },
      {
        path: 'termine',
        loadComponent: () =>
          import('./features/appointments/appointments.page').then((m) => m.AppointmentsPage),
      },
      {
        path: 'termine/neu',
        canActivate: [trainerGuard],
        loadComponent: () =>
          import('./features/appointments/appointment-form.page').then(
            (m) => m.AppointmentFormPage,
          ),
      },
      {
        path: 'termine/:id',
        loadComponent: () =>
          import('./features/appointments/appointment-detail.page').then(
            (m) => m.AppointmentDetailPage,
          ),
      },
      {
        path: 'termine/:id/bearbeiten',
        canActivate: [trainerGuard],
        loadComponent: () =>
          import('./features/appointments/appointment-form.page').then(
            (m) => m.AppointmentFormPage,
          ),
      },
      {
        path: 'umfragen/neu',
        canActivate: [trainerGuard],
        loadComponent: () => import('./features/polls/poll-form.page').then((m) => m.PollFormPage),
      },
      {
        path: 'umfragen/:id',
        loadComponent: () =>
          import('./features/polls/poll-detail.page').then((m) => m.PollDetailPage),
      },
      {
        path: 'trails',
        loadComponent: () => import('./features/trails/trails.page').then((m) => m.TrailsPage),
      },
      {
        path: 'trails/:id',
        loadComponent: () =>
          import('./features/trails/trail-detail.page').then((m) => m.TrailDetailPage),
      },
      {
        path: 'hunde',
        loadComponent: () => import('./features/dogs/dogs.page').then((m) => m.DogsPage),
      },
      {
        path: 'hunde/neu',
        loadComponent: () => import('./features/dogs/dog-form.page').then((m) => m.DogFormPage),
      },
      {
        path: 'hunde/:id',
        loadComponent: () => import('./features/dogs/dog-form.page').then((m) => m.DogFormPage),
      },
      {
        path: 'kunden',
        canActivate: [trainerGuard],
        loadComponent: () =>
          import('./features/customers/customers.page').then((m) => m.CustomersPage),
      },
      {
        path: 'konto',
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
      },
    ],
  },
  // Nur im Entwicklungsmodus: Editor ohne Login ausprobieren (Speichern geht dort nicht).
  ...(isDevMode()
    ? [
        {
          path: 'dev/editor',
          loadComponent: () =>
            import('./features/trails/editor/trail-editor.page').then((m) => m.TrailEditorPage),
        },
      ]
    : []),
  { path: '**', redirectTo: 'app' },
];
