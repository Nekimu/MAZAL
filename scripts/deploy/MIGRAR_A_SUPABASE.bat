@echo off
title MAZAL POS - MIGRACION MYSQL LOCAL A SUPABASE CLOUD
color 0A

echo =================================================================
echo   MAZAL POS & ERP - HERRAMIENTA DE MIGRACION LOCAL A SUPABASE
echo   (Permite migrar datos historicos de MySQL a Supabase Cloud)
echo =================================================================
echo.
echo Este script subira automaticamente las dos bases de datos locales:
echo  1. Mazal 1 (Norte / Principal)  -^> mazal_bd
echo  2. Mazal 2 (Sur / Secundaria)    -^> mazal_bd1
echo.
echo Requisitos previos:
echo  [OK] XAMPP (Apache y MySQL) debe estar ENCENDIDO.
echo  [OK] Las tablas deben estar creadas en Supabase (scripts/sql/supabase_schema.sql).
echo.
echo Presiona cualquier tecla para comenzar la migracion...
pause > nul
echo.

cd /d "%~dp0..\.."
node scripts/migrate_mysql_to_supabase.mjs

echo.
echo =================================================================
echo Proceso finalizado.
echo =================================================================
pause
