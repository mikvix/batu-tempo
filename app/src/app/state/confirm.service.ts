import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Fenêtre de confirmation dessinée par l'app. Remplace window.confirm(), que certains navigateurs
 * intégrés (WhatsApp, Instagram…) bloquent sans rien afficher en répondant « non ».
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(message: string, options: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
    this.request()?.resolve(false);
    return new Promise((resolve) => {
      this.request.set({
        message,
        confirmLabel: options.confirmLabel ?? 'Confirmer',
        danger: options.danger ?? false,
        resolve: (ok) => {
          this.request.set(null);
          resolve(ok);
        },
      });
    });
  }
}
