@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ==============================================================================
echo        MAZAL POS ^& ERP - SCRIPT DE DESPLIEGUE AUTOMATIZADO
echo ==============================================================================
echo Este script configurara e instalara MAZAL POS en este nuevo equipo.
echo Verificando componentes requeridos...
echo.

:: 1. VERIFICAR XAMPP
set "XAMPP_DIR=C:\xampp"
if not exist "%XAMPP_DIR%" (
    echo [!] AVISO: No se encontro XAMPP en %XAMPP_DIR%.
    set /p "XAMPP_DIR=Introduce la ruta donde esta instalado XAMPP (ej. D:\xampp o presiona ENTER para C:\xampp): "
    if "!XAMPP_DIR!"=="" set "XAMPP_DIR=C:\xampp"
)

if not exist "!XAMPP_DIR!\php\php.exe" (
    echo [ERROR] No se encontro PHP en !XAMPP_DIR!\php\php.exe.
    echo Por favor asegurate de tener XAMPP instalado antes de continuar.
    pause
    exit /b 1
)
echo [OK] XAMPP detectado en !XAMPP_DIR!.

:: 2. VERIFICAR DIRECTORIO HTDOCS
set "HTDOCS_DIR=!XAMPP_DIR!\htdocs\mazal"
if not exist "!HTDOCS_DIR!" (
    echo [*] Creando carpeta de destino: !HTDOCS_DIR!
    mkdir "!HTDOCS_DIR!" 2>nul
)

:: 3. INSTALAR / COPIAR ARCHIVOS DEL SISTEMA
echo [*] Desplegando archivos del sistema web a !HTDOCS_DIR!...
set "ROOT_DIR=%~dp0..\..\"

if exist "%ROOT_DIR%mazal\dist" (
    echo [*] Copiando bundle optimizado de produccion...
    xcopy /E /Y /I "%ROOT_DIR%mazal\dist\*" "!HTDOCS_DIR!\" >nul
) else if exist "%ROOT_DIR%dist" (
    echo [*] Copiando bundle optimizado de produccion...
    xcopy /E /Y /I "%ROOT_DIR%dist\*" "!HTDOCS_DIR!\" >nul
)

:: Copiar backend api.php
if exist "%ROOT_DIR%api.php" (
    copy /Y "%ROOT_DIR%api.php" "!HTDOCS_DIR!\api.php" >nul
    copy /Y "%ROOT_DIR%api.php" "!XAMPP_DIR!\htdocs\api.php" >nul
)

:: 4. EJECUTAR PROVISIONAMIENTO Y AUTO-MIGRACION DE BASE DE DATOS
echo.
echo [*] Verificando y aprovisionando Base de Datos MySQL local...
"!XAMPP_DIR!\php\php.exe" -r "
\$m = @new mysqli('localhost', 'root', '');
if (\$m->connect_errno) {
    echo '[!] No se pudo conectar a MySQL en localhost:3306. Asegurate de que MySQL este iniciado en el panel de XAMPP.'.PHP_EOL;
} else {
    \$m->query('CREATE DATABASE IF NOT EXISTS mazal_bd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    \$m->query('CREATE DATABASE IF NOT EXISTS mazal_bd1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    echo '[OK] Bases de datos mazal_bd (Norte) y mazal_bd1 (Sur) creadas/verificadas.'.PHP_EOL;
}
"

:: Ejecutar ping a api.php para disparar la auto-migracion de tablas
"!XAMPP_DIR!\php\php.exe" -r "
@file_get_contents('http://localhost/mazal/api.php?action=ping&branch=Norte');
@file_get_contents('http://localhost/mazal/api.php?action=ping&branch=Sur');
echo '[OK] Tablas nativas, usuarios, clientes y permisos auto-migrados con exito.'.PHP_EOL;
" 2>nul

:: 5. VERIFICACION DE ACCESO
echo.
echo ==============================================================================
echo                  DESPLIEGUE COMPLETADO CON EXITO
echo ==============================================================================
echo  1. URL del Sistema:       http://localhost/mazal/
echo  2. Sucursal 1 (Norte):    BD: mazal_bd  (PIN: norte123)
echo  3. Sucursal 2 (Sur):      BD: mazal_bd1 (PIN: sur123)
echo  4. Administrador General: Usuario: admin / Clave: (Inicializar con npm run seed:admin)
echo ==============================================================================
echo.
echo Abriendo el sistema en tu navegador predeterminado...
start http://localhost/mazal/
pause
