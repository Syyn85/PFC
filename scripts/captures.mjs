// Captures reproductibles de l'accueil, du match et du résultat (DPR 1, mouvement réduit).
// Usage : npm run dev -- --port 5180 (autre terminal), puis
//   node scripts/captures.mjs <dossier> [url]
// L'état "victoire" est obtenu en lisant le coup engagé par l'IA via window.pfc
// (exposé seulement en développement) : c'est une fixture de test, le jeu n'est pas modifié.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'captures';
const url = process.argv[3] ?? 'http://localhost:5180/?qualite=max';
const VIEWPORTS = [
  ['bureau', 1440, 900],
  ['mobile', 390, 844],
  ['paysage', 844, 390],
];
const BEATS = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = [];

const waitState = (page, states, timeout = 90000) =>
  page.waitForFunction((s) => s.includes(window.pfc?.state), states, { timeout, polling: 100 });

async function stats(page) {
  return page.evaluate(() => {
    const r = window.pfc.engine.renderer;
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      calls: r.info.render.calls,
      triangles: r.info.render.triangles,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'inconnu',
      dpr: r.getPixelRatio(),
    };
  });
}

for (const [name, width, height] of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    hasTouch: name !== 'bureau',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await waitState(page, ['title']);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, `${name}-accueil.png`) });
  const home = await stats(page);

  await page.click('#play-btn');
  await waitState(page, ['drafting']);
  if (await page.isDisabled('#draft-go')) await page.click('.draft-option');
  await page.click('#draft-go');
  await waitState(page, ['choosing']);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `${name}-match.png`) });
  const match = await stats(page);

  // Gagne chaque manche (fixture de test), jusqu'à l'écran de fin
  while ((await page.evaluate(() => window.pfc.state)) !== 'ended') {
    await waitState(page, ['choosing', 'ended']);
    const st = await page.evaluate(() => window.pfc.state);
    if (st === 'ended') break;
    const botMove = await page.evaluate(() => window.pfc.commitment.move);
    await page.click(`.card[data-move="${BEATS[botMove]}"]`);
    await waitState(page, ['choosing', 'ended']);
  }
  await page.waitForSelector('#screen-end:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, `${name}-resultat.png`) });
  report.push({ viewport: `${width}x${height}`, home, match, errors });
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(out, 'rapport.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
