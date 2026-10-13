/**
 * Captures et mesures de référence d'un niveau (bible graphique § 12).
 *
 *   npm run capture -- --label avant [--level 1] [--seed 20261011] [--url http://localhost:4173]
 *
 * Prérequis : serveur lancé (`npm run build && npm run preview`, ou `npm run dev`) et navigateur Playwright
 * installé (`npx playwright install chromium`). Sortie : docs/reference/niveau-<n>/<label>/ (images, metrics.json, README.md).
 *
 * ⚠️ Par défaut, Chromium tourne sans écran avec un rendu LOGICIEL : les compteurs (appels de dessin, triangles,
 * textures, temps de chargement) sont fiables, mais PAS la fluidité ni le temps GPU. Pour ceux-là, utiliser
 * --gpu (navigateur visible avec la carte graphique) et surtout les mesures sur appareils réels (?stats=1).
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : acc), []),
);
const level = Number(args.level ?? 1);
const seed = Number(args.seed ?? 20261011);
const url = args.url ?? 'http://localhost:4173';
const label = args.label ?? 'capture';
const gpu = args.gpu === 'true';
const outDir = join('docs', 'reference', `niveau-${level}`, label);
mkdirSync(outDir, { recursive: true });

const VIEWS = ['play', 'door', 'terrace', 'aerial'];
const PROFILES = [
  { name: 'desktop', viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const browser = await chromium.launch({
  headless: !gpu,
  args: gpu ? ['--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = { level, seed, url, date: new Date().toISOString(), renderer: gpu ? 'GPU' : 'logiciel (SwiftShader)', profiles: {} };

for (const profile of PROFILES) {
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  const errors = [];
  let bytes = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0);
    bytes += len || (await r.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(`${url}/?seed=${seed}&debloquer=${level}&stats=1&debug=1`);
  await page.waitForFunction(() => window.__debug && performance.getEntriesByName('pyrarush:menu-ready').length > 0, null, { timeout: 120000 });
  // Laisser les miniatures du menu se calculer (limité à 20 s).
  await page.waitForFunction(() => document.querySelectorAll('.level-card .thumb').length > 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const shots = {};
  const shoot = async (name) => {
    const file = `${profile.name}-${name}.jpg`;
    await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 85, timeout: 180000 }); // rendu logiciel : une image peut prendre plus de 30 s
    const stats = await page.evaluate(() => window.__debug.stats());
    shots[name] = { file, stats };
  };
  await shoot('menu');
  const menuBytes = bytes;

  await page.evaluate(([n, s]) => window.__debug.startLevel(n, s), [level, seed]);
  await page.waitForFunction(() => performance.getEntriesByName('pyrarush:level-ready').length > 0, null, { timeout: 120000 });
  await page.evaluate(() => window.__debug.freeze());
  for (const view of VIEWS) {
    await page.evaluate((v) => window.__debug.view(v), view);
    await page.waitForTimeout(1200);
    await shoot(view);
  }
  results.profiles[profile.name] = {
    timings: await page.evaluate(() => window.__debug.timings()),
    downloadedMb: { menu: +(menuBytes / 1048576).toFixed(2), total: +(bytes / 1048576).toFixed(2) },
    views: shots,
    errors,
  };
  await context.close();
}
await browser.close();

// Poids du build de production (si présent).
const dist = 'dist';
try {
  const groups = {};
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const ext = f.split('.').pop();
        groups[ext] = (groups[ext] ?? 0) + statSync(p).size;
      }
    }
  };
  walk(dist);
  results.build = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, +(v / 1024).toFixed(0)]));
} catch {
  results.build = null;
}

writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(results, null, 2));

// Rapport lisible.
const fmt = (n, d = 0) => (n === null || n === undefined ? 'n/d' : Number(n).toFixed(d));
const lines = [
  `# Référence niveau ${level} — ${label}`,
  '',
  `Date : ${results.date} · graine ${seed} · rendu ${results.renderer}`,
  '',
  '| Profil | Vue | Appels de dessin | Triangles | Géométries | Textures | Shaders | i/s* | GPU ms* |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const [name, p] of Object.entries(results.profiles)) {
  for (const [view, v] of Object.entries(p.views)) {
    const s = v.stats;
    lines.push(`| ${name} | ${view} | ${s.drawCalls} | ${fmt(s.triangles / 1000)} k | ${s.geometries} | ${s.textures} | ${s.programs} | ${fmt(s.fps)} | ${fmt(s.gpuAvg, 2)} |`);
  }
}
lines.push('', '\\* fluidité et temps GPU non significatifs en rendu logiciel : à mesurer sur appareils réels avec `?stats=1`.', '');
for (const [name, p] of Object.entries(results.profiles)) {
  lines.push(`**${name}** — chargement jusqu'à l'accueil : ${p.timings['pyrarush:menu-ready'] ?? 'n/d'} ms · lancement du niveau : ${p.timings['pyrarush:level-ready'] ?? 'n/d'} ms · téléchargé : ${p.downloadedMb.menu} Mo (accueil), ${p.downloadedMb.total} Mo (total) · erreurs : ${p.errors.length}`, '');
}
if (results.build) lines.push(`Build de production (Ko) : ${Object.entries(results.build).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '');
writeFileSync(join(outDir, 'README.md'), lines.join('\n'));
console.log(lines.join('\n'));
