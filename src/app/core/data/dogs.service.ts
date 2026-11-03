import { inject, Injectable } from '@angular/core';
import { Dog } from '../models';
import { SupabaseService, unwrap } from '../supabase.service';
import { AuthService } from '../auth.service';

export type DogInput = Pick<Dog, 'name' | 'breed' | 'birth_date' | 'notes'>;

@Injectable({ providedIn: 'root' })
export class DogsService {
  private readonly db = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async mine(): Promise<Dog[]> {
    return unwrap(
      await this.db.from('dogs').select('*').eq('owner_id', this.auth.userId()!).order('name'),
    ) as Dog[];
  }

  async get(id: string): Promise<Dog | null> {
    return unwrap(await this.db.from('dogs').select('*').eq('id', id).maybeSingle()) as Dog | null;
  }

  async save(input: DogInput, id?: string): Promise<Dog> {
    const query = id
      ? this.db.from('dogs').update(input).eq('id', id)
      : this.db.from('dogs').insert(input);
    return unwrap(await query.select().single()) as Dog;
  }

  async remove(id: string) {
    unwrap(await this.db.from('dogs').delete().eq('id', id));
  }
}
