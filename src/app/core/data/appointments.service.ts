import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { Appointment, AppointmentSummary, Participant, ParticipantStatus } from '../models';

export type AppointmentInput = Omit<Appointment, 'id' | 'school_id' | 'poll_id' | 'status'>;

export interface AppointmentWithSummary extends Appointment {
  summary: AppointmentSummary | null;
  /** Eigene Anmeldungen (Hunde) des angemeldeten Users. */
  mine: Participant[];
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  list(range: 'upcoming' | 'past' = 'upcoming') {
    return this.api.op<AppointmentWithSummary[]>('appointments.list', {
      schoolId: this.auth.schoolId(),
      range,
    });
  }

  get(id: string) {
    return this.api.op<AppointmentWithSummary | null>('appointments.get', { id });
  }

  /** Alle Teilnehmer (Trainer). */
  participants(appointmentId: string) {
    return this.api.op<Participant[]>('appointments.participants', { id: appointmentId });
  }

  save(input: Partial<AppointmentInput>, id?: string) {
    return this.api.op<Appointment>('appointments.save', {
      id,
      schoolId: this.auth.schoolId(),
      input,
    });
  }

  async setStatus(id: string, status: Appointment['status']) {
    await this.api.op('appointments.setStatus', { id, status });
  }

  async remove(id: string) {
    await this.api.op('appointments.remove', { id });
  }

  register(appointmentId: string, dogIds: string[]) {
    return this.api.op<{ dog_id: string; status: ParticipantStatus }[]>('appointments.register', {
      id: appointmentId,
      dogIds,
    });
  }

  async cancelRegistration(appointmentId: string, dogIds: string[]) {
    await this.api.op('appointments.cancelRegistration', { id: appointmentId, dogIds });
  }

  /** Trainer ändert den Status einer Anmeldung (z. B. von der Warteliste holen). */
  async setParticipantStatus(participantId: string, status: ParticipantStatus) {
    await this.api.op('participants.setStatus', { id: participantId, status });
  }
}
