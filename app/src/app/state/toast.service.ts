import { Injectable, signal } from '@angular/core';

/** Petit message temporaire affiché en bas de l'écran (« Lien copié », « Rythme enregistré »…). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, ms = 2600): void {
    this.message.set(text);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), ms);
  }
}
