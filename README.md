# Crocante

**Contale a la app qué hiciste con tu plata. Del orden se encarga ella.**

Crocante es una webapp de finanzas personales pensada para el uso argentino: escribís
«ayer cargué nafta 35 mil», sacás una foto del ticket del super, y del otro lado
aparecen movimientos categorizados, reportes, límites de gasto y metas de ahorro.

El nombre vive en un único archivo (`src/config/brand.ts`): cambiarlo ahí lo cambia
en toda la aplicación.

---

## Qué hace

| Área | Estado |
| --- | --- |
| Registro por lenguaje natural (lucas, k, palo, fechas relativas, monedas) | ✅ funcionando, sin depender de ninguna IA externa |
| Categorización híbrida (reglas propias → historial → clasificador → IA) | ✅ |
| Aprendizaje de correcciones (`Siempre` / `Preguntar` / `Solo este gasto`) | ✅ |
| Tickets: foto → OCR → productos → categorías → movimiento | ✅ (con proveedor demo si no configurás OCR) |
| Dashboard con comparativas contra el período anterior | ✅ |
| Reportes: categorías, evolución, flujo de caja, top comercios, gastos hormiga | ✅ |
| Análisis automático de hábitos y detección de gastos recurrentes | ✅ |
| Preguntas en castellano sobre los propios datos | ✅ |
| Límites de gasto con alertas al 80/90/100% | ✅ |
| Metas de ahorro con proyección | ✅ |
| Multimoneda ARS / USD / EUR (guarda importe original y conversión) | ✅ |
| Importación CSV con mapeo de columnas y detección de duplicados | ✅ |
| Calendario financiero y buscador global | ✅ |
| Interfaz claymorphism, con modo claro y oscuro | ✅ |
| Auth completa: registro, login, recuperación de contraseña y Google | ✅ (Google requiere credenciales, ver deploy) |
| Modo pareja / hogar: gastos compartidos, quién pagó y balance | ✅ |
| Planes y suscripciones con límites aplicados en la base | ✅ (el cobro requiere credenciales de Mercado Pago) |
| Marco legal: términos, privacidad, arrepentimiento, baja y borrado de cuenta | ✅ (falta completar `src/config/legal.ts`) |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # opcional: sin Supabase arranca en modo demo
npm run dev               # http://localhost:5173
```

¿Primera vez, en Windows, desde cero? Seguí **[docs/DEPLOY.md](docs/DEPLOY.md)**.

En la pantalla de login hay un botón **«Probar con datos de ejemplo»** que crea una
cuenta local con ~200 movimientos, presupuestos y metas para ver todo funcionando.

### Modo demo vs. Supabase

La app habla con una única interfaz (`DataClient`) que tiene dos implementaciones:

- **Modo demo** (sin `VITE_SUPABASE_URL`): todo se guarda en el navegador. Sirve para
  probar el producto completo sin infraestructura. La interfaz lo avisa con un cartel.
- **Supabase**: PostgreSQL + Auth + Storage + Row Level Security.

Ningún componente visual habla con la base de datos: la cadena es
**UI → hooks → services → DataClient → Supabase/PostgreSQL**.

---

## Variables de entorno

Están todas documentadas en [`.env.example`](.env.example). Las importantes:

| Variable | Para qué |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Backend real. Si faltan, modo demo. También se aceptan `SUPABASE_URL` / `SUPABASE_ANON_KEY`, como los deja la integración de Supabase con Vercel. |
| `VITE_BASE_CURRENCY` | Moneda principal por defecto (`ARS`). |
| `VITE_AI_PROVIDER` | `mock` \| `openai` \| `anthropic` \| `gemini`. |
| `VITE_OCR_PROVIDER` | `mock` \| `ocrspace` \| `google_vision` \| `azure_vision` \| `openai_vision` \| `gemini_vision`. |
| `VITE_USE_EDGE_FUNCTIONS` | Si es `true`, IA y OCR pasan por Edge Functions y las claves nunca llegan al navegador. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OCR_API_KEY` | Sólo del lado del servidor (`supabase secrets set`). |

> Las variables `VITE_*_API_KEY` existen únicamente como atajo de desarrollo local.
> En producción usá las Edge Functions: una clave en el bundle es una clave pública.

---

## Supabase

### 1. Migraciones

```bash
supabase link --project-ref <tu-proyecto>
supabase db push          # aplica supabase/migrations/*.sql en orden
```

