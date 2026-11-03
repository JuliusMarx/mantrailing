import { inject, Injectable } from '@angular/core';
import { Poll, PollDog, PollOption, PollOptionSummary, PollVote, VoteAnswer } from '../models';
import { SupabaseService, unwrap } from '../supabase.service';
import { AuthService } from '../auth.service';

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
  private readonly db = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** Offene Umfragen der Schule; answered = ich habe schon abgestimmt. */
  async list(): Promise<(Poll & { answered: boolean })[]> {
    const polls = unwrap(
      await this.db
        .from('polls')
        .select('*, poll_options(*)')
        .eq('school_id', this.auth.schoolId()!)
        .neq('status', 'finalized')
        .order('created_at', { ascending: false }),
    ) as Poll[];
    if (!polls.length) return [];
    const answered = unwrap(
      await this.db
        .from('poll_dogs')
        .select('poll_id')
        .eq('user_id', this.auth.userId()!)
        .in(
          'poll_id',
          polls.map((p) => p.id),
        ),
    ) as { poll_id: string }[];
    const done = new Set(answered.map((a) => a.poll_id));
    return polls.map((p) => ({ ...p, answered: done.has(p.id) }));
  }

  async get(id: string): Promise<PollDetail | null> {
    const poll = unwrap(
      await this.db.from('polls').select('*').eq('id', id).maybeSingle(),
    ) as Poll | null;
    if (!poll) return null;
    const uid = this.auth.userId()!;
    const [options, summary, dogs] = await Promise.all([
      this.db.from('poll_options').select('*').eq('poll_id', id).order('starts_at'),
      this.db.from('poll_option_summary').select('*').eq('poll_id', id),
      this.db.from('poll_dogs').select('dog_id').eq('poll_id', id).eq('user_id', uid),
    ]);
    const optionList = unwrap(options) as PollOption[];
    const votes = optionList.length
      ? (unwrap(
          await this.db
            .from('poll_votes')
            .select('poll_option_id, answer')
            .eq('user_id', uid)
            .in(
              'poll_option_id',
              optionList.map((o) => o.id),
            ),
        ) as PollVote[])
      : [];
    const myVotes: Record<string, VoteAnswer> = {};
    for (const v of votes) myVotes[v.poll_option_id] = v.answer;
    return {
      poll,
      options: optionList,
      summary: unwrap(summary) as PollOptionSummary[],
      myDogIds: (unwrap(dogs) as { dog_id: string }[]).map((d) => d.dog_id),
      myVotes,
    };
  }

  /** Alle Antworten mit Namen und Hunden (nur Trainer). */
  async responses(pollId: string, optionIds: string[]) {
    const [votes, dogs] = await Promise.all([
      this.db
        .from('poll_votes')
        .select('poll_option_id, user_id, answer, profiles(id, full_name)')
        .in('poll_option_id', optionIds),
      this.db.from('poll_dogs').select('poll_id, user_id, dog_id, dogs(id, name)').eq('poll_id', pollId),
    ]);
    return {
      votes: unwrap(votes) as unknown as PollVote[],
      dogs: unwrap(dogs) as unknown as PollDog[],
    };
  }

  async create(input: PollInput, options: PollOptionInput[]): Promise<Poll> {
    const poll = unwrap(
      await this.db
        .from('polls')
        .insert({ ...input, school_id: this.auth.schoolId() })
        .select()
        .single(),
    ) as Poll;
    try {
      unwrap(
        await this.db.from('poll_options').insert(options.map((o) => ({ ...o, poll_id: poll.id }))),
      );
    } catch (err) {
      await this.db.from('polls').delete().eq('id', poll.id);
      throw err;
    }
    return poll;
  }

  async setStatus(id: string, status: Poll['status']) {
    unwrap(await this.db.from('polls').update({ status }).eq('id', id));
  }

  async remove(id: string) {
    unwrap(await this.db.from('polls').delete().eq('id', id));
  }

  async submit(pollId: string, dogIds: string[], votes: Record<string, VoteAnswer>) {
    const payload = Object.entries(votes).map(([option_id, answer]) => ({ option_id, answer }));
    unwrap(
      await this.db.rpc('submit_poll_response', {
        p_poll: pollId,
        p_dogs: dogIds,
        p_votes: payload,
      }),
    );
  }

  async finalize(pollId: string, optionId: string): Promise<string> {
    return unwrap(
      await this.db.rpc('finalize_poll', { p_poll: pollId, p_option: optionId }),
    ) as string;
  }
}
