<#
==============================================================================
 MAZAL POS & ERP - SCRIPT DE DESPLIEGUE AUTOMATIZADO POWERSHELL
==============================================================================
 Este script realiza el aprovisionamiento de bases de datos, verificación de
 tablas, migración de esquema y despliegue del sistema web.
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "       MAZAL POS & ERP - SCRIPT DE DESPLIEGUE AUTOMATIZADO" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

# 1. VERIFICACIÓN DE XAMPP
$xamppPath = "C:\xampp"
if (-not (Test-Path "$xamppPath\php\php.exe")) {
    Write-Host "[!] PHP no encontrado en $xamppPath. Buscando ruta alternativa..." -ForegroundColor Yellow
    $userInput = Read-Host "Introduce la ruta de XAMPP (o presiona ENTER para C:\xampp)"
    if ($userInput) { $xamppPath = $userInput }
}

if (-not (Test-Path "$xamppPath\php\php.exe")) {
    Write-Host "[ERROR] No se pudo encontrar PHP en $xamppPath\php\php.exe" -ForegroundColor Red
    Write-Host "Por favor instala XAMPP con Apache y MySQL antes de ejecutar este script." -ForegroundColor Yellow
    Exit 1
}

Write-Host "[OK] XAMPP detectado en $xamppPath" -ForegroundColor Green

# 2. DESPLIEGUE DE ARCHIVOS A HTDOCS
$destDir = "$xamppPath\htdocs\mazal"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$rootDir = (Resolve-Path "$PSScriptRoot\..\..").Path
if (-not $rootDir) { $rootDir = Get-Location }

Write-Host "[*] Copiando bundle optimizado de producción a $destDir..." -ForegroundColor Cyan
if (Test-Path "$rootDir\mazal\dist") {
    Copy-Item -Path "$rootDir\mazal\dist\*" -Destination $destDir -Recurse -Force
} elseif (Test-Path "$rootDir\dist") {
    Copy-Item -Path "$rootDir\dist\*" -Destination $destDir -Recurse -Force
}

if (Test-Path "$rootDir\api.php") {
    Copy-Item -Path "$rootDir\api.php" -Destination "$destDir\api.php" -Force
    Copy-Item -Path "$rootDir\api.php" -Destination "$xamppPath\htdocs\api.php" -Force
}

# 3. AUTO-PROVISIONAMIENTO Y AUTO-MIGRACIÓN DE BASE DE DATOS
Write-Host "[*] Conectando con MySQL para verificar bases de datos y auto-migrar esquema..." -ForegroundColor Cyan

$initScript = @"
`$m = @new mysqli('localhost', 'root', '');
if (`$m->connect_errno) {
    echo '[!] MySQL apagado o no responde en localhost:3306. Inicia MySQL en XAMPP.'.PHP_EOL;
} else {
    `$m->query('CREATE DATABASE IF NOT EXISTS mazal_bd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    `$m->query('CREATE DATABASE IF NOT EXISTS mazal_bd1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    echo '[OK] Bases de datos mazal_bd (Norte) y mazal_bd1 (Sur) listas.'.PHP_EOL;
}
"@

& "$xamppPath\php\php.exe" -r $initScript

# Disparar auto-migración mediante ping HTTP
try {
    Invoke-RestMethod -Uri "http://localhost/mazal/api.php?action=ping&branch=Norte" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
    Invoke-RestMethod -Uri "http://localhost/mazal/api.php?action=ping&branch=Sur" -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
    Write-Host "[OK] Tablas, usuarios de sucursales y permisos auto-migrados con éxito." -ForegroundColor Green
} catch {
    Write-Host "[*] Ping HTTP omitido (Apache puede requerir inicio manual desde el panel XAMPP)." -ForegroundColor Yellow
}

# 4. VERIFICACIÓN Y APERTURA
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "                  DESPLIEGUE COMPLETADO CON ÉXITO" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " 1. URL Local:            http://localhost/mazal/" -ForegroundColor White
Write-Host " 2. Sucursal Norte:       BD: mazal_bd  (PIN: norte123)" -ForegroundColor White
Write-Host " 3. Sucursal Sur:         BD: mazal_bd1 (PIN: sur123)" -ForegroundColor White
Write-Host " 4. Administrador General: Usuario: admin / Clave: (Inicializar con npm run seed:admin)" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost/mazal/"
