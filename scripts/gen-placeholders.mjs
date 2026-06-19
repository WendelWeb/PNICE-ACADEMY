// Generates branded SVG placeholders for every image slot in the app.
// Real raster images dropped into public/images/... auto-replace these
// (see lib/courseImage.ts). Run: node scripts/gen-placeholders.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#10204A';
const PAPER = '#EDE6D6';
const OCHRE = '#D98E2B';
const TEAL = '#1F6E66';

const courseCodes = [
  'PA-01',
  'PA-02',
  'PA-03',
  'PA-04',
  'PA-05',
  'PA-06',
  'PA-07',
  'PA-08',
  'PA-09',
];

const avatars = [
  ['avatar-1', 'D'],
  ['avatar-2', 'P'],
  ['avatar-3', 'N'],
];

function routeLines(w, h, color, opacity) {
  return [w * 0.16, w * 0.84]
    .map(
      (x) =>
        `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2" stroke-dasharray="2 12"/>`,
    )
    .join('');
}

function courseSvg(code, num, accent) {
  const w = 800;
  const h = 600;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${PAPER}"/>
  ${routeLines(w, h, INK, 0.1)}
  <circle cx="${w / 2}" cy="${h / 2}" r="170" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="158" fill="none" stroke="${accent}" stroke-opacity="0.14" stroke-width="1"/>
  <text x="${w / 2}" y="${h / 2}" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="150" fill="${accent}" fill-opacity="0.30" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${code}</text>
  <text x="44" y="86" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="58" fill="${INK}" fill-opacity="0.85" text-anchor="start">${num}</text>
  <text x="${w / 2}" y="${h - 40}" font-family="Courier New, monospace" font-size="18" fill="${INK}" fill-opacity="0.45" text-anchor="middle" letter-spacing="6">PNICE ACADEMY</text>
</svg>`;
}

function bannerSvg(sealTop, sealBottom, caption) {
  const w = 1600;
  const h = 900;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10204A"/>
      <stop offset="1" stop-color="#16264f"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${routeLines(w, h, PAPER, 0.12)}
  <g transform="translate(${w / 2} ${h / 2}) rotate(-6)">
    <circle r="150" fill="none" stroke="${OCHRE}" stroke-width="2"/>
    <circle r="138" fill="none" stroke="${OCHRE}" stroke-opacity="0.5" stroke-width="1"/>
    <text x="0" y="-12" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="96" fill="${OCHRE}" text-anchor="middle">${sealTop}</text>
    <text x="0" y="58" font-family="Arial, sans-serif" font-size="26" fill="${OCHRE}" text-anchor="middle" letter-spacing="6">${sealBottom}</text>
  </g>
  <text x="${w / 2}" y="${h - 56}" font-family="Courier New, monospace" font-size="22" fill="${PAPER}" fill-opacity="0.5" text-anchor="middle" letter-spacing="8">${caption}</text>
</svg>`;
}

function avatarSvg(initial) {
  const s = 400;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <rect width="${s}" height="${s}" fill="${PAPER}"/>
  <circle cx="200" cy="160" r="64" fill="${INK}" fill-opacity="0.14"/>
  <path d="M92 352 C92 272 150 250 200 250 C250 250 308 272 308 352 Z" fill="${INK}" fill-opacity="0.14"/>
  <circle cx="200" cy="200" r="188" fill="none" stroke="${OCHRE}" stroke-opacity="0.35" stroke-width="3"/>
  <text x="200" y="210" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="120" fill="${OCHRE}" fill-opacity="0.55" text-anchor="middle">${initial}</text>
</svg>`;
}

mkdirSync(join(root, 'public/images/courses'), { recursive: true });
mkdirSync(join(root, 'public/images/avatars'), { recursive: true });

courseCodes.forEach((code, i) => {
  const num = String(i + 1).padStart(2, '0');
  const slug = code.toLowerCase();
  writeFileSync(
    join(root, 'public/images/courses', `${slug}.svg`),
    courseSvg(code, num, OCHRE),
  );
  writeFileSync(
    join(root, 'public/images/courses', `${slug}-b.svg`),
    courseSvg(code, num, TEAL),
  );
});

avatars.forEach(([name, initial]) => {
  writeFileSync(
    join(root, 'public/images/avatars', `${name}.svg`),
    avatarSvg(initial),
  );
});

writeFileSync(
  join(root, 'public/images/hero.svg'),
  bannerSvg('9', 'FÒMASYON', 'BATI LAVI DIJITAL OU'),
);
writeFileSync(
  join(root, 'public/images/founder.svg'),
  bannerSvg('PA', 'SHIPPING', 'PNICE · MIAMI ⇄ AYITI'),
);
writeFileSync(
  join(root, 'public/images/secure.svg'),
  bannerSvg('OK', 'SEKIRITE', 'PEMAN AN SEKIRITE'),
);

console.log('Placeholders generated in public/images/');
