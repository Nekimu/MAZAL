@echo off
REM ==============================================================================
REM MAZAL POS & ERP - RESPALDO AUTOMATIZADO MYSQL (WINDOWS / XAMPP)
REM ==============================================================================
REM Este script realiza un respaldo completo de la base de datos mazal_bd
REM y elimina respaldos antiguos mayores a 14 días.
REM
REM Programación en Windows:
REM 1. Abrir 'Programador de tareas' (Task Scheduler)
REM 2. Crear Tarea Básica: 'MAZAL_Respaldo_Diario'
REM 3. Desencadenador: Diario a las 23:00
REM 4. Acción: Iniciar un programa -> Examinar -> scripts\backup_mysql.bat
REM ==============================================================================

setlocal enabledelayedexpansion

REM Ajustar ruta de XAMPP si es necesario
set MYSQLDUMP_PATH=C:\xampp\mysql\bin\mysqldump.exe
if not exist "%MYSQLDUMP_PATH%" (
    set MYSQLDUMP_PATH=mysqldump.exe
)

REM Configuración de Base de Datos
set DB_NAME=mazal_bd
set DB_USER=mazal_app
REM Ingrese la contraseña si está configurada, de lo contrario dejar vacío
set DB_PASS=MazalLocal_2026!Sec
set DB_HOST=127.0.0.1
set DB_PORT=3306

REM Directorio de Respaldos
set BACKUP_DIR=%~dp0..\backups
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

REM Formato de Fecha y Hora ISO
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%%datetime:~10,2%%datetime:~12,2%
set BACKUP_FILE=%BACKUP_DIR%\mazal_bd_%TIMESTAMP%.sql

echo ===================================================
echo [MAZAL BACKUP] Iniciando respaldo de %DB_NAME%...
echo Fecha/Hora: %TIMESTAMP%
echo Archivo: %BACKUP_FILE%
echo ===================================================

if "%DB_PASS%"=="" (
    "%MYSQLDUMP_PATH%" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% --single-transaction --quick --routines --triggers %DB_NAME% > "%BACKUP_FILE%"
) else (
    "%MYSQLDUMP_PATH%" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% --single-transaction --quick --routines --triggers %DB_NAME% > "%BACKUP_FILE%"
)

if %ERRORLEVEL% equ 0 (
    echo [EXITO] Respaldo completado correctamente en: %BACKUP_FILE%
    
    REM Rotación: Eliminar respaldos con más de 14 días
    echo [ROTACION] Purgando respaldos mayores a 14 dias...
    forfiles /p "%BACKUP_DIR%" /m mazal_bd_*.sql /d -14 /c "cmd /c del @path" 2>nul
) else (
    echo [ERROR] Fallo al generar el respaldo de MySQL.
)

echo ===================================================
endlocal
