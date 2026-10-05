import { Capacitor } from '@capacitor/core';

import { minifyRhythm } from './custom';
import { RhythmDef } from './types';

/** Adresse publique de la version web, utilisée pour les liens créés depuis l'app native. */
export const PUBLIC_URL = 'https://mikvix.github.io/batu-tempo/';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * Encode un rythme dans une chaîne courte pour l'URL : JSON réduit, compressé (deflate) puis en base64url.
 * Préfixe « z » = compressé, « j » = JSON brut (navigateurs sans CompressionStream).
 */
export async function encodeRhythm(r: RhythmDef): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(minifyRhythm(r)));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(json);
}

export async function decodeRhythm(code: string): Promise<unknown> {
  const kind = code[0];
  const bytes = fromBase64Url(code.slice(1));
  let json: Uint8Array;
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Navigateur trop ancien pour lire ce lien.');
    json = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') {
    json = bytes;
  } else {
    throw new Error('Lien de rythme non reconnu.');
  }
  return JSON.parse(new TextDecoder().decode(json));
}

/** Lien complet à partager : l'app web ouvre la page d'import avec le rythme dans le fragment (#…). */
export async function shareLink(r: RhythmDef): Promise<string> {
  const base = Capacitor.isNativePlatform() ? PUBLIC_URL : document.baseURI;
  return new URL('import#' + (await encodeRhythm(r)), base).toString();
}

/** Ouvre la feuille de partage du système si elle existe, sinon copie le lien. Renvoie ce qui a été fait. */
export async function shareRhythm(r: RhythmDef): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = await shareLink(r);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Batu Tempo · ${r.name}`, text: `Rythme « ${r.name} » pour Batu Tempo`, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
