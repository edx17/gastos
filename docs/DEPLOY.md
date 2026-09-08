# Poner Crocante en producción

Guía paso a paso desde una máquina con Windows, sin dar nada por sabido.
Si sólo querés ver la app funcionando, **con los pasos 1 y 2 alcanza**: sin Supabase
arranca en modo demo con datos de ejemplo.

---

## 1. Herramientas (una sola vez)

| Herramienta | Para qué | Cómo |
| --- | --- | --- |
| **Node.js 20+** | Correr y compilar la app | [nodejs.org](https://nodejs.org) → versión **LTS** |
| **Git** | Bajar y subir el código | [git-scm.com/download/win](https://git-scm.com/download/win) |
| **VS Code** | Editar | [code.visualstudio.com](https://code.visualstudio.com) |

Desde PowerShell, si tenés winget (viene con Windows 10/11):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Microsoft.VisualStudioCode
```

Cerrá y abrí PowerShell, y verificá:

```powershell
node -v    # v20.x o superior
npm -v
git --version
```

> Git no se instala "dentro" de VS Code: se instala en Windows y VS Code lo detecta
> solo. La pestaña **Source Control** (`Ctrl+Shift+G`) aparece funcionando sola.

## 2. Bajar el proyecto

```powershell
cd G:\Proyectos\Crocante
git clone -b claude/crocante-finance-webapp-mtk7yk https://github.com/edx17/gastos.git .
npm install
npm run dev
```

Abrí `http://localhost:5173` y entrá con **«Probar con datos de ejemplo»**.
Para editar: `code .`

---

## 3. Supabase (opcional, para datos reales)

Sin esto la app funciona, pero los datos viven en un solo navegador. Con Supabase
tenés cuentas reales, sincronización entre dispositivos y los tickets guardados.

### 3.1 Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta.
2. **New project**. Elegí una región cercana (São Paulo para Argentina) y guardá la
   contraseña de la base en un lugar seguro.
3. En **Project Settings → API** copiá:
   - **Project URL** → va en `VITE_SUPABASE_URL`
   - **anon public** → va en `VITE_SUPABASE_ANON_KEY`

> La clave `anon` es pública por diseño: lo que protege los datos es Row Level
> Security, que ya viene configurada y probada. La clave `service_role` **nunca**
> se usa en el front.

### 3.2 Aplicar las migraciones

**Opción A — con la CLI (recomendada):**

```powershell
npm install -g supabase
supabase login
supabase link --project-ref <el-ref-de-tu-proyecto>
supabase db push
```

El `project-ref` es la parte del medio de la URL: `https://<ref>.supabase.co`.

**Opción B — a mano, sin instalar nada:** generá un único archivo con todas las
migraciones y pegalo de una sola vez en **SQL Editor → New query**:

```powershell
node scripts/bundle-migrations.mjs > crocante-migraciones.sql
```

Se puede ejecutar más de una vez sin romper nada: las migraciones son idempotentes.

### 3.3 Conectar la app

Creá el archivo `.env` en la raíz del proyecto (copiando `.env.example`):

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_BASE_CURRENCY=ARS
```

Reiniciá `npm run dev`. El cartel de "modo demo" desaparece. Registrate con tu email:
el alta crea tu perfil, las categorías y los medios de pago automáticamente.

Para cargar datos de ejemplo en tu cuenta real, en **SQL Editor**:

```sql
select public.seed_demo_data(auth.uid());
```

### 3.4 Entrar con Google

El botón «Continuar con Google» ya está en el código y aparece solo en cuanto Supabase
está configurado, pero **no funciona hasta que crees las credenciales**: Google exige
que la aplicación esté registrada. Son cinco minutos.

**En [Google Cloud Console](https://console.cloud.google.com):**

1. Creá un proyecto (o usá uno existente).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo **Externo**, poné
   nombre de la app, tu mail de soporte y tu mail de contacto. Guardá.
   > Mientras esté en modo «Prueba» sólo entran los usuarios que agregues como
   > *test users*. Para que entre cualquiera hay que publicarla.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - **Orígenes de JavaScript autorizados**: `http://localhost:5173` y, cuando la
     tengas, `https://tu-app.vercel.app`
   - **URI de redireccionamiento autorizado**: el callback de tu proyecto Supabase,
     que tiene esta forma:
     `https://<tu-ref>.supabase.co/auth/v1/callback`
4. Copiá el **ID de cliente** y el **Secreto de cliente**.

**En Supabase → Authentication → Providers → Google:** activalo, pegá esos dos valores
y guardá.

**En Supabase → Authentication → URL Configuration** (esto es lo que más se olvida):

- **Site URL**: `https://tu-app.vercel.app` (o `http://localhost:5173` mientras probás)
- **Redirect URLs**: agregá `http://localhost:5173/**` y `https://tu-app.vercel.app/**`

Sin ese último paso, Google autentica bien pero Supabase te devuelve a `localhost` —o
directamente rechaza la vuelta— y parece que el login «no anda».

> El `enabled = false` de `supabase/config.toml` sólo afecta al entorno local que
> levanta `supabase start`. El proyecto alojado se configura desde el panel.

### 3.5 Recuperación de contraseña

Funciona sin configurar nada: Supabase manda el mail y la app tiene la pantalla
`/reset-password` donde la persona elige la nueva. Lo único necesario es que
`https://tu-app.vercel.app/**` esté en las **Redirect URLs** de arriba.

### 3.6 IA y OCR de verdad (opcional)

Sin esto, la app usa el parser propio (que anda bien) y un OCR simulado. Para tickets
reales necesitás un proveedor:

```powershell
supabase secrets set OPENAI_API_KEY=sk-... OCR_PROVIDER=ocrspace OCR_API_KEY=...
supabase functions deploy ai-complete
supabase functions deploy ocr-receipt
```

Y en `.env` (y después en Vercel):

```
VITE_AI_PROVIDER=openai
VITE_OCR_PROVIDER=ocrspace
VITE_USE_EDGE_FUNCTIONS=true
```

Las claves quedan en el servidor: nunca viajan al navegador. Cambiar de proveedor es
cambiar esas dos variables — el código no se toca.

---

## 4. Vercel (opcional, para publicarla)

Sólo si querés la app en internet, con una URL para abrir desde el celular.

1. Entrá a [vercel.com](https://vercel.com) y creá la cuenta **con GitHub**.
2. **Add New → Project** → elegí el repositorio `gastos`.
3. Vercel detecta Vite solo. Dejá lo que propone:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. Abrí **Environment Variables** y cargá las mismas de tu `.env`:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BASE_CURRENCY` y, si las usás,
   `VITE_AI_PROVIDER` y `VITE_OCR_PROVIDER`.
   **No cargues** `OPENAI_API_KEY` ni ninguna clave privada acá: esas van en Supabase.
5. **Deploy**.

El archivo `vercel.json` del repo ya resuelve el ruteo (sin él, recargar en
`/app/reportes` daría 404) y las cabeceras de seguridad.

### Después del deploy

En Supabase, **Authentication → URL Configuration**, agregá tu dominio de Vercel en
**Site URL** y en **Redirect URLs** (`https://tu-app.vercel.app/**`). Si no, los mails
de confirmación y el login con Google redirigen a `localhost`.

Desde ahí, cada `git push` a la rama publica una versión nueva sola.

---

## Resumen de qué necesitás según lo que quieras

| Quiero… | Node + Git | Supabase | Vercel | Claves de IA/OCR |
| --- | :---: | :---: | :---: | :---: |
| Probarla en mi máquina | ✅ | — | — | — |
| Usarla en serio, con mis datos | ✅ | ✅ | — | — |
| Abrirla desde el celular | ✅ | ✅ | ✅ | — |
| Leer tickets reales con foto | ✅ | ✅ | ✅ | ✅ |