| Migración | Contenido |
| --- | --- |
| `…_initial_schema.sql` | Tablas, enums, índices y triggers de `updated_at`. |
| `…_category_taxonomy.sql` | Taxonomía por defecto (**generada** desde `src/constants/categories.ts`). |
| `…_rls.sql` | Row Level Security en todas las tablas + helpers de hogar. |
| `…_functions.sql` | Alta de cuenta, reportes agregados en SQL, alertas de presupuesto. |
| `…_storage.sql` | Bucket privado `receipts` y sus policies. |
| `…_demo_seed.sql` | `seed_demo_data()` para poblar una cuenta de prueba. |
| `…_household_members.sql` | Modo hogar: miembros sin cuenta propia y `household_balance()`. |

Si tocás la taxonomía de categorías, regenerá el SQL en vez de editarlo a mano:

```bash
node scripts/generate-category-seed.mjs > supabase/migrations/20260907000002_category_taxonomy.sql
```

### 2. Datos de ejemplo

```sql
select public.seed_demo_data(auth.uid());   -- ~200 movimientos de los últimos 6 meses
```

### 3. Verificar el SQL

Las migraciones se pueden validar contra cualquier PostgreSQL 15+ sin levantar el
stack completo: `supabase/tests/harness.sql` reemplaza lo mínimo de la plataforma
(`auth.uid()`, `auth.users`, `storage`) y `supabase/tests/checks.sql` comprueba el
alta de cuenta, el seed, los reportes y —sobre todo— **que una cuenta no pueda ver ni
modificar los datos de otra**.

```bash
createdb crocante_test
scripts/verify-sql.sh "postgres://localhost/crocante_test"
```

### 4. Edge Functions

```bash
supabase secrets set --env-file .env
supabase functions deploy ai-complete
supabase functions deploy ocr-receipt
```

- `ai-complete`: proxy de OpenAI / Anthropic / Gemini. Exige sesión iniciada,
  limita a 40 pedidos por minuto y por persona, y recorta el texto de entrada.
- `ocr-receipt`: proxy de OCR/Vision. Exige sesión, limita a 20 imágenes por minuto
  y rechaza imágenes de más de 8 MB.

### 5. Storage

El bucket `receipts` es privado. Cada archivo se guarda en `<user_id>/<archivo>` y las
policies sólo dejan leer, subir y borrar dentro de la carpeta propia. Las imágenes se
sirven con URLs firmadas de 30 minutos.

---

## Configurar la IA

La capa de IA está desacoplada del proveedor (`src/services/ai/`):

```
AiProvider (interfaz)
├── MockAiProvider      → reglas locales, sin red (modo demo)
├── OpenAiProvider
├── AnthropicProvider
└── GeminiProvider
```

Cambiar de proveedor es cambiar `VITE_AI_PROVIDER`. Cada persona puede además
elegir el suyo, o desactivar la IA por completo, desde **Ajustes → Inteligencia
artificial**; en ese caso todo se interpreta localmente.

**El parser determinista corre siempre y primero.** El modelo se consulta sólo cuando
las reglas no alcanzan. Si el proveedor falla, la interpretación local sigue
funcionando y la interfaz lo avisa en vez de romperse.

Cada consulta a un modelo queda registrada en `ai_interactions` (entrada, respuesta,
proveedor, modelo, latencia, confianza y error) para poder auditar equivocaciones.

## Configurar el OCR

Misma idea en `src/services/ocr/`: una interfaz `OcrProvider` y una implementación por
proveedor. `mock` devuelve tickets argentinos de ejemplo —claramente marcados como
demo— para poder desarrollar el flujo completo sin contratar nada.

El parseo del ticket (comercio, CUIT, fecha, productos, descuentos, impuestos, total)
es propio y está en `src/services/receipts/parser.ts`: el proveedor sólo transcribe.

---

## Arquitectura

```
src/
├── config/          marca y variables de entorno
├── types/           tipos centralizados (transaction, category, receipt, budget, …)
├── lib/             utilidades puras: dinero, fechas, archivos
├── constants/       taxonomía de categorías con palabras clave
├── services/
│   ├── nlp/         parser de lenguaje natural (números, fechas, comercios)
│   ├── categorization/  motor híbrido reglas + historial + clasificador
│   ├── ai/          proveedores de IA intercambiables
│   ├── ocr/         proveedores de OCR intercambiables
│   ├── receipts/    parseo de tickets
│   ├── analytics/   agregaciones, insights, recurrentes, consultas
│   ├── reports/     import y export CSV
│   ├── seed/        dataset de demostración
│   └── data/        DataClient: implementación local y Supabase
├── providers/       contextos de React (auth, workspace, tema, avisos)
├── hooks/           useQuickEntry, useReceiptPipeline, useAsync
├── components/      ui/ (primitivas), finance/ (dominio), layout/
└── pages/           una carpeta por sección de la app
```

