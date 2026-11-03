import { inject, Injectable } from '@angular/core';
import { Dog, Invitation, Membership, Role } from '../models';
import { SupabaseService, unwrap } from '../supabase.service';
import { AuthService } from '../auth.service';

export interface Member extends Membership {
  dogs: Dog[];
}

export interface InvitationInfo {
  school_name: string;
  email: string;
  role: Role;
  valid: boolean;
}

@Injectable({ providedIn: 'root' })
export class SchoolService {
  private readonly db = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** Mitglieder der aktuellen Schule inkl. Hunden (Trainer). */
  async members(role?: Role): Promise<Member[]> {
    let query = this.db
      .from('memberships')
      .select('user_id, school_id, role, profiles(id, full_name, phone)')
      .eq('school_id', this.auth.schoolId()!);
    if (role) query = query.eq('role', role);
    const members = unwrap(await query) as unknown as Membership[];
    if (!members.length) return [];
    const dogs = unwrap(
      await this.db
        .from('dogs')
        .select('*')
        .in(
          'owner_id',
          members.map((m) => m.user_id),
        )
        .order('name'),
    ) as Dog[];
    return members
      .map((m) => ({ ...m, dogs: dogs.filter((d) => d.owner_id === m.user_id) }))
      .sort((a, b) =>
        (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? '', 'de'),
      );
  }

  async setRole(userId: string, role: Role) {
    unwrap(
      await this.db
        .from('memberships')
        .update({ role })
        .eq('user_id', userId)
        .eq('school_id', this.auth.schoolId()!),
    );
  }

  async removeMember(userId: string) {
    unwrap(
      await this.db
        .from('memberships')
        .delete()
        .eq('user_id', userId)
        .eq('school_id', this.auth.schoolId()!),
    );
  }

  async invitations(): Promise<Invitation[]> {
    return unwrap(
      await this.db
        .from('invitations')
        .select('*')
        .eq('school_id', this.auth.schoolId()!)
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ) as Invitation[];
  }

  async invite(email: string, role: Role): Promise<Invitation> {
    return unwrap(
      await this.db
        .from('invitations')
        .insert({ email: email.trim().toLowerCase(), role, school_id: this.auth.schoolId() })
        .select()
        .single(),
    ) as Invitation;
  }

  async revokeInvitation(id: string) {
    unwrap(await this.db.from('invitations').delete().eq('id', id));
  }

  async invitationInfo(token: string): Promise<InvitationInfo | null> {
    const rows = unwrap(
      await this.db.rpc('get_invitation', { p_token: token }),
    ) as InvitationInfo[];
    return rows[0] ?? null;
  }

  async renameSchool(name: string) {
    unwrap(await this.db.from('schools').update({ name }).eq('id', this.auth.schoolId()!));
    await this.auth.reload();
  }
}

export function inviteUrl(token: string) {
  return `${location.origin}/invite/${token}`;
}

/** Teilen über das System-Teilen-Menü, sonst in die Zwischenablage. */
export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'shared';
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
