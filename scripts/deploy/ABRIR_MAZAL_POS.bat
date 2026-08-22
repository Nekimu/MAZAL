@echo off
title MAZAL POS [MODO LOCAL / XAMPP]
echo ======================================================
echo    MAZAL POS - LANZADOR LOCAL
echo    (Produccion: Desplegado en Railway con Supabase)
echo ======================================================
echo.

:: Verificar si Apache esta corriendo
netstat -ano | findstr ":80 " >nul
if %errorlevel% neq 0 (
    echo [*] Iniciando servidor Apache XAMPP...
    start "" /B "C:\xampp\apache\bin\httpd.exe"
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] Apache ya se encuentra activo.
)

:: Verificar si MySQL esta corriendo
netstat -ano | findstr ":3306 " >nul
if %errorlevel% neq 0 (
    echo [*] Iniciando base de datos MySQL XAMPP...
    start "" /B "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] MySQL ya se encuentra activo.
)

echo.
echo [OK] Abriendo sistema en tu navegador...
start http://localhost/mazal/

echo.
echo ======================================================
echo  Sistema Mazal POS iniciado correctamente.
echo  Puedes minimizar o cerrar esta ventana.
echo ======================================================
timeout /t 3
exit