Rutas: `/`, `/login`, `/register`, `/forgot-password`, y bajo `/app`:
`dashboard`, `transactions`, `reports`, `categories`, `budgets`, `goals`,
`receipts`, `calendar`, `ask`, `household`, `plans`, `settings`.

---

## Scripts

```bash
npm run dev        # servidor de desarrollo
npm run build      # typecheck + build de producción
npm run preview    # sirve el build
npm run lint       # tsc --noEmit
npm test           # vitest
npm run test:watch
node smoke.mjs ./capturas   # recorrido end-to-end real con Playwright
```

## Tests

`npm test` cubre lo que puede romperse en silencio:

- **Parser de lenguaje natural** (46 casos): `pizza 3200`, `pizza 3,2k`, `pizza tres
  lucas`, `ayer cargué nafta 35 mil`, `cobré 1 palo`, `100 usd cena`, fechas relativas,
  detección de intención y de datos faltantes.
- **Parser de tickets**: comercio, CUIT, número, fecha, productos con cantidad decimal,
  descuentos, totales en conflicto y monedas.
- **Motor de categorización**: reglas propias, historial del usuario, palabras clave,
  el caso «Mercado Libre» del pedido y el fallback honesto.
- **Dinero**: formato argentino, conversión entre monedas, parseo de importes.
- **Analíticas**: resúmenes, comparativas, series, gastos hormiga y recurrentes.
- **Importación CSV**: separadores, comillas, duplicados y filas inválidas.
- **Modo hogar**: reparto por partes desiguales, gastos sin atribuir y las
  transferencias mínimas para quedar a mano.
- **Planes**: vencimiento de suscripciones, cupos agotados, funciones no incluidas y
  qué plan sugerir en cada caso.
- **Dataset de demostración**: coherencia y determinismo.

El SQL se verifica aparte con `scripts/verify-sql.sh` (incluye pruebas de RLS).

---

## Privacidad y seguridad

- **RLS activo y forzado** en todas las tablas, con pruebas automáticas de aislamiento.
  Nunca se desactiva "para que funcione".
- Tickets en un bucket privado, accesibles sólo por su dueño y con URL firmada.
- Nunca se guarda un número de tarjeta completo: sólo un alias y los últimos 4 dígitos.
- A la IA se le manda el texto del movimiento y los nombres de las categorías, no el
  historial financiero completo. Se puede apagar por completo desde Ajustes.
- Los logs no incluyen importes ni descripciones.
- Validación de MIME y tamaño antes de tocar el almacenamiento o una API de visión.
- Rate limiting por usuario en las Edge Functions.

## Deploy

El front es estático (Vite): `npm run build` genera `dist/`. El repo trae
`vercel.json` con el *rewrite* de rutas a `index.html` (la app usa History API) y las
cabeceras de seguridad, así que en Vercel funciona sin configurar nada más. En Netlify
o Cloudflare Pages hay que configurar ese mismo rewrite a mano.

**[docs/DEPLOY.md](docs/DEPLOY.md)** tiene la guía completa paso a paso: instalar las
herramientas en Windows, crear el proyecto de Supabase, aplicar las migraciones,
configurar IA y OCR, y publicar en Vercel.

---

## Identidad visual

La interfaz usa **claymorphism**: superficies blandas con doble sombra —una cálida
hacia afuera, una luz hacia adentro— sobre un fondo levemente teñido. Los campos de
texto están hundidos, los botones sobresalen y se hunden al presionarlos. Todo sale de
tres variables en `src/index.css` (`--clay-shadow`, `--clay-light`, `--clay-depth`) más
`--radius`: tocando eso cambia el carácter de toda la app, y hay un juego de valores
para el modo oscuro.

## Decisiones que vale la pena conocer

- **Las reglas primero, la IA después.** Interpretar «super 45 lucas» no necesita un
  modelo: necesita conocer cómo habla la gente acá. La IA entra cuando hay ambigüedad.
- **Nada se guarda a espaldas del usuario.** Si falta el importe o no se entiende el
  gasto, la app pregunta en vez de inventar.
- **Los límites de plan viven en la base, no en la interfaz.** Los candados que se
  ven son cortesía; quien intente saltearlos por la API se choca con un trigger.
- **Los números salen de la base.** Los reportes se agregan en SQL; el navegador no
  descarga miles de filas para sumar.
- **Subir no siempre es bueno.** Las comparativas saben que +15% de ingresos es una
  cosa y +15% de gastos es otra.
- **Observaciones, no consejos.** El análisis describe lo que muestran los datos y
  siempre exhibe las cifras que usó; no da recomendaciones financieras.
