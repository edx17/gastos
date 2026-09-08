<#
.SYNOPSIS
  Carga en Vercel las variables VITE_* que tengas en tu .env local.

.DESCRIPTION
  Vercel no lee el archivo .env: hay que declarar las variables en el proyecto.
  Este script las lee de tu .env y las manda una por una, así no hay que
  copiarlas a mano ni tildar casillas de a una.

  Sólo sube las que empiezan con VITE_ (las que van al navegador). Cualquier
  otra cosa que tengas en el .env se ignora a propósito: las claves secretas
  viven en Supabase, no acá.

.EXAMPLE
  npm i -g vercel
  vercel login
  vercel link            # sin argumentos: enlaza esta carpeta
  .\scripts\vercel-env.ps1
  vercel --prod
#>

param(
  # production | preview | development
  [string]$Entorno = 'production',
  [string]$Archivo = '.env'
)

# Los comandos de Vercel devuelven códigos de salida que se manejan a mano más
# abajo; sin esto, PowerShell 7 corta el script en el primer `env rm` de una
# variable que todavía no existe.
$ErrorActionPreference = 'Continue'
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

if (-not (Test-Path $Archivo)) {
  Write-Host "No encontré $Archivo en esta carpeta." -ForegroundColor Red
  Write-Host "Guardalo en la raíz del proyecto (al lado de package.json) y probá de nuevo."
  exit 1
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host "Falta la CLI de Vercel. Instalala con:  npm i -g vercel" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path '.vercel/project.json')) {
  Write-Host "Esta carpeta todavía no está enlazada a un proyecto de Vercel." -ForegroundColor Red
  Write-Host "Corré primero:  vercel link    (sin argumentos, te va a preguntar cuál)"
  exit 1
}

$subidas = 0
$fallidas = 0

foreach ($linea in Get-Content $Archivo) {
  $texto = $linea.Trim()

  # Saltear comentarios y líneas vacías.
  if ($texto -eq '' -or $texto.StartsWith('#') -or -not $texto.Contains('=')) { continue }

  $corte = $texto.IndexOf('=')
  $nombre = $texto.Substring(0, $corte).Trim()
  $valor = $texto.Substring($corte + 1).Trim()

  # Sólo las del navegador.
  if (-not $nombre.StartsWith('VITE_')) { continue }
  if ($valor -eq '') {
    Write-Host "  (vacía, se saltea) $nombre" -ForegroundColor DarkGray
    continue
  }

  # Si ya existe hay que quitarla antes: Vercel no la pisa sola. Que no exista
  # es lo normal la primera vez, así que el error de acá se ignora.
  vercel env rm $nombre $Entorno --yes 2>&1 | Out-Null

  $valor | vercel env add $nombre $Entorno 2>&1 | Out-Null

  if ($LASTEXITCODE -eq 0) {
    Write-Host "  cargada   $nombre" -ForegroundColor Green
    $subidas++
  } else {
    Write-Host "  FALLÓ     $nombre" -ForegroundColor Red
    $fallidas++
  }
}

Write-Host ""
if ($fallidas -gt 0) {
  Write-Host "$subidas cargadas, $fallidas con error." -ForegroundColor Yellow
  Write-Host "Probá cargando las que fallaron desde el panel de Vercel."
} else {
  Write-Host "$subidas variables cargadas en el entorno '$Entorno'." -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Falta volver a compilar, si no el deploy anterior sigue sin ellas:" -ForegroundColor Yellow
Write-Host "  vercel --prod" -ForegroundColor Yellow
