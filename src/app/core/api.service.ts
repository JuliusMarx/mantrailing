import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'mantrailing.token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Client für die eigene API (Netlify Functions unter /api). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly token = signal<string | null>(readToken());

  setToken(token: string | null) {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // privater Modus o. ä.
    }
  }

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    let res: Response;
    try {
      const token = this.token();
      res = await fetch(`/api${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Keine Verbindung zum Server.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/auth/login') this.setToken(null);
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Fehler ${res.status}`);
    return data as T;
  }

  /** Datenoperation ausführen (siehe netlify/lib/ops.mts). */
  async op<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
    return (await this.post<{ data: T }>(`/op/${name}`, params)).data;
  }
}
