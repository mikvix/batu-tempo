/**
 * Détecteur de frappes (AudioWorklet), exécuté sur le fil audio du navigateur.
 *
 * Un tambour grave (surdo) résonne très fort et très longtemps : enregistré au micro-casque, le son
 * reste à 70–80 % du niveau de l'attaque pendant une demi-seconde, et l'attaque elle-même ne dépasse
 * la résonance que d'un facteur 1,5 en bas du spectre. Au-dessus de 1 kHz en revanche, la résonance
 * est quasi absente et l'attaque (impact de la mailloche) ressort nettement (×4 à ×6). Le signal passe
 * donc d'abord par un passe-haut du second ordre à 1,2 kHz, puis deux enveloppes le suivent :
 *   - `fast` : attaque instantanée, relâchement ≈ 40 ms. Suit chaque coup, y compris en roulement.
 *   - `slow` : niveau « ambiant » du moment, qui monte en ≈ 20 ms et redescend en ≈ 80 ms. Un son
 *     continu (résonance, souffle, bruit) s'y installe ; une nouvelle attaque saute au-dessus.
 * Une frappe est signalée quand `fast` dépasse `slow` × ratio et un seuil absolu (tous deux fixés par
 * la sensibilité), au moins 60 ms après la frappe précédente. L'instant transmis est celui de
 * l'échantillon qui déclenche, sur l'horloge de l'AudioContext : la même que celle du séquenceur.
 */
const HIGHPASS_HZ = 1200;

class OnsetProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Réglages initiaux via processorOptions ; modifiables ensuite par message { threshold, ratio }.
    const init = (options && options.processorOptions) || {};
    this.threshold = typeof init.threshold === 'number' ? init.threshold : 0.03;
    this.ratio = typeof init.ratio === 'number' ? init.ratio : 2.5;
    this.refractory = 0.06;
    this.fast = 0;
    this.slow = 0;
    this.lastHit = -1;
    this.peak = 0;
    this.blocks = 0;
    this.fastRelease = Math.exp(-1 / (0.04 * sampleRate));
    this.slowRise = 1 / (0.02 * sampleRate);
    this.slowFall = 1 / (0.08 * sampleRate);
    // Pas de détection pendant les premiers 100 ms : les enveloppes partent de zéro.
    this.readyAt = currentTime + 0.1;
    // Passe-haut biquad (Butterworth, Q = 1/√2) et son état.
    const w0 = (2 * Math.PI * HIGHPASS_HZ) / sampleRate;
    const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    const c = Math.cos(w0);
    const a0 = 1 + alpha;
    this.b0 = (1 + c) / 2 / a0;
    this.b1 = -(1 + c) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.threshold === 'number') this.threshold = d.threshold;
      if (typeof d.ratio === 'number') this.ratio = d.ratio;
      this.port.postMessage({ type: 'settings', threshold: this.threshold, ratio: this.ratio });
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    const t = currentTime;
    const armed = t >= this.readyAt && t - this.lastHit > this.refractory;
    let hitAt = -1;
    let blockMax = 0;

    for (let i = 0; i < channel.length; i++) {
      const x = channel[i];
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      const a = y < 0 ? -y : y;

      this.fast = a > this.fast ? a : this.fast * this.fastRelease;
      if (hitAt < 0 && armed && this.fast > this.threshold && this.fast > this.slow * this.ratio) {
        hitAt = i;
      }
      this.slow += (this.fast - this.slow) * (this.fast > this.slow ? this.slowRise : this.slowFall);
      const raw = x < 0 ? -x : x;
      if (raw > blockMax) blockMax = raw;
    }

    if (hitAt >= 0) {
      const time = t + hitAt / sampleRate;
      this.lastHit = time;
      this.port.postMessage({ type: 'hit', time, strength: this.fast });
    }

    // Niveau d'entrée brut pour les vumètres, toutes les 6 trames (≈ 16 ms).
    if (blockMax > this.peak) this.peak = blockMax;
    if (++this.blocks >= 6) {
      this.port.postMessage({ type: 'level', level: this.peak });
      this.peak = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('onset-processor', OnsetProcessor);
