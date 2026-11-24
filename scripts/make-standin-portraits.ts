// Draws a stand-in portrait for every hero that has no painted one yet: an ink silhouette with the
// hero's own headgear and weapon (taken from the duel kit), the realm's colour behind it and the
// hero's seal character in gold. A painted 1024x1024 JPG dropped at public/portraits/<id>.jpg
// replaces a stand-in; this script never overwrites a file unless told to.
//
//   npm run portraits:standin                 # only heroes with no portrait file
//   npm run portraits:standin -- --redo a,b   # redraw the stand-ins of heroes a and b
//   npm run optimize:art                      # then write the AVIF copies
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { getHeroDuelProfile } from '../src/game/heroDuelProfiles.js';
import { createInitialHeroes } from '../src/game/heroes.js';
import type { FactionId, General } from '../src/game/types.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'portraits');
const redoArg = process.argv.indexOf('--redo');
const redo = new Set(redoArg >= 0 ? (process.argv[redoArg + 1] ?? '').split(',').filter(Boolean) : []);

const REALM: Record<FactionId, string> = {
  wei: '#4c78a8',
  shu: '#438554',
  wu: '#c2432f',
  neutral: '#b08a3e',
};
const CJK = "'Noto Serif CJK SC', 'Noto Serif SC', 'Source Han Serif SC', serif";

function headgear(kind: string, accent: string): string {
  if (kind === 'bandana_crest') {
    return `
      <path d="M380 404 C380 262 644 262 644 404 C600 356 424 356 380 404 Z" fill="#0f0c0a"/>
      <path d="M376 372 C440 344 584 344 648 372 L648 412 C584 384 440 384 376 412 Z" fill="${accent}"/>
      <path d="M640 380 C720 372 770 420 792 500 C742 462 700 446 648 440 Z" fill="${accent}" opacity="0.9"/>
      <path d="M644 400 C700 420 716 480 712 560 C684 500 664 468 636 448 Z" fill="${accent}" opacity="0.7"/>`;
  }
  if (kind === 'pheasant_crown') {
    return `
      <path d="M470 282 C380 190 300 110 170 60" fill="none" stroke="${accent}" stroke-width="15" stroke-linecap="round"/>
      <path d="M554 282 C644 190 724 110 854 60" fill="none" stroke="${accent}" stroke-width="15" stroke-linecap="round"/>
      <path d="M392 392 C392 252 632 252 632 392 L604 372 L568 318 L540 372 L512 300 L484 372 L456 318 L420 372 Z" fill="#221a12"/>
      <path d="M392 392 L420 372 L456 318 L484 372 L512 300 L540 372 L568 318 L604 372 L632 392 L632 420 L392 420 Z" fill="${accent}" opacity="0.85"/>
      <circle cx="512" cy="356" r="16" fill="#f3dfa0"/>`;
  }
  if (kind === 'scholar_crown' || kind === 'imperial_crown') {
    return `
      <path d="M384 400 C384 270 640 270 640 400 C590 362 434 362 384 400 Z" fill="#0f0c0a"/>
      <path d="M452 300 L572 300 L560 176 L464 176 Z" fill="#1d1711"/>
      <rect x="440" y="286" width="144" height="26" rx="6" fill="${accent}"/>
      <rect x="396" y="222" width="232" height="12" rx="6" fill="${accent}" opacity="0.85"/>`;
  }
  // crested helm (and anything unlisted): dome, brow band, cheek guards, horsehair crest
  return `
    <path d="M498 262 C452 176 520 120 506 70 C572 122 574 196 530 262 Z" fill="${accent}"/>
    <path d="M364 440 C352 232 672 232 660 440 L660 500 L622 520 L622 420 L402 420 L402 520 L364 500 Z" fill="#221a12"/>
    <path d="M366 404 C440 376 584 376 658 404 L658 432 C584 404 440 404 366 432 Z" fill="${accent}" opacity="0.85"/>
    <path d="M512 404 L528 470 L512 492 L496 470 Z" fill="${accent}" opacity="0.7"/>
    <circle cx="512" cy="262" r="20" fill="#f3dfa0" opacity="0.9"/>`;
}

