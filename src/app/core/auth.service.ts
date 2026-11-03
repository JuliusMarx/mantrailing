import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Membership, Profile } from './models';
import { SupabaseService, unwrap } from './supabase.service';

const SCHOOL_KEY = 'mantrailing.schoolId';
const PENDING_INVITE_KEY = 'mantrailing.pendingInvite';

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
  private readonly supabase = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly memberships = signal<Membership[]>([]);
  private readonly selectedSchoolId = signal<string | null>(readStorage(SCHOOL_KEY));

  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly email = computed(() => this.session()?.user.email ?? null);
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
    const { data } = await this.supabase.auth.getSession();
    await this.applySession(data.session);
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // außerhalb des Auth-Callbacks laden (Supabase empfiehlt, hier nicht zu awaiten)
        setTimeout(() => this.applySession(session));
      } else {
        this.session.set(session);
      }
    });
  }

  /** Wartet, bis die gespeicherte Session geladen ist (für Guards). */
  whenReady() {
    return this.ready;
  }

  private async applySession(session: Session | null) {
    this.session.set(session);
    if (!session) {
      this.profile.set(null);
      this.memberships.set([]);
      return;
    }
    await this.reload();
  }

  async reload() {
    const uid = this.userId();
    if (!uid) return;
    const [profile, memberships] = await Promise.all([
      this.supabase.from('profiles').select('id, full_name, phone').eq('id', uid).maybeSingle(),
      this.supabase
        .from('memberships')
        .select('user_id, school_id, role, schools(id, name)')
        .eq('user_id', uid)
        .order('created_at'),
    ]);
    this.profile.set(unwrap(profile));
    this.memberships.set(unwrap(memberships) as unknown as Membership[]);
  }

  selectSchool(schoolId: string) {
    this.selectedSchoolId.set(schoolId);
    writeStorage(SCHOOL_KEY, schoolId);
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.applySession((await this.supabase.auth.getSession()).data.session);
  }

  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: location.origin },
    });
    if (error) throw error;
    if (data.session) await this.applySession(data.session);
    return { needsConfirmation: !data.session };
  }

  async sendMagicLink(email: string) {
    const { error } = await this.supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin, shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async signOut() {
    await this.supabase.auth.signOut();
    await this.applySession(null);
  }

  async updateProfile(changes: Partial<Pick<Profile, 'full_name' | 'phone'>>) {
    const uid = this.userId();
    if (!uid) return;
    unwrap(await this.supabase.from('profiles').update(changes).eq('id', uid));
    await this.reload();
  }

  async createSchool(name: string) {
    const id = unwrap(await this.supabase.rpc('create_school', { p_name: name })) as string;
    await this.reload();
    this.selectSchool(id);
    return id;
  }

  async acceptInvitation(token: string) {
    const schoolId = unwrap(await this.supabase.rpc('accept_invitation', { p_token: token })) as string;
    this.setPendingInvite(null);
    await this.reload();
    this.selectSchool(schoolId);
    return schoolId;
  }

  async deleteAccount() {
    unwrap(await this.supabase.rpc('delete_my_account'));
    await this.signOut();
  }

  pendingInvite() {
    return readStorage(PENDING_INVITE_KEY);
  }
  setPendingInvite(token: string | null) {
    writeStorage(PENDING_INVITE_KEY, token);
  }
}
