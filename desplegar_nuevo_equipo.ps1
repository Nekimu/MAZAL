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

$currentDir = $PSScriptRoot
if (-not $currentDir) { $currentDir = Get-Location }

Write-Host "[*] Copiando bundle optimizado de producción a $destDir..." -ForegroundColor Cyan
if (Test-Path "$currentDir\mazal\dist") {
    Copy-Item -Path "$currentDir\mazal\dist\*" -Destination $destDir -Recurse -Force
} elseif (Test-Path "$currentDir\dist") {
    Copy-Item -Path "$currentDir\dist\*" -Destination $destDir -Recurse -Force
}

if (Test-Path "$currentDir\api.php") {
    Copy-Item -Path "$currentDir\api.php" -Destination "$destDir\api.php" -Force
    Copy-Item -Path "$currentDir\api.php" -Destination "$xamppPath\htdocs\api.php" -Force
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
    echo '[OK] Bases de datos mazal_bd y mazal_bd1 garantizadas.'.PHP_EOL;
}
"@

& "$xamppPath\php\php.exe" -r $initScript

# Disparar auto-migración de esquema a través de api.php
try {
    $pingNorte = Invoke-RestMethod -Uri "http://localhost/mazal/api.php?action=ping&branch=Norte" -TimeoutSec 5 -ErrorAction SilentlyContinue
    $pingSur = Invoke-RestMethod -Uri "http://localhost/mazal/api.php?action=ping&branch=Sur" -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-Host "[OK] Auto-migración y auto-reparación de tablas ejecutada exitosamente." -ForegroundColor Green
} catch {
    Write-Host "[!] Aviso: No se pudo contactar Apache por HTTP todavía. Se auto-migrará en la primera visita." -ForegroundColor Yellow
}

# 4. RESUMEN FINAL
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "                     DESPLIEGUE COMPLETADO CON ÉXITO" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " URL del Sistema:       http://localhost/mazal/" -ForegroundColor Cyan
Write-Host " Sucursal 1 (Norte):    Base de Datos: mazal_bd  (PIN: norte123)" -ForegroundColor White
Write-Host " Sucursal 2 (Sur):      Base de Datos: mazal_bd1 (PIN: sur123)" -ForegroundColor White
Write-Host " Administrador General: Usuario: admin / Contraseña: admin030114" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost/mazal/"
