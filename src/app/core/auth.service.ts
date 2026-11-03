import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiError, ApiService } from './api.service';
import { Membership, Profile } from './models';

const SCHOOL_KEY = 'mantrailing.schoolId';
const PENDING_INVITE_KEY = 'mantrailing.pendingInvite';

interface User {
  id: string;
  email: string;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // privater Modus o. ä.
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  readonly user = signal<User | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly memberships = signal<Membership[]>([]);
  private readonly selectedSchoolId = signal<string | null>(readStorage(SCHOOL_KEY));

  /** Angemeldet? (Name wie früher, wird in Templates und Guards benutzt.) */
  readonly session = computed(() => this.user());
  readonly userId = computed(() => this.user()?.id ?? null);
  readonly email = computed(() => this.user()?.email ?? null);
  readonly currentMembership = computed(() => {
    const all = this.memberships();
    return all.find((m) => m.school_id === this.selectedSchoolId()) ?? all[0] ?? null;
  });
  readonly schoolId = computed(() => this.currentMembership()?.school_id ?? null);
  readonly schoolName = computed(() => this.currentMembership()?.schools?.name ?? '');
  readonly role = computed(() => this.currentMembership()?.role ?? null);
  readonly isTrainer = computed(() => this.role() === 'trainer');

  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    if (!this.api.token()) return;
    try {
      const { user } = await this.api.post<{ user: User }>('/auth/me');
      this.user.set(user);
      await this.reload();
    } catch (err) {
      // Offline: Token behalten, aber nicht als angemeldet gelten
      if (err instanceof ApiError && err.status === 401) this.clear();
    }
  }

  /** Wartet, bis die gespeicherte Anmeldung geprüft ist (für Guards). */
  whenReady() {
    return this.ready;
  }

  async reload() {
    if (!this.user()) return;
    const [profile, memberships] = await Promise.all([
      this.api.op<Profile | null>('profile.me'),
      this.api.op<Membership[]>('memberships.mine'),
    ]);
    this.profile.set(profile);
    this.memberships.set(memberships);
  }

  private clear() {
    this.api.setToken(null);
    this.user.set(null);
    this.profile.set(null);
    this.memberships.set([]);
  }

  private async applyLogin(res: { token: string; user: User }) {
    this.api.setToken(res.token);
    this.user.set(res.user);
    await this.reload();
  }

  selectSchool(schoolId: string) {
    this.selectedSchoolId.set(schoolId);
    writeStorage(SCHOOL_KEY, schoolId);
  }

  async signIn(email: string, password: string) {
    await this.applyLogin(await this.api.post('/auth/login', { email, password }));
  }

  async signUp(email: string, password: string, fullName: string) {
    await this.applyLogin(
      await this.api.post('/auth/signup', { email, password, full_name: fullName }),
    );
  }

  async signOut() {
    this.clear();
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.api.post('/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  async updateProfile(changes: Partial<Pick<Profile, 'full_name' | 'phone'>>) {
    await this.api.op('profile.update', { input: changes });
    await this.reload();
  }

  async createSchool(name: string) {
    const id = await this.api.op<string>('school.create', { name });
    await this.reload();
    this.selectSchool(id);
    return id;
  }

  async acceptInvitation(token: string) {
    const schoolId = await this.api.op<string>('invitation.accept', { token });
    this.setPendingInvite(null);
    await this.reload();
    this.selectSchool(schoolId);
    return schoolId;
  }

  async deleteAccount() {
    await this.api.op('account.delete');
    this.clear();
  }

  pendingInvite() {
    return readStorage(PENDING_INVITE_KEY);
  }
  setPendingInvite(token: string | null) {
    writeStorage(PENDING_INVITE_KEY, token);
  }
}