function weapon(kind: string, variant: string, accent: string): string {
  const steel = '#aab3bd';
  const shaft = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3a2f24" stroke-width="18" stroke-linecap="round"/>`;
  if (kind === 'bow') {
    return `
      <path d="M800 150 C980 380 980 700 820 960" fill="none" stroke="#4a3b2b" stroke-width="20" stroke-linecap="round"/>
      <line x1="800" y1="150" x2="820" y2="960" stroke="#cfc6b4" stroke-width="3" opacity="0.7"/>
      <circle cx="800" cy="150" r="14" fill="${accent}"/><circle cx="820" cy="960" r="14" fill="${accent}"/>`;
  }
  if (kind === 'jian') {
    const curved = variant === 'curved_dao';
    return `
      <path d="${curved ? 'M846 720 C900 500 930 320 900 110 C990 300 960 540 884 730 Z' : 'M850 720 L900 110 L926 150 L888 730 Z'}" fill="${steel}" opacity="0.85"/>
      <rect x="816" y="716" width="110" height="22" rx="8" transform="rotate(8 870 727)" fill="${accent}"/>
      <rect x="852" y="736" width="30" height="120" rx="10" transform="rotate(8 867 796)" fill="#3a2f24"/>`;
  }
  if (kind === 'fan') {
    return `
      <path d="M780 700 C760 520 820 400 930 330 C960 470 930 610 830 720 Z" fill="#e8e2d2" opacity="0.8"/>
      <path d="M780 700 L930 330 M790 700 L870 372 M800 706 L950 460" stroke="#8d8676" stroke-width="4" fill="none"/>
      <rect x="760" y="696" width="28" height="130" rx="10" transform="rotate(-14 774 760)" fill="#3a2f24"/>`;
  }
  const pole = shaft(800, 1010, 880, 150);
  if (kind === 'guandao') {
    return `${pole}
      <path d="M872 240 C960 210 1000 110 968 40 C930 110 900 130 876 150 Z" fill="${steel}" opacity="0.9"/>
      <path d="M872 240 C900 250 930 240 944 214 C916 220 892 214 876 196 Z" fill="${steel}" opacity="0.6"/>
      <circle cx="866" cy="262" r="20" fill="${accent}"/>`;
  }
  if (kind === 'halberd') {
    return `${pole}
      <path d="M874 160 L886 40 L906 164 Z" fill="${steel}" opacity="0.9"/>
      <path d="M902 200 C964 190 990 140 984 96 C960 136 936 150 900 152 Z" fill="${steel}" opacity="0.85"/>
      <path d="M862 204 C806 198 786 150 794 108 C814 144 838 156 868 156 Z" fill="${steel}" opacity="0.6"/>
      <circle cx="872" cy="232" r="18" fill="${accent}"/>`;
  }
  if (kind === 'heavy') {
    if (variant === 'great_axe' || variant === 'twin_ji') {
      return `${pole}
        <path d="M880 250 C990 250 1010 130 950 70 C950 130 920 150 884 150 Z" fill="${steel}" opacity="0.9"/>
        <path d="M866 250 C790 240 770 160 800 100 C812 150 836 160 872 160 Z" fill="${steel}" opacity="0.65"/>
        <circle cx="870" cy="268" r="18" fill="${accent}"/>`;
    }
    return `
      <path d="M800 760 C860 520 930 300 900 60 C1010 260 990 560 850 780 Z" fill="${steel}" opacity="0.85"/>
      <rect x="770" y="756" width="120" height="24" rx="8" transform="rotate(14 830 768)" fill="${accent}"/>
      <rect x="790" y="778" width="34" height="150" rx="12" transform="rotate(14 807 853)" fill="#3a2f24"/>`;
  }
  // spear
  return `${pole}
    <path d="M868 190 L892 30 L908 194 Z" fill="${steel}" opacity="0.9"/>
    <path d="M846 250 C830 290 836 330 860 356 C884 330 898 292 888 252 Z" fill="${accent}"/>`;
}

