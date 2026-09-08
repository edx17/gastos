/** Verifica que los candados de plan aparezcan y desaparezcan como corresponde. */
import { chromium } from 'playwright';
const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const step = (m) => console.log('•', m);

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await page.waitForTimeout(2000);

// Plan por defecto en demo: hogar (todo desbloqueado).
await page.goto('http://localhost:5173/app/plans', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
step('plan inicial: ' + (await page.locator('header p').first().innerText()));
await page.screenshot({ path: `${shots}/planes.png` });

// Bajar a gratis y comprobar los candados.
await page.locator('.card-surface', { hasText: 'Gratis' }).getByRole('button').click();
await page.waitForTimeout(1500);
step('tras cambiar: ' + (await page.locator('header p').first().innerText()));

for (const [path, expect] of [['receipts', 'plan'], ['household', 'plan']]) {
  await page.goto(`http://localhost:5173/app/${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const text = await page.locator('main').innerText();
  const locked = /no est[áa]n? en tu plan/.test(text);
  step(`${path}: ${locked ? 'BLOQUEADO ✔' : 'sin candado ✘'} (${expect})`);
}
await page.screenshot({ path: `${shots}/candado-tickets.png` });

await page.goto('http://localhost:5173/app/reports', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const reports = await page.locator('main').innerText();
step('reportes: análisis bloqueado = ' + reports.includes('análisis de hábitos no está en tu plan'));

await page.goto('http://localhost:5173/app/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
step('ajustes muestra uso: ' + (await page.locator('text=Movimientos del mes').first().isVisible()));

// Volver a hogar y comprobar que se destraba.
await page.goto('http://localhost:5173/app/plans', { waitUntil: 'networkidle' });
await page.locator('.card-surface', { hasText: 'Hogar' }).getByRole('button').first().click();
await page.waitForTimeout(1500);
await page.goto('http://localhost:5173/app/household', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const finalText = await page.locator('main').innerText();
step('hogar tras volver a pago: ' + (/no est[áa]n? en tu plan/.test(finalText) ? 'sigue bloqueado ✘' : 'desbloqueado ✔'));

console.log('ERRORES:', errors.length ? errors.slice(0, 5) : 'ninguno');
await browser.close();
