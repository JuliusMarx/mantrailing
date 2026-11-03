import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { Poll, PollDog, PollOption, PollOptionSummary, PollVote, VoteAnswer } from '../models';

export type PollInput = Pick<
  Poll,
  'title' | 'description' | 'meeting_point' | 'meeting_address' | 'deadline'
>;
export type PollOptionInput = Pick<PollOption, 'starts_at' | 'ends_at' | 'max_dogs'>;

export interface PollDetail {
  poll: Poll;
  options: PollOption[];
  summary: PollOptionSummary[];
  myDogIds: string[];
  myVotes: Record<string, VoteAnswer>;
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

  /** Alle Antworten mit Namen und Hunden (nur Trainer). */
  responses(pollId: string) {
    return this.api.op<{ votes: PollVote[]; dogs: PollDog[] }>('polls.responses', { id: pollId });
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

  async submit(pollId: string, dogIds: string[], votes: Record<string, VoteAnswer>) {
    await this.api.op('polls.submit', {
      id: pollId,
      dogIds,
      votes: Object.entries(votes).map(([option_id, answer]) => ({ option_id, answer })),
    });
  }

  finalize(pollId: string, optionId: string) {
    return this.api.op<string>('polls.finalize', { id: pollId, optionId });
  }
}
