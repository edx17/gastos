/**
 * Smoke end to end del recorrido principal:
 * login demo → registrar gasto hablando → subir ticket → reportes → preguntar.
 * Uso: node smoke.mjs <carpeta-de-capturas>
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const shots = process.argv[2] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const step = (msg) => console.log('•', msg);
const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });

// 1. Entrar con la cuenta de ejemplo.
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await page.waitForTimeout(2500);
step('dashboard: ' + (await page.locator('h1').first().innerText()));

// 2. Registrar un gasto en lenguaje natural.
const input = page.locator('input[aria-label="Registrar un movimiento en lenguaje natural"]');
await input.fill('ayer cargué nafta 35 mil en YPF');
await page.click('button[aria-label="Interpretar"]');
await page.waitForSelector('text=detectado', { timeout: 15000 });
const card = await page.locator('.card-surface').filter({ hasText: 'detectado' }).first().innerText();
step('borrador:\n' + card.split('\n').filter(Boolean).slice(0, 8).join(' | '));
await shot('03-draft');
await page.click('button:has-text("Guardar")');
await page.waitForTimeout(1500);
step('guardado, toast: ' + (await page.locator('[role="status"]').first().innerText().catch(() => 'sin toast')).replace(/\n/g, ' '));

// 3. Ticket con OCR demo.
await page.goto('http://localhost:5173/app/receipts', { waitUntil: 'networkidle' });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
// El proveedor mock necesita un archivo válido de más de 1 KB.
const padded = Buffer.concat([png, Buffer.alloc(4096, 7)]);
writeFileSync('/tmp/ticket.png', padded);
await page.setInputFiles('input[type="file"][accept="image/jpeg,image/png,image/webp"]', '/tmp/ticket.png');
await page.waitForSelector('text=Revisá el ticket', { timeout: 30000 });
const review = await page.locator('text=productos detectados').first().innerText();
step('ticket: ' + review);
await shot('04-receipt');
// El reparto por categorías sólo aplica cuando el ticket toca más de una.
const splitButton = page.locator('button:has-text("Distribuir por categoría")');
if (await splitButton.isEnabled()) {
  await splitButton.click();
  step('modo: distribuido por categoría');
} else {
  step('modo: gasto único (el ticket cae en una sola categoría)');
}
await page.click('button:has-text("Guardar $")');
await page.waitForTimeout(2500);
step('tickets guardados: ' + (await page.locator('text=Tickets guardados').count()));

// 4. Reportes.
await page.goto('http://localhost:5173/app/reports', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const reports = await page.locator('main').innerText();
step('reportes incluye análisis: ' + reports.includes('Análisis inteligente') + ', hormiga: ' + reports.includes('Gastos hormiga'));
await shot('05-reports');

// 5. Preguntar a las finanzas.
await page.goto('http://localhost:5173/app/ask', { waitUntil: 'networkidle' });
await page.click('text=¿Cuánto gasté en comida este mes?');
await page.waitForTimeout(1200);
step('respuesta: ' + (await page.locator('.card-surface').nth(1).innerText()).split('\n').slice(0, 3).join(' | '));
await shot('06-ask');

// 6. Presupuestos y metas cargan.
for (const [path, name] of [['budgets', 'Límites'], ['goals', 'Metas'], ['calendar', 'Calendario'], ['categories', 'Categorías'], ['transactions', 'Movimientos'], ['settings', 'Ajustes']]) {
  await page.goto(`http://localhost:5173/app/${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const h1 = await page.locator('h1').first().innerText();
  step(`${name} → ${h1}`);
}
await shot('07-settings');

// 7. Mobile.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:5173/app/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await shot('08-mobile');
step('bottom nav visible: ' + (await page.locator('nav').last().locator('a:has-text("Movimientos")').isVisible()));

console.log('ERRORES DE CONSOLA:', errors.length ? errors.slice(0, 8) : 'ninguno');
await browser.close();
