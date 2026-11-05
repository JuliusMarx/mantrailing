import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { Dog, Role } from '../models';

export interface AdminStats {
  schools: number;
  users: number;
  dogs: number;
  upcoming_appointments: number;
  open_polls: number;
  trails: number;
}

export interface AdminSchool {
  id: string;
  name: string;
  created_at: string;
  customers: number;
  trainers: number;
  appointments: number;
  trails: number;
  trainer_names: string;
}

export interface AdminSchoolMember {
  user_id: string;
  role: Role;
  full_name: string;
  email: string;
  dogs: number;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  full_name: string;
  phone: string | null;
  is_admin: boolean;
  schools?: number;
  dogs?: number;
}

export interface AdminUserDetail {
  user: AdminUser;
  memberships: { school_id: string; role: Role; school_name: string }[];
  dogs: Dog[];
}

export interface AdminDog extends Dog {
  owner_name: string;
  owner_email: string;
}

export type AdminDogInput = Pick<Dog, 'name' | 'breed' | 'birth_date' | 'notes'>;

/** Backoffice-API (nur für Plattform-Admins). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  private async call<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
    return (await this.api.post<{ data: T }>(`/admin/${name}`, params)).data;
  }

  stats() {
    return this.call<AdminStats>('stats');
  }

  // Hundeschulen
  schools(q = '') {
    return this.call<AdminSchool[]>('schools', { q });
  }
  school(id: string) {
    return this.call<{ school: { id: string; name: string; created_at: string }; members: AdminSchoolMember[] } | null>(
      'school',
      { id },
    );
  }
  renameSchool(id: string, name: string) {
    return this.call('school.rename', { id, name });
  }
  deleteSchool(id: string) {
    return this.call('school.delete', { id });
  }
  addMember(id: string, email: string, role: Role) {
    return this.call('school.addMember', { id, email, role });
  }
  setRole(id: string, userId: string, role: Role) {
    return this.call('school.setRole', { id, userId, role });
  }
  removeMember(id: string, userId: string) {
    return this.call('school.removeMember', { id, userId });
  }

  // Nutzer:innen
  users(q = '') {
    return this.call<AdminUser[]>('users', { q });
  }
  user(id: string) {
    return this.call<AdminUserDetail | null>('user', { id });
  }
  updateUser(id: string, changes: { full_name: string; phone: string | null; email: string }) {
    return this.call('user.update', { id, ...changes });
  }
  async resetPassword(id: string): Promise<string> {
    return (await this.call<{ password: string }>('user.resetPassword', { id })).password;
  }
  setAdmin(id: string, admin: boolean) {
    return this.call('user.setAdmin', { id, admin });
  }
  deleteUser(id: string) {
    return this.call('user.delete', { id });
  }

  // Hunde
  dogs(q = '') {
    return this.call<AdminDog[]>('dogs', { q });
  }
  saveDog(id: string, input: AdminDogInput) {
    return this.call<Dog>('dog.save', { id, input });
  }
  deleteDog(id: string) {
    return this.call('dog.delete', { id });
  }
}
