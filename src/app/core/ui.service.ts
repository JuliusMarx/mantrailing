import { inject, Injectable } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular/standalone';

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    if (err.message.includes('Invalid login credentials')) return 'E-Mail oder Passwort ist falsch.';
    if (err.message.includes('Email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
    if (err.message.includes('Failed to fetch')) return 'Keine Verbindung zum Server.';
    return err.message;
  }
  return 'Unbekannter Fehler';
}

@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly toasts = inject(ToastController);
  private readonly alerts = inject(AlertController);
  private readonly loading = inject(LoadingController);

  async toast(message: string, color: 'success' | 'danger' | 'medium' | 'warning' = 'medium') {
    const t = await this.toasts.create({ message, duration: 2500, color, position: 'top' });
    await t.present();
  }

  error(err: unknown) {
    console.error(err);
    return this.toast(errorMessage(err), 'danger');
  }

  async confirm(header: string, message: string, confirmText = 'OK', destructive = false) {
    const alert = await this.alerts.create({
      header,
      message,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        { text: confirmText, role: 'confirm', cssClass: destructive ? 'alert-danger' : '' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Führt eine Aktion mit Lade-Overlay aus und zeigt Fehler als Toast. */
  async run<T>(action: () => Promise<T>, message = 'Bitte warten …'): Promise<T | undefined> {
    const overlay = await this.loading.create({ message });
    await overlay.present();
    try {
      return await action();
    } catch (err) {
      await this.error(err);
      return undefined;
    } finally {
      await overlay.dismiss();
    }
  }
}
