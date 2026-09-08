import { chromium } from 'playwright';
const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.click('text=Probar con datos de ejemplo');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/clay-dashboard.png` });

// Modo oscuro
await page.click('button[aria-label="Cambiar tema"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${shots}/clay-dark.png` });
await page.click('button[aria-label="Cambiar tema"]');
await page.waitForTimeout(600);

await page.goto('http://localhost:5173/app/budgets', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/clay-budgets.png` });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:5173/app/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${shots}/clay-mobile.png` });
await browser.close();
