/**
 * Détecteur de frappes (AudioWorklet), exécuté sur le fil audio du navigateur.
 *
 * Le signal du micro passe par un filtre passe-haut léger (retire le souffle et les vibrations
 * graves), puis on suit son enveloppe bloc par bloc (128 échantillons ≈ 3 ms). Une frappe est
 * signalée quand l'enveloppe dépasse à la fois un seuil absolu et un multiple du bruit de fond,
 * en montée franche, et au moins 70 ms après la frappe précédente. L'instant transmis est celui
 * du premier échantillon au-dessus du seuil, sur l'horloge de l'AudioContext : c'est la même
 * horloge que celle du séquenceur, ce qui permet de comparer directement frappes et notes.
 */
class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.08;
    this.ratio = 4;
    this.refractory = 0.07;
    this.background = 0.002;
    this.prevEnv = 0;
    this.lastHit = -1;
    this.hp = 0;
    this.prevX = 0;
    this.peak = 0;
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.threshold === 'number') this.threshold = d.threshold;
      if (typeof d.ratio === 'number') this.ratio = d.ratio;
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    const trigger = Math.max(this.threshold, this.background * this.ratio);
    let env = 0;
    let first = -1;
    for (let i = 0; i < channel.length; i++) {
      // Passe-haut du premier ordre (coupure ~ 60 Hz à 48 kHz).
      const y = channel[i] - this.prevX + 0.992 * this.hp;
      this.prevX = channel[i];
      this.hp = y;
      const a = y < 0 ? -y : y;
      if (a > env) env = a;
      if (first < 0 && a > trigger) first = i;
    }

    const t = currentTime;
    if (first >= 0 && env > this.prevEnv * 1.3 && t - this.lastHit > this.refractory) {
      const time = t + first / sampleRate;
      this.lastHit = time;
      this.port.postMessage({ type: 'hit', time, strength: env });
    }

    // Bruit de fond : suit lentement l'enveloppe (constante de temps ≈ 0,6 s).
    this.background += (env - this.background) * 0.005;
    this.prevEnv = env;

    if (env > this.peak) this.peak = env;
    if (++this.blocks >= 6) {
      this.port.postMessage({ type: 'level', level: this.peak });
      this.peak = 0;
      this.blocks = 0;
    }
    return true;
  }
}

registerProcessor('onset-processor', OnsetProcessor);
