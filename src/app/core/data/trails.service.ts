import { inject, Injectable } from '@angular/core';
import { SharedTrail, Trail, TrailAssignment } from '../models';
import { SupabaseService, unwrap } from '../supabase.service';
import { AuthService } from '../auth.service';

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

const LIST_COLUMNS =
  'id, school_id, name, description, difficulty, surface, length_m, appointment_id, share_token, created_at, updated_at, route';

@Injectable({ providedIn: 'root' })
export class TrailsService {
  private readonly db = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** Alle Trails der Schule (Trainer). */
  async list(appointmentId?: string): Promise<Trail[]> {
    let query = this.db.from('trails').select(LIST_COLUMNS).eq('school_id', this.auth.schoolId()!);
    if (appointmentId) query = query.eq('appointment_id', appointmentId);
    return unwrap(await query.order('updated_at', { ascending: false })) as unknown as Trail[];
  }

  async get(id: string): Promise<Trail | null> {
    return unwrap(
      await this.db.from('trails').select('*').eq('id', id).maybeSingle(),
    ) as Trail | null;
  }

  async save(input: Partial<TrailInput>, id?: string): Promise<Trail> {
    const query = id
      ? this.db.from('trails').update(input).eq('id', id)
      : this.db.from('trails').insert({ ...input, school_id: this.auth.schoolId() });
    return unwrap(await query.select().single()) as Trail;
  }

  async remove(id: string) {
    unwrap(await this.db.from('trails').delete().eq('id', id));
  }

  async assignments(trailId: string): Promise<TrailAssignment[]> {
    return unwrap(
      await this.db
        .from('trail_assignments')
        .select('*, profiles!trail_assignments_customer_id_fkey(id, full_name)')
        .eq('trail_id', trailId)
        .order('created_at'),
    ) as unknown as TrailAssignment[];
  }

  async assign(trailId: string, customerIds: string[], message: string | null) {
    unwrap(
      await this.db.from('trail_assignments').upsert(
        customerIds.map((customer_id) => ({ trail_id: trailId, customer_id, message })),
        { onConflict: 'trail_id,customer_id' },
      ),
    );
  }

  async unassign(assignmentId: string) {
    unwrap(await this.db.from('trail_assignments').delete().eq('id', assignmentId));
  }

  /** Trails, die mir zugewiesen wurden (Kunde), nur aus der aktuellen Schule. */
  async mine(): Promise<TrailAssignment[]> {
    const rows = unwrap(
      await this.db
        .from('trail_assignments')
        .select(`*, trails(${LIST_COLUMNS})`)
        .eq('customer_id', this.auth.userId()!)
        .order('created_at', { ascending: false }),
    ) as unknown as TrailAssignment[];
    return rows.filter((r) => r.trails && r.trails.school_id === this.auth.schoolId());
  }

  async markSeen(trailId: string) {
    await this.db.rpc('mark_trail_seen', { p_trail: trailId });
  }

  async enableShare(trailId: string): Promise<string> {
    return unwrap(await this.db.rpc('enable_trail_share', { p_trail: trailId })) as string;
  }

  async disableShare(trailId: string) {
    unwrap(await this.db.from('trails').update({ share_token: null }).eq('id', trailId));
  }

  async getShared(token: string): Promise<SharedTrail | null> {
    return unwrap(
      await this.db.rpc('get_shared_trail', { p_token: token }),
    ) as SharedTrail | null;
  }
}

export function shareUrl(token: string) {
  return `${location.origin}/t/${token}`;
}
