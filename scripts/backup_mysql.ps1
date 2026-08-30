# ==============================================================================
# MAZAL POS & ERP - RESPALDO AUTOMATIZADO POWERSHELL (WINDOWS)
# ==============================================================================
# Soporta respaldo con mysqldump y rotación estricta de 14 días.
# ==============================================================================

param(
    [string]$DbUser = "mazal_app",
    [string]$DbPass = "MazalLocal_2026!Sec",
    [string]$DbName = "mazal_bd",
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 3306,
    [int]$RetentionDays = 14
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path (Split-Path -Parent $scriptDir) "backups"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

$mysqldump = "C:\xampp\mysql\bin\mysqldump.exe"
if (-not (Test-Path $mysqldump)) {
    $mysqldump = "mysqldump"
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupFile = Join-Path $backupDir "mazal_bd_$timestamp.sql"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "[MAZAL] Generando respaldo local de base de datos..." -ForegroundColor Yellow
Write-Host "Destino: $backupFile" -ForegroundColor Gray

$argsList = @(
    "-h", $DbHost,
    "-P", $DbPort,
    "-u", $DbUser,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    $DbName
)

if ($DbPass) {
    $argsList = @("-p$DbPass") + $argsList
}

try {
    & $mysqldump $argsList | Out-File -FilePath $backupFile -Encoding utf8
    if (Test-Path $backupFile) {
        $size = (Get-Item $backupFile).Length / 1KB
        Write-Host "✅ [EXITO] Respaldo generado satisfactoriamente ($([math]::Round($size, 2)) KB)" -ForegroundColor Green
        
        # Rotación de respaldos: eliminar archivos mayores a RetentionDays
        $limitDate = (Get-Date).AddDays(-$RetentionDays)
        $oldBackups = Get-ChildItem -Path $backupDir -Filter "mazal_bd_*.sql" | Where-Object { $_.LastWriteTime -lt $limitDate }
        foreach ($old in $oldBackups) {
            Remove-Item $old.FullName -Force
            Write-Host "🧹 [ROTACION] Eliminado respaldo antiguo: $($old.Name)" -ForegroundColor DarkGray
        }
    }
} catch {
    Write-Host "❌ [ERROR] No se pudo generar el respaldo: $_" -ForegroundColor Red
}

Write-Host "===================================================" -ForegroundColor Cyan
