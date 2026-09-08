<#
.SYNOPSIS
  Carga en Vercel las variables VITE_* que tengas en tu .env local.

.DESCRIPTION
  Vercel no lee el archivo .env: hay que declarar las variables en el proyecto.
  Este script las lee de tu .env y las manda una por una, así no hay que
  copiarlas a mano ni tildar casillas de a una.

  Sólo sube las que empiezan con VITE_ (las que van al navegador). Cualquier
  otra cosa que tengas en el .env se ignora a propósito.

.EXAMPLE
  npm i -g vercel
  vercel login
  vercel link
  .\scripts\vercel-env.ps1
  vercel --prod
#>

param(
  # production | preview | development
  [string]$Entorno = 'production',
  [string]$Archivo = '.env'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Archivo)) {
  Write-Error "No encontré $Archivo. Guardalo en la raíz del proyecto y volvé a intentar."
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Error "Falta la CLI de Vercel. Instalala con:  npm i -g vercel"
}

$subidas = 0

Get-Content $Archivo | ForEach-Object {
  $linea = $_.Trim()

  # Saltear comentarios y líneas vacías.
  if ($linea -eq '' -or $linea.StartsWith('#')) { return }
  if (-not $linea.Contains('=')) { return }

  $nombre = $linea.Substring(0, $linea.IndexOf('=')).Trim()
  $valor  = $linea.Substring($linea.IndexOf('=') + 1).Trim()

  # Sólo las del navegador: las secretas viven en Supabase, no acá.
  if (-not $nombre.StartsWith('VITE_')) { return }
  if ($valor -eq '') {
    Write-Host "  (vacía, se saltea) $nombre" -ForegroundColor DarkGray
    return
  }

  # Si ya existe hay que quitarla antes: Vercel no la pisa sola.
  vercel env rm $nombre $Entorno --yes 2>$null | Out-Null

  $valor | vercel env add $nombre $Entorno | Out-Null
  Write-Host "  cargada  $nombre" -ForegroundColor Green
  $script:subidas++
}

Write-Host ""
Write-Host "$subidas variables cargadas en el entorno '$Entorno'." -ForegroundColor Cyan
Write-Host "Ahora falta volver a compilar, si no el deploy viejo sigue sin ellas:" -ForegroundColor Yellow
Write-Host "  vercel --prod" -ForegroundColor Yellow