function portraitSvg(hero: General): string {
  const kit = getHeroDuelProfile(hero);
  const realm = REALM[hero.faction];
  const accent = kit.tasselColor;
  const robe = kit.isScholarRobe;
  const nameChars = [...hero.name.zh];
  const stampH = 44 + nameChars.length * 66;
  const beard = kit.hasLongBeard
    ? `<path d="M424 520 C440 640 474 730 512 772 C550 730 584 640 600 520 C570 560 454 560 424 520 Z" fill="#8f887c" opacity="0.9"/>`
    : '';
  const shoulders = robe
    ? `<path d="M170 1024 C190 820 330 716 440 676 L512 760 L584 676 C694 716 834 820 854 1024 Z" fill="url(#fig)"/>
       <path d="M440 676 L512 760 L584 676" fill="none" stroke="${kit.armorTrim}" stroke-width="12" opacity="0.8"/>`
    : `<path d="M130 1024 C150 820 310 706 430 668 L594 668 C714 706 874 820 894 1024 Z" fill="url(#fig)"/>
       <ellipse cx="258" cy="800" rx="150" ry="92" transform="rotate(-24 258 800)" fill="#241c14"/>
       <ellipse cx="766" cy="800" rx="150" ry="92" transform="rotate(24 766 800)" fill="#241c14"/>
       <path d="M130 846 C190 760 290 716 384 716" fill="none" stroke="${kit.armorTrim}" stroke-width="9" opacity="0.7"/>
       <path d="M894 846 C834 760 734 716 640 716" fill="none" stroke="${kit.armorTrim}" stroke-width="9" opacity="0.7"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="78%">
      <stop offset="0" stop-color="#342a1f"/><stop offset="0.6" stop-color="#1c1611"/><stop offset="1" stop-color="#0d0a08"/>
    </radialGradient>
    <radialGradient id="wash" cx="50%" cy="40%" r="52%">
      <stop offset="0" stop-color="${realm}" stop-opacity="0.72"/>
      <stop offset="0.55" stop-color="${realm}" stop-opacity="0.26"/>
      <stop offset="1" stop-color="${realm}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2219"/><stop offset="1" stop-color="#0f0c09"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6e6b0"/><stop offset="1" stop-color="#c39a45"/>
    </linearGradient>
    <filter id="brush" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="${hero.id.length * 7 + hero.war}"/>
      <feDisplacementMap in="SourceGraphic" scale="26"/>
    </filter>
    <filter id="edge" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="11"/>
      <feDisplacementMap in="SourceGraphic" scale="9"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.7  0 0 0 0.09 0"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g filter="url(#brush)">
    <ellipse cx="512" cy="430" rx="470" ry="420" fill="url(#wash)"/>
    <path d="M60 300 C260 180 420 380 620 250 C780 150 930 260 990 200 L990 330 C860 400 720 300 560 400 C380 510 220 350 60 440 Z" fill="${realm}" opacity="0.16"/>
  </g>
  <g filter="url(#edge)" opacity="0.92">${weapon(kit.weaponClass, kit.weaponVariant, accent)}</g>
  <ellipse cx="512" cy="1000" rx="430" ry="120" fill="#000" opacity="0.5" filter="url(#soft)"/>
  <g filter="url(#edge)">
    ${shoulders}
    <rect x="452" y="560" width="120" height="130" fill="#17120d"/>
    <ellipse cx="512" cy="436" rx="124" ry="156" fill="#1b150f"/>
    <ellipse cx="512" cy="470" rx="96" ry="112" fill="#3a2e22" opacity="0.75"/>
    <path d="M512 430 L500 500 L524 500 Z" fill="#17120d" opacity="0.6"/>
    <path d="M444 438 L502 458 M580 438 L522 458" fill="none" stroke="#0f0c09" stroke-width="10" stroke-linecap="round"/>
    <path d="M404 430 C420 560 470 600 512 604 C554 600 604 560 620 430 C600 500 560 540 512 540 C464 540 424 500 404 430 Z" fill="#0f0c09" opacity="0.7"/>
    ${beard}
    ${headgear(kit.headgear, accent)}
  </g>
  <text x="512" y="984" text-anchor="middle" font-family="${CJK}" font-weight="900" font-size="330"
        fill="url(#gold)" stroke="#0d0a08" stroke-width="10" paint-order="stroke" opacity="0.96">${hero.seal}</text>
  <g transform="translate(64 64)">
    <rect width="104" height="${stampH}" rx="10" fill="#b5382a"/>
    <rect x="7" y="7" width="90" height="${stampH - 14}" rx="6" fill="none" stroke="#f2e6cf" stroke-width="3" opacity="0.8"/>
    ${nameChars
      .map(
        (ch, i) =>
          `<text x="52" y="${78 + i * 66}" text-anchor="middle" font-family="${CJK}" font-weight="900" font-size="60" fill="#f7efe0">${ch}</text>`
      )
      .join('')}
  </g>
  <rect width="1024" height="1024" filter="url(#grain)"/>
  <rect x="6" y="6" width="1012" height="1012" fill="none" stroke="#d4a853" stroke-width="3" opacity="0.35"/>
</svg>`;
}

await mkdir(outDir, { recursive: true });
let written = 0;
for (const hero of Object.values(createInitialHeroes())) {
  const file = path.join(outDir, `${hero.id}.jpg`);
  const exists = await access(file).then(
    () => true,
    () => false
  );
  if (exists && !redo.has(hero.id)) continue;
  await sharp(Buffer.from(portraitSvg(hero))).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  written += 1;
  console.log(`drew ${hero.id}.jpg (${hero.name.en})`);
}
console.log(written === 0 ? 'Every hero already has a portrait.' : `${written} stand-in portrait(s) written.`);
