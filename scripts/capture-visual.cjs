const { chromium } = require('playwright-core');
const fs = require('fs');

const [phase = 'after', outputRoot = 'artifacts/visual'] = process.argv.slice(2);
const baseURL = process.env.PFC_CAPTURE_URL || 'http://127.0.0.1:4175';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const cases = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
  ['landscape', 844, 390],
];

async function waitForState(page, states, timeout = 20000) {
  await page.waitForFunction(
    (expected) => window.pfc && expected.includes(window.pfc.state),
    states,
    { timeout },
  );
}

(async () => {
  const output = `${outputRoot}/${phase}`;
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const report = { phase, browser: await browser.version(), cases: [] };

  for (const [name, width, height] of cases) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/?qualite=max`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#loader', { state: 'hidden' });
    await waitForState(page, ['title']);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/${name}-accueil.png` });

    await page.click('#play-btn');
    await page.waitForSelector('#screen-draft', { state: 'visible' });
    await page.locator('.draft-option').first().click();
    await page.evaluate(() => {
      window.__captureRender = window.pfc.engine.render.bind(window.pfc.engine);
      window.pfc.engine.render = () => {};
    });
    await page.click('#draft-go');
    await waitForState(page, ['choosing']);
    await page.evaluate(() => {
      window.pfc.engine.render = window.__captureRender;
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/${name}-match.png` });

    await page.evaluate(() => {
      window.pfc.engine.render = () => {};
    });
    for (let round = 0; round < 4; round++) {
      if ((await page.evaluate(() => window.pfc.state)) === 'ended') break;
      // Fixture de capture uniquement : jouer le contre garantit un résultat
      // rapide sans altérer l'aléatoire ou le code du jeu en production.
      const winningMove = await page.evaluate(
        () => ({ rock: 'paper', paper: 'scissors', scissors: 'rock' })[window.pfc.commitment.move],
      );
      await page.locator(`.card[data-move="${winningMove}"]`).click();
      await waitForState(page, ['choosing', 'ended'], 60000);
    }
    await waitForState(page, ['ended'], 60000);
    await page.waitForSelector('#screen-end', { state: 'visible', timeout: 60000 });
    await page.evaluate(() => {
      window.pfc.engine.render = window.__captureRender;
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/${name}-resultat.png` });

    const metrics = await page.evaluate(() => {
      const renderer = window.pfc.engine.renderer;
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        state: window.pfc.state,
      };
    });
    report.cases.push({ name, errors, ...metrics });
    await context.close();
  }

  fs.writeFileSync(`${output}/metrics.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
