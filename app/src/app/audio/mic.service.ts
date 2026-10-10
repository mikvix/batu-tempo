import { Injectable, signal } from '@angular/core';

import { ensureAudioReady } from './engine';

export type MicState = 'off' | 'starting' | 'on' | 'denied' | 'unsupported' | 'error';

/** Une frappe captée : instant sur l'horloge audio (brut, sans correction de latence) et force. */
export interface RawHit {
  time: number;
  strength: number;
}

/**
 * Sensibilité 1 à 5 → seuil absolu (niveau de l'attaque, après passe-haut à 1,2 kHz) et rapport exigé
 * entre l'attaque et le niveau ambiant juste avant. Repère : un surdo frappé normalement au micro-casque
 * donne des attaques entre 0,06 et 0,1 ; une caixa ou un agogô, bien plus.
 */
const SENSITIVITY: Record<number, { threshold: number; ratio: number }> = {
  1: { threshold: 0.08, ratio: 3 },
  2: { threshold: 0.05, ratio: 2.75 },
  3: { threshold: 0.03, ratio: 2.5 },
  4: { threshold: 0.018, ratio: 2.25 },
  5: { threshold: 0.01, ratio: 2 },
};

/**
 * Micro du navigateur, branché sur le même AudioContext que le séquenceur. Le détecteur de frappes
 * tourne dans un AudioWorklet (public/onset-processor.js) et renvoie chaque frappe avec son instant
 * sur l'horloge audio. Le niveau d'entrée est exposé pour les vumètres.
 */
@Injectable({ providedIn: 'root' })
export class MicService {
  readonly state = signal<MicState>('off');
  readonly level = signal(0);

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private moduleLoaded = false;
  private sensitivity = 3;
  private readonly listeners = new Set<(hit: RawHit) => void>();

  get supported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
  }

  /** Demande l'accès au micro (si besoin) et démarre la détection. Renvoie true si le micro écoute. */
  async start(): Promise<boolean> {
    if (this.state() === 'on') return true;
    if (!this.supported) {
      this.state.set('unsupported');
      return false;
    }
    this.state.set('starting');
    const ctx = await ensureAudioReady();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // Traitements de la voix désactivés : ils lisseraient les attaques et ajouteraient du retard.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      this.state.set((e as Error).name === 'NotAllowedError' ? 'denied' : 'error');
      return false;
    }
    try {
      if (!this.moduleLoaded) {
        await ctx.audioWorklet.addModule(new URL('onset-processor.js', document.baseURI).toString());
        this.moduleLoaded = true;
      }
      this.source = ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(ctx, 'onset-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: SENSITIVITY[this.sensitivity],
      });
      // Sortie muette vers la destination : garantit que le navigateur fait tourner le détecteur.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.node);
      this.node.connect(this.sink);
      this.sink.connect(ctx.destination);
      this.node.port.onmessage = (e: MessageEvent<{ type: string; time?: number; strength?: number; level?: number }>) => {
        const d = e.data;
        if (d.type === 'hit') this.listeners.forEach((l) => l({ time: d.time ?? 0, strength: d.strength ?? 0 }));
        else if (d.type === 'level') this.level.set(Math.min(1, (d.level ?? 0) * 2.5));
      };
      this.applySensitivity();
      this.state.set('on');
      return true;
    } catch {
      this.stop();
      this.state.set('error');
      return false;
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.level.set(0);
    if (this.state() === 'on' || this.state() === 'starting') this.state.set('off');
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.min(5, Math.max(1, Math.round(value)));
    this.applySensitivity();
  }

  onHit(listener: (hit: RawHit) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applySensitivity(): void {
    this.node?.port.postMessage(SENSITIVITY[this.sensitivity]);
  }
}
