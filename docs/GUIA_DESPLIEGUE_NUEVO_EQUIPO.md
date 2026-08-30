# 🚀 Guía de Despliegue en un Equipo Nuevo — MAZAL POS & ERP

Esta guía te permitirá poner en marcha el sistema **MAZAL POS & ERP** en cualquier computadora nueva con Windows y XAMPP en menos de 2 minutos.

---

## 📋 Requisitos Previos

1. **XAMPP**: Tener instalado [XAMPP](https://www.apachefriends.org/) (versión 8.1 o superior) con **Apache** y **MySQL** instalados.
2. **Navegador Web**: Google Chrome, Microsoft Edge o Mozilla Firefox actualizado.

---

## ⚡ Método 1: Despliegue Automático en 1 Clic (Recomendado)

En la carpeta [`scripts/deploy/`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/) encontrarás los asistentes automáticos:

1. Inicia **Apache** y **MySQL** desde el Panel de Control de XAMPP.
2. Haz doble clic en [`scripts/deploy/desplegar_nuevo_equipo.bat`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/desplegar_nuevo_equipo.bat) (o ejecuta con PowerShell [`scripts/deploy/desplegar_nuevo_equipo.ps1`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/desplegar_nuevo_equipo.ps1)).
3. El script automáticamente:
   * Copiará los archivos a `C:\xampp\htdocs\mazal`.
   * Creará las bases de datos locales `mazal_bd` (Norte) y `mazal_bd1` (Sur).
   * Aprovisionará las tablas nativas y la matriz de permisos.
   * Abrirá el sistema en tu navegador en `http://localhost/mazal/`.

---

## 🛠️ Método 2: Despliegue Manual Paso a Paso

Si prefieres realizar el proceso manualmente:

### 1. Copiar los archivos a XAMPP
Copia el contenido compilado a:
```
C:\xampp\htdocs\mazal\
```
Asegúrate de incluir `api.php`, `index.html`, `manifest.json`, `sw.js` y la carpeta `assets/`.

### 2. Iniciar Servicios
Abre el **XAMPP Control Panel** e inicia:
* **Apache** (Puerto 80 / 443)
* **MySQL** (Puerto 3306)

### 3. Auto-Aprovisionamiento de Tablas
Abre tu navegador y accede a:
```
http://localhost/mazal/
```
El sistema detectará automáticamente el equipo y aprovisionará la estructura limpia de bases de datos.

---

## 🔑 Credenciales de Acceso

| Sucursal / Rol | Base de Datos | Clave / PIN de Acceso |
| :--- | :--- | :--- |
| **Sucursal Norte (Principal)** | `mazal_bd` | `norte123` |
| **Sucursal Sur (Secundaria)** | `mazal_bd1` | `sur123` |
| **Administrador General** | Global | Usuario: `admin` / Contraseña: *Generada con `npm run seed:admin`* |

---

## ☁️ Conexión a Supabase Cloud (Opcional)

Para conectar el sistema a la nube de Supabase:
1. Configura tus credenciales en el archivo `.env`:
   ```ini
   VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
   VITE_SUPABASE_ANON_KEY="tu-anon-key-publica"
   ```
2. Ejecuta el esquema SQL oficial en el SQL Editor de Supabase:
   * Archivo: [`scripts/sql/supabase_schema.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_schema.sql)
3. Para purgar datos en cualquier momento:
   * Archivo: [`scripts/sql/supabase_purge.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_purge.sql)
   * Comando: `npm run purge:supabase`
