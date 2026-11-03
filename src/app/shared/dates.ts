/** ISO-Zeitstempel → Wert für <input type="datetime-local"> (lokale Zeit). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Wert aus <input type="datetime-local"> → ISO-Zeitstempel. */
export function fromLocalInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Gleicher Kalendertag wie ein anderer Zeitpunkt, aber mit anderer Uhrzeit (HH:mm). */
export function withTime(iso: string, time: string): string {
  const d = new Date(iso);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function isPast(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() <= Date.now();
}
