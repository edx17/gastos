/** Recorrido del modo hogar: crear, agregar persona, cargar gasto compartido, ver balance. */
import { chromium } from 'playwright';
const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const step = (m) => console.log('•', m);

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await page.waitForTimeout(2000);

await page.goto('http://localhost:5173/app/household', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('button:has-text("Crear hogar")');
await page.fill('#household-name', 'Casa');
await page.locator('[role="dialog"] button:has-text("Crear")').click();
await page.waitForTimeout(1200);
step('hogar creado: ' + (await page.locator('h1').first().innerText()));

await page.click('button:has-text("Agregar persona")');
await page.fill('#member-name', 'Sofi');
await page.locator('[role="dialog"] button:has-text("Agregar")').click();
await page.waitForTimeout(1200);
step('integrantes: ' + (await page.locator('text=Integrantes').first().isVisible()));

// Gasto compartido pagado por Sofi.
await page.goto('http://localhost:5173/app/transactions', { waitUntil: 'networkidle' });
await page.click('button:has-text("Nuevo")');
await page.fill('#tx-amount', '120000');
await page.fill('#tx-description', 'Supermercado del mes');
await page.locator('[role="dialog"] button[role="switch"]').click();
await page.waitForTimeout(400);
await page.selectOption('#tx-paid-by', { label: 'Sofi' });
await page.locator('[role="dialog"] button:has-text("Guardar")').click();
await page.waitForTimeout(1500);
step('gasto compartido guardado');

await page.goto('http://localhost:5173/app/household', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const text = await page.locator('main').innerText();
step('balance:\n' + text.split('\n').filter((l) => /puso|debe|mano|→/.test(l)).slice(0, 6).join(' | '));
await page.screenshot({ path: `${shots}/clay-household.png` });
console.log('ERRORES:', errors.length ? errors.slice(0, 5) : 'ninguno');
await browser.close();
