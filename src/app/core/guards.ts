import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.session() ? true : router.parseUrl('/login');
};

/** Angemeldet und Mitglied mindestens einer Schule. */
export const memberGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.session()) return router.parseUrl('/login');
  const join = auth.pendingJoin();
  if (join) return router.parseUrl(`/beitreten/${join}`);
  if (auth.memberships().length) return true;
  return router.parseUrl(auth.isAdmin() ? '/admin' : '/willkommen');
};

export const trainerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isTrainer() ? true : router.parseUrl('/app/termine');
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.session() ? router.parseUrl('/app') : true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.session()) return router.parseUrl('/login');
  return auth.isAdmin() ? true : router.parseUrl('/app');
};
