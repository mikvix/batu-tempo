// Prépare les sources d'icônes et de splash pour @capacitor/assets à partir d'un seul visuel.
//
//   assets/logo.png            → le visuel fourni (carré, idéalement ≥ 1024 px)
//   assets/icon-only.png       → icône « legacy » 1024×1024 (le visuel plein cadre)
//   assets/icon-foreground.png → icône adaptative : visuel réduit dans la zone sûre (66 %), fond transparent
//   assets/icon-background.png → fond uni sombre
//   assets/splash.png          → écran de lancement 2732×2732, visuel centré sur fond sombre
//
// Puis : npx capacitor-assets generate --android   (voir le script npm « assets »)

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const logo = join(assets, 'logo.png');
const BG = '#141216';

if (!existsSync(logo)) {
  console.error(`Visuel introuvable : ${logo}\nPlace le logo (PNG ou JPG carré) à cet emplacement puis relance.`);
  process.exit(1);
}

mkdirSync(assets, { recursive: true });

const ICON = 1024;
const SPLASH = 2732;

// Icône pleine (Android < 8 et iOS) : le visuel occupe tout le carré.
await sharp(logo).resize(ICON, ICON, { fit: 'cover' }).png().toFile(join(assets, 'icon-only.png'));

// Icône adaptative : le système applique un masque (rond, carré arrondi…) qui garde ~66 % du centre.
// Le visuel est donc réduit à 62 % du canevas, arrondi, et posé sur un fond transparent.
const fgSize = Math.round(ICON * 0.62);
const rounded = Buffer.from(
  `<svg width="${fgSize}" height="${fgSize}"><rect width="${fgSize}" height="${fgSize}" rx="${Math.round(fgSize * 0.22)}" ry="${Math.round(fgSize * 0.22)}"/></svg>`
);
const fgLogo = await sharp(logo)
  .resize(fgSize, fgSize, { fit: 'cover' })
  .composite([{ input: rounded, blend: 'dest-in' }])
  .png()
  .toBuffer();
await sharp({ create: { width: ICON, height: ICON, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: fgLogo, gravity: 'centre' }])
  .png()
  .toFile(join(assets, 'icon-foreground.png'));

await sharp({ create: { width: ICON, height: ICON, channels: 4, background: BG } })
  .png()
  .toFile(join(assets, 'icon-background.png'));

// Splash : visuel centré (45 % de la largeur) sur le fond de l'app.
const splashLogo = await sharp(logo)
  .resize(Math.round(SPLASH * 0.45), Math.round(SPLASH * 0.45), { fit: 'cover' })
  .composite([
    {
      input: Buffer.from(
        `<svg width="${Math.round(SPLASH * 0.45)}" height="${Math.round(SPLASH * 0.45)}"><rect width="100%" height="100%" rx="140" ry="140"/></svg>`
      ),
      blend: 'dest-in',
    },
  ])
  .png()
  .toBuffer();
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: SPLASH, height: SPLASH, channels: 4, background: BG } })
    .composite([{ input: splashLogo, gravity: 'centre' }])
    .png()
    .toFile(join(assets, name));
}

// Favicon et icône web.
await sharp(logo).resize(64, 64, { fit: 'cover' }).png().toFile(join(root, 'public', 'favicon.png'));
await sharp(logo).resize(180, 180, { fit: 'cover' }).png().toFile(join(root, 'public', 'apple-touch-icon.png'));

// Icônes de la PWA (manifest.webmanifest) : tailles classiques, plus une version « maskable »
// où le visuel est réduit dans la zone sûre sur le fond de l'app.
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

console.log('Sources générées dans assets/ (icon-only, icon-foreground, icon-background, splash), public/ (favicon) et public/icons/ (PWA).');
