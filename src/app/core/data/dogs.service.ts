import { inject, Injectable } from '@angular/core';
import { ApiService } from '../api.service';
import { Dog } from '../models';

export type DogInput = Pick<Dog, 'name' | 'breed' | 'birth_date' | 'notes'>;

@Injectable({ providedIn: 'root' })
export class DogsService {
  private readonly api = inject(ApiService);

  mine() {
    return this.api.op<Dog[]>('dogs.mine');
  }

  get(id: string) {
    return this.api.op<Dog | null>('dogs.get', { id });
  }

  save(input: DogInput, id?: string) {
    return this.api.op<Dog>('dogs.save', { id, input });
  }

  async remove(id: string) {
    await this.api.op('dogs.remove', { id });
  }
}
