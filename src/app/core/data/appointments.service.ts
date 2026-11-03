import { inject, Injectable } from '@angular/core';
import { Appointment, AppointmentSummary, Participant, ParticipantStatus } from '../models';
import { SupabaseService, unwrap } from '../supabase.service';
import { AuthService } from '../auth.service';

export type AppointmentInput = Omit<Appointment, 'id' | 'school_id' | 'poll_id' | 'status'>;

export interface AppointmentWithSummary extends Appointment {
  summary: AppointmentSummary | null;
  /** Eigene Anmeldungen (Hunde) des angemeldeten Users. */
  mine: Participant[];
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly db = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async list(range: 'upcoming' | 'past' = 'upcoming'): Promise<AppointmentWithSummary[]> {
    const schoolId = this.auth.schoolId()!;
    const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    let query = this.db.from('appointments').select('*').eq('school_id', schoolId);
    query =
      range === 'upcoming'
        ? query.gte('starts_at', since).order('starts_at')
        : query.lt('starts_at', since).order('starts_at', { ascending: false }).limit(50);
    const appointments = unwrap(await query) as Appointment[];
    return this.withSummaries(appointments);
  }

  async get(id: string): Promise<AppointmentWithSummary | null> {
    const appt = unwrap(
      await this.db.from('appointments').select('*').eq('id', id).maybeSingle(),
    ) as Appointment | null;
    if (!appt) return null;
    return (await this.withSummaries([appt]))[0];
  }

  private async withSummaries(appointments: Appointment[]): Promise<AppointmentWithSummary[]> {
    if (!appointments.length) return [];
    const ids = appointments.map((a) => a.id);
    const [summaries, mine] = await Promise.all([
      this.db.from('appointment_summary').select('*').in('appointment_id', ids),
      this.db
        .from('appointment_participants')
        .select('*, dogs(id, name, breed)')
        .in('appointment_id', ids)
        .eq('user_id', this.auth.userId()!)
        .neq('status', 'cancelled'),
    ]);
    const summaryList = unwrap(summaries) as AppointmentSummary[];
    const mineList = unwrap(mine) as Participant[];
    return appointments.map((a) => ({
      ...a,
      summary: summaryList.find((s) => s.appointment_id === a.id) ?? null,
      mine: mineList.filter((p) => p.appointment_id === a.id),
    }));
  }

  /** Alle Teilnehmer (Trainer). */
  async participants(appointmentId: string): Promise<Participant[]> {
    return unwrap(
      await this.db
        .from('appointment_participants')
        .select('*, dogs(id, name, breed), profiles(id, full_name)')
        .eq('appointment_id', appointmentId)
        .order('created_at'),
    ) as Participant[];
  }

  async save(input: Partial<AppointmentInput>, id?: string): Promise<Appointment> {
    const query = id
      ? this.db.from('appointments').update(input).eq('id', id)
      : this.db.from('appointments').insert({ ...input, school_id: this.auth.schoolId() });
    return unwrap(await query.select().single()) as Appointment;
  }

  async setStatus(id: string, status: Appointment['status']) {
    unwrap(await this.db.from('appointments').update({ status }).eq('id', id));
  }

  async remove(id: string) {
    unwrap(await this.db.from('appointments').delete().eq('id', id));
  }

  async register(appointmentId: string, dogIds: string[]) {
    return unwrap(
      await this.db.rpc('register_for_appointment', { p_appointment: appointmentId, p_dogs: dogIds }),
    ) as { dog_id: string; status: ParticipantStatus }[];
  }

  async cancelRegistration(appointmentId: string, dogIds: string[]) {
    unwrap(
      await this.db.rpc('cancel_registration', { p_appointment: appointmentId, p_dogs: dogIds }),
    );
  }

  /** Trainer ändert den Status einer Anmeldung (z. B. von der Warteliste holen). */
  async setParticipantStatus(participantId: string, status: ParticipantStatus) {
    unwrap(
      await this.db.from('appointment_participants').update({ status }).eq('id', participantId),
    );
  }
}
