// Génère assets/logo.png (1024×1024) : visuel d'icône inspiré de l'affiche Batu Tempo.
// Fond ambré, lettrage « BATU » noir / « TEMPO » rouge en biais, palmes, tambours, confettis.
// Le texte est converti en tracés avec la police Syne (opentype.js), pour un rendu identique partout.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontFile = join(root, 'node_modules/@fontsource/syne/files/syne-latin-800-normal.woff');
const fontBytes = readFileSync(fontFile);
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));

const S = 1024;

/** Sérialise un tracé opentype.js en attribut `d` (toPathData() de la v2 produit des NaN sur certains flottants). */
function pathData(path) {
  const f = (v) => String(Number(v.toFixed(2)));
  return path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
          return `M${f(c.x)} ${f(c.y)}`;
        case 'L':
          return `L${f(c.x)} ${f(c.y)}`;
        case 'Q':
          return `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`;
        case 'C':
          return `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

/** Trace un mot centré sur x, baseline y, mis à l'échelle pour occuper `targetWidth` px. */
function textPath(text, targetWidth, x, y) {
  const probe = font.getPath(text, 0, 0, 100).getBoundingBox();
  const size = (targetWidth / (probe.x2 - probe.x1)) * 100;
  const path = font.getPath(text, 0, 0, size);
  const bb = path.getBoundingBox();
  const w = bb.x2 - bb.x1;
  const placed = font.getPath(text, x - w / 2 - bb.x1, y, size);
  return { d: pathData(placed), width: w, height: bb.y2 - bb.y1, size };
}

const batu = textPath('BATU', 700, S / 2, 440);
const tempo = textPath('TEMPO', 820, S / 2, 655);

// Palme : éventail de feuilles effilées partant d'un point.
function palm(cx, cy, baseAngle, spread, count, length, flip = 1) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = ((baseAngle + (i / (count - 1) - 0.5) * spread) * Math.PI) / 180;
    const len = length * (0.75 + 0.25 * Math.sin((i / (count - 1)) * Math.PI));
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    const nx = -Math.sin(a) * 26 * flip;
    const ny = Math.cos(a) * 26 * flip;
    const mx = cx + Math.cos(a) * len * 0.55;
    const my = cy + Math.sin(a) * len * 0.55;
    d += `M${cx},${cy} Q${mx + nx},${my + ny} ${ex},${ey} Q${mx - nx * 0.6},${my - ny * 0.6} ${cx},${cy}Z `;
  }
  return d;
}

// Tambour : fût trapézoïdal, cercle de tension, peau claire.
function drum(cx, top, w, h, skin) {
  const r = w / 2;
  return `
    <g>
      <path d="M${cx - r},${top} L${cx - r * 0.86},${top + h} L${cx + r * 0.86},${top + h} L${cx + r},${top}Z" fill="#2B1407"/>
      <ellipse cx="${cx}" cy="${top}" rx="${r}" ry="${r * 0.28}" fill="${skin}"/>
      <ellipse cx="${cx}" cy="${top}" rx="${r}" ry="${r * 0.28}" fill="none" stroke="#2B1407" stroke-width="10"/>
      <path d="M${cx - r * 0.97},${top + h * 0.42} L${cx + r * 0.97},${top + h * 0.42}" stroke="#F2B134" stroke-width="7" opacity="0.9"/>
      ${[-0.6, -0.2, 0.2, 0.6].map((k) => `<path d="M${cx + r * k},${top + r * 0.2} L${cx + r * k * 0.9},${top + h}" stroke="#F2B134" stroke-width="6" opacity="0.7"/>`).join('')}
    </g>`;
}

const confetti = [
  [120, 150, '#D8342A'],
  [200, 95, '#3ECFA6'],
  [850, 120, '#7FA8FF'],
  [930, 220, '#D8342A'],
  [90, 520, '#8E5BD9'],
  [950, 560, '#3ECFA6'],
  [160, 820, '#7FA8FF'],
  [880, 790, '#8E5BD9'],
  [520, 110, '#D8342A'],
  [700, 170, '#8E5BD9'],
  [330, 170, '#7FA8FF'],
]
  .map(([x, y, c]) => `<rect x="${x - 14}" y="${y - 14}" width="28" height="28" fill="${c}" transform="rotate(45 ${x} ${y})" opacity="0.9"/>`)
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#FBD75C"/>
      <stop offset="0.55" stop-color="#F2A51B"/>
      <stop offset="1" stop-color="#B8441A"/>
    </radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2B1407" stop-opacity="0"/>
      <stop offset="1" stop-color="#1A0B04" stop-opacity="0.95"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="10" flood-color="#2B1407" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="${S}" height="${S}" fill="url(#bg)"/>

  <!-- rayons discrets -->
  <g opacity="0.12" fill="#FFF3C4">
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x1 = S / 2 + Math.cos(a - 0.06) * 900;
      const y1 = 430 + Math.sin(a - 0.06) * 900;
      const x2 = S / 2 + Math.cos(a + 0.06) * 900;
      const y2 = 430 + Math.sin(a + 0.06) * 900;
      return `<path d="M${S / 2},430 L${x1},${y1} L${x2},${y2}Z"/>`;
    }).join('')}
  </g>

  ${confetti}

  <!-- palmes -->
  <path d="${palm(-40, 80, 35, 70, 7, 420, 1)}" fill="#2B1407" opacity="0.92"/>
  <path d="${palm(S + 40, 60, 145, 70, 7, 420, -1)}" fill="#2B1407" opacity="0.92"/>

  <!-- sol et tambours -->
  <rect x="0" y="${S - 300}" width="${S}" height="300" fill="url(#ground)"/>
  ${drum(170, 830, 230, 260, '#F6D7A0')}
  ${drum(854, 830, 230, 260, '#F6D7A0')}
  ${drum(512, 850, 300, 260, '#F2C27A')}

  <!-- baguettes croisées, posées sur le tambour central -->
  <g stroke="#F6E2B8" stroke-width="14" stroke-linecap="round">
    <path d="M430,720 L600,860"/>
    <path d="M594,720 L424,860"/>
  </g>

  <!-- lettrage (ombre portée dessinée à la main : les filtres SVG sont rendus différemment selon les moteurs) -->
  <g transform="rotate(-6 ${S / 2} 560)">
    <g transform="translate(0 14)" fill="#2B1407" opacity="0.4">
      <path d="${batu.d}"/>
      <path d="${tempo.d}"/>
    </g>
    <path d="${batu.d}" fill="#161013"/>
    <path d="${tempo.d}" fill="#C8261B"/>
  </g>
</svg>`;

mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'logo.svg'), svg);
await sharp(Buffer.from(svg)).png().toFile(join(root, 'assets', 'logo.png'));
console.log('assets/logo.svg et assets/logo.png générés.');
