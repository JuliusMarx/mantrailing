import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { Dog, Membership, Role } from '../models';

export interface Member extends Membership {
  dogs: Dog[];
}

export interface JoinInfo {
  school_id: string;
  school_name: string;
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

  /** Beitrittslink-Token der aktuellen Schule (null = abgeschaltet). */
  joinToken() {
    return this.api.op<string | null>('school.joinToken', { schoolId: this.auth.schoolId() });
  }

  /** Neuen Link erzeugen (alter wird ungültig) oder mit enabled=false abschalten. */
  resetJoinToken(enabled: boolean) {
    return this.api.op<string | null>('school.resetJoinToken', {
      schoolId: this.auth.schoolId(),
      enabled,
    });
  }

  joinInfo(token: string) {
    return this.api.op<JoinInfo | null>('school.joinInfo', { token });
  }

  async renameSchool(name: string) {
    await this.api.op('school.rename', { schoolId: this.auth.schoolId(), name });
    await this.auth.reload();
  }
}

export function joinUrl(token: string) {
  return `${location.origin}/beitreten/${token}`;
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
