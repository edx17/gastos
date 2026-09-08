import { chromium } from 'playwright';
const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const step = (m) => console.log('•', m);

// Las páginas legales se leen sin cuenta.
for (const [path, expected] of [
  ['terminos', 'Términos y condiciones'],
  ['privacidad', 'Política de privacidad'],
  ['arrepentimiento', 'Botón de arrepentimiento'],
]) {
  await page.goto(`http://localhost:5173/${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const h1 = await page.locator('h1').first().innerText();
  step(`/${path} → ${h1}${h1 === expected ? ' ✔' : ' ✘'}`);
}
await page.screenshot({ path: `${shots}/legal-terminos.png` });

// El aviso de datos faltantes tiene que verse.
await page.goto('http://localhost:5173/terminos', { waitUntil: 'networkidle' });
step('avisa que faltan datos del responsable: ' + (await page.locator('text=Faltan completar los datos').isVisible()));

// La portada tiene que enlazar el botón de arrepentimiento (Res. 424/2020).
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
step('portada enlaza arrepentimiento: ' + (await page.locator('footer a:has-text("Botón de arrepentimiento")').isVisible()));

// El registro exige aceptar los términos.
await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });
await page.fill('#name', 'Prueba');
await page.fill('#email', 'prueba@crocante.test');
await page.fill('#password', 'clavelarga123');
const disabled = await page.locator('button:has-text("Crear cuenta")').isDisabled();
step('crear cuenta bloqueado sin aceptar: ' + disabled);
await page.click('input[type="checkbox"]');
step('habilitado al aceptar: ' + !(await page.locator('button:has-text("Crear cuenta")').isDisabled()));

console.log('ERRORES:', errors.length ? errors.slice(0, 5) : 'ninguno');
await browser.close();
