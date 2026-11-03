import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { SharedTrail, Trail, TrailAssignment } from '../models';

export type TrailInput = Pick<
  Trail,
  | 'name'
  | 'description'
  | 'difficulty'
  | 'surface'
  | 'route'
  | 'waypoints'
  | 'segments'
  | 'appointment_id'
>;

@Injectable({ providedIn: 'root' })
export class TrailsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Alle Trails der Schule (Trainer). */
  list(appointmentId?: string) {
    return this.api.op<Trail[]>('trails.list', {
      schoolId: this.auth.schoolId(),
      appointmentId: appointmentId ?? null,
    });
  }

  get(id: string) {
    return this.api.op<Trail | null>('trails.get', { id });
  }

  save(input: Partial<TrailInput>, id?: string) {
    return this.api.op<Trail>('trails.save', { id, schoolId: this.auth.schoolId(), input });
  }

  async remove(id: string) {
    await this.api.op('trails.remove', { id });
  }

  assignments(trailId: string) {
    return this.api.op<TrailAssignment[]>('trails.assignments', { id: trailId });
  }

  async assign(trailId: string, customerIds: string[], message: string | null) {
    await this.api.op('trails.assign', { id: trailId, customerIds, message });
  }

  async unassign(assignmentId: string) {
    await this.api.op('trails.unassign', { id: assignmentId });
  }

  /** Trails, die mir zugewiesen wurden (Kunde), aus der aktuellen Schule. */
  mine() {
    return this.api.op<TrailAssignment[]>('trails.mine', { schoolId: this.auth.schoolId() });
  }

  async markSeen(trailId: string) {
    await this.api.op('trails.markSeen', { id: trailId });
  }

  enableShare(trailId: string) {
    return this.api.op<string>('trails.enableShare', { id: trailId });
  }

  async disableShare(trailId: string) {
    await this.api.op('trails.disableShare', { id: trailId });
  }

  getShared(token: string) {
    return this.api.op<SharedTrail | null>('trails.shared', { token });
  }
}

export function shareUrl(token: string) {
  return `${location.origin}/t/${token}`;
}
