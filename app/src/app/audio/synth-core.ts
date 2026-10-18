/** Briques communes aux deux jeux de sons : bruit, enveloppe, oscillateur glissant, bruit filtré. */

let noiseBuffer: AudioBuffer | null = null;
let noiseRate = 0;

export function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseRate !== ctx.sampleRate) {
    const length = Math.floor(ctx.sampleRate * 1.5);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    noiseBuffer.copyToChannel(data, 0);
    noiseRate = ctx.sampleRate;
  }
  return noiseBuffer;
}

export function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, decay: number, attack = 0.002): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

export interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1?: number;
  glide?: number;
  decay: number;
  peak: number;
}

export function tone(ctx: AudioContext, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? 0.04));
  }
  const g = envelope(ctx, out, t, o.peak, o.decay);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + o.decay + 0.08);
}

export interface NoiseOpts {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  decay: number;
  peak: number;
}

export function noise(ctx: AudioContext, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.8;
  const g = envelope(ctx, out, t, o.peak, o.decay, 0.001);
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random() * 0.8);
  src.stop(t + o.decay + 0.08);
}
