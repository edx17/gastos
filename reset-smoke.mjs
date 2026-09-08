import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Sin sesión: tiene que explicar que el enlace venció, no mostrar un 404.
await page.goto('http://localhost:5173/reset-password', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
console.log('• sin sesión →', (await page.locator('h1').first().innerText()));

// Con sesión: el formulario para elegir la nueva.
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await page.goto('http://localhost:5173/reset-password', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
console.log('• con sesión →', (await page.locator('h1').first().innerText()));

await page.fill('#new-password', 'nuevaclave123');
await page.fill('#repeat-password', 'nuevaclave123');
await page.click('button:has-text("Guardar contraseña")');
await page.waitForTimeout(1500);
console.log('• tras guardar →', (await page.locator('h1').first().innerText()));
console.log('ERRORES:', errors.length ? errors : 'ninguno');
await browser.close();
