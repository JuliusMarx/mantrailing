import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { Dog, Invitation, Membership, Role } from '../models';

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
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Mitglieder der aktuellen Schule inkl. Hunden (Trainer). */
  members(role?: Role) {
    return this.api.op<Member[]>('members.list', {
      schoolId: this.auth.schoolId(),
      role: role ?? null,
    });
  }

  async setRole(userId: string, role: Role) {
    await this.api.op('members.setRole', { schoolId: this.auth.schoolId(), userId, role });
  }

  async removeMember(userId: string) {
    await this.api.op('members.remove', { schoolId: this.auth.schoolId(), userId });
  }

  /** Setzt das Passwort eines Mitglieds zurück und liefert das neue Einmal-Passwort. */
  async resetPassword(userId: string): Promise<string> {
    const { password } = await this.api.post<{ password: string }>('/auth/reset-password', {
      user_id: userId,
    });
    return password;
  }

  invitations() {
    return this.api.op<Invitation[]>('invitations.list', { schoolId: this.auth.schoolId() });
  }

  invite(email: string, role: Role) {
    return this.api.op<Invitation>('invitations.create', {
      schoolId: this.auth.schoolId(),
      email,
      role,
    });
  }

  async revokeInvitation(id: string) {
    await this.api.op('invitations.revoke', { id });
  }

  invitationInfo(token: string) {
    return this.api.op<InvitationInfo | null>('invitation.info', { token });
  }

  async renameSchool(name: string) {
    await this.api.op('school.rename', { schoolId: this.auth.schoolId(), name });
    await this.auth.reload();
  }
}

export function inviteUrl(token: string) {
  return `${location.origin}/invite/${token}`;
}

/** Teilen über das System-Teilen-Menü, sonst in die Zwischenablage. */
export async function shareLink(
  title: string,
  text: string,
  url: string,
): Promise<'shared' | 'copied'> {
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
