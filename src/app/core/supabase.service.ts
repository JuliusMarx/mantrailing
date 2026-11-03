import { Injectable } from '@angular/core';
import { createClient, PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const isSupabaseConfigured = !!(environment.supabaseUrl && environment.supabaseAnonKey);

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl || 'http://localhost:54321',
    environment.supabaseAnonKey || 'not-configured',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}

/** Wirft den Supabase-Fehler weiter, sonst die Daten. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
