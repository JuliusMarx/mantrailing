import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { Poll, PollChoice, PollOption, PollOptionSummary } from '../models';

export type PollInput = Pick<Poll, 'title' | 'description'>;
export type PollOptionInput = Pick<PollOption, 'starts_at' | 'max_dogs'>;

export interface PollDetail {
  poll: Poll;
  options: PollOption[];
  summary: PollOptionSummary[];
  /** Meine Hunde je Vorschlag (option_id → dog_ids). */
  myChoices: Record<string, string[]>;
  answered: boolean;
}

@Injectable({ providedIn: 'root' })
export class PollsService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Offene Umfragen der Schule; answered = ich habe schon abgestimmt. */
  list() {
    return this.api.op<(Poll & { answered: boolean })[]>('polls.list', {
      schoolId: this.auth.schoolId(),
    });
  }

  get(id: string) {
    return this.api.op<PollDetail | null>('polls.get', { id });
  }

  /** Wer kommt an welchem Vorschlag mit welchen Hunden (nur Trainer). */
  responses(pollId: string) {
    return this.api.op<PollChoice[]>('polls.responses', { id: pollId });
  }

  create(input: PollInput, options: PollOptionInput[]) {
    return this.api.op<Poll>('polls.create', { schoolId: this.auth.schoolId(), input, options });
  }

  async setStatus(id: string, status: Poll['status']) {
    await this.api.op('polls.setStatus', { id, status });
  }

  async remove(id: string) {
    await this.api.op('polls.remove', { id });
  }

  /** choices: option_id → Hunde, mit denen ich an diesem Termin komme (leer = komme nicht). */
  async submit(pollId: string, choices: Record<string, string[]>) {
    await this.api.op('polls.submit', {
      id: pollId,
      choices: Object.entries(choices).map(([option_id, dog_ids]) => ({ option_id, dog_ids })),
    });
  }

  finalize(pollId: string, optionId: string) {
    return this.api.op<string>('polls.finalize', { id: pollId, optionId });
  }
}
