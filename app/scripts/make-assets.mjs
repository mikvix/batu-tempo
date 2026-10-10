// Génère les icônes de la PWA à partir d'un seul visuel : assets/logo.png (carré, idéalement ≥ 1024 px).
//
//   public/favicon.png            onglet du navigateur
//   public/apple-touch-icon.png   écran d'accueil iOS
//   public/icons/icon-*.png       icônes du manifeste (72 à 512 px)
//   public/icons/icon-maskable-*  icône « maskable » : visuel réduit dans la zone sûre, sur le fond de l'app
//
// Usage : npm run assets

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(root, 'assets', 'logo.png');
const BG = '#141216';

if (!existsSync(logo)) {
  console.error(`Visuel introuvable : ${logo}\nPlace le logo (PNG ou JPG carré) à cet emplacement puis relance.`);
  process.exit(1);
}

await sharp(logo).resize(64, 64, { fit: 'cover' }).png().toFile(join(root, 'public', 'favicon.png'));
await sharp(logo).resize(180, 180, { fit: 'cover' }).png().toFile(join(root, 'public', 'apple-touch-icon.png'));

const icons = join(root, 'public', 'icons');
mkdirSync(icons, { recursive: true });
for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  await sharp(logo).resize(size, size, { fit: 'cover' }).png().toFile(join(icons, `icon-${size}x${size}.png`));
}
const maskLogo = await sharp(logo).resize(Math.round(512 * 0.7), Math.round(512 * 0.7), { fit: 'cover' }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: maskLogo, gravity: 'centre' }])
  .png()
  .toFile(join(icons, 'icon-maskable-512x512.png'));

console.log('Icônes générées dans public/ et public/icons/.');
