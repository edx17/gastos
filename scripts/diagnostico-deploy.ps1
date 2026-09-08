<#
.SYNOPSIS
  Dice si el sitio publicado quedó compilado con las variables de Supabase.

.DESCRIPTION
  Baja el JavaScript que está sirviendo el sitio y busca adentro la URL del
  proyecto de Supabase. Como Vite incrusta las variables al compilar, si la URL
  está, el build las tenía; si no está, ese deploy se hizo sin ellas.

  Responde la pregunta sin adivinar: evita confundir "faltan las variables" con
  "el navegador me está mostrando una versión vieja".

.EXAMPLE
  .\scripts\diagnostico-deploy.ps1 -Sitio https://crocante-ten.vercel.app
#>

param(
  [Parameter(Mandatory = $true)][string]$Sitio,
  [string]$RefSupabase = 'tyngkrdwfpbvmdrgzvbf'
)

$ErrorActionPreference = 'Continue'
$Sitio = $Sitio.TrimEnd('/')

Write-Host "Revisando $Sitio ..." -ForegroundColor Cyan
Write-Host ""

try {
  $html = (Invoke-WebRequest -Uri $Sitio -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }).Content
} catch {
  Write-Host "No pude abrir el sitio: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$ruta = [regex]::Match($html, '/assets/index-[A-Za-z0-9_\-]+\.js').Value
if (-not $ruta) {
  Write-Host "No encontré el bundle principal en el HTML." -ForegroundColor Red
  Write-Host "Puede que el dominio no esté sirviendo esta aplicación."
  exit 1
}

Write-Host "Bundle servido: $ruta" -ForegroundColor DarkGray

try {
  $codigo = (Invoke-WebRequest -Uri "$Sitio$ruta" -UseBasicParsing).Content
} catch {
  Write-Host "No pude bajar el bundle: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host ""
if ($codigo -match [regex]::Escape("$RefSupabase.supabase.co")) {
  Write-Host "RESULTADO: el sitio SÍ está compilado con Supabase." -ForegroundColor Green
  Write-Host ""
  Write-Host "Si aun así ves el cartel de modo demo, es tu navegador mostrando una" -ForegroundColor Yellow
  Write-Host "version vieja. Abrilo en una ventana privada o hace Ctrl+F5."
} else {
  Write-Host "RESULTADO: el sitio NO tiene las variables." -ForegroundColor Red
  Write-Host ""
  Write-Host "Ese deploy se compiló sin VITE_SUPABASE_URL. Revisá, en este orden:"
  Write-Host ""
  Write-Host "  1. vercel env ls" -ForegroundColor White
  Write-Host "     ¿Aparecen VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, con el"
  Write-Host "     nombre exacto y en el entorno Production?"
  Write-Host ""
  Write-Host "  2. vercel project ls" -ForegroundColor White
  Write-Host "     ¿Hay mas de un proyecto parecido? Si al enlazar creaste uno"
  Write-Host "     nuevo, el dominio sigue apuntando al viejo y estas cargando"
  Write-Host "     las variables en el proyecto equivocado."
  Write-Host ""
  Write-Host "  3. En el panel: Deployments -> el mas reciente -> Redeploy." -ForegroundColor White
  Write-Host "     Agregar variables no recompila lo ya desplegado."
  Write-Host ""
  Write-Host "  4. Settings -> Git: ¿la rama de produccion es la misma a la que"
  Write-Host "     estas pusheando?"
}
