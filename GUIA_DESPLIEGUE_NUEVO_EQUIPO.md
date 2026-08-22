# Guía de Despliegue y Aprovisionamiento Automático en Nuevos Equipos

Este documento detalla el procedimiento para desplegar el sistema **MAZAL POS & ERP** en cualquier equipo nuevo o servidor local con XAMPP.

---

## 1. Requisitos Previos en el Nuevo Equipo

1. **XAMPP para Windows** (Apache + MySQL + PHP 7.4 / 8.x):
   - Descarga gratuita: [https://www.apachefriends.org/](https://www.apachefriends.org/)
   - Instalar por defecto en `C:\xampp\`.
2. **Navegador Web Moderno** (Google Chrome, Microsoft Edge, Brave, Firefox).
3. **Servicios de XAMPP Iniciados**:
   - Abrir el panel de control de XAMPP (`xampp-control.exe`).
   - Dar clic en **Start** en **Apache** (Puertos 80, 443).
   - Dar clic en **Start** en **MySQL** (Puerto 3306).

---

## 2. Despliegue Automático en 1 Clic

1. Copia la carpeta del proyecto a cualquier ubicación (o directamente a `C:\xampp\htdocs\MAZAL\`).
2. Haz **doble clic** sobre el archivo:
   ```cmd
   desplegar_nuevo_equipo.bat
   ```
   *(O ejecuta `desplegar_nuevo_equipo.ps1` con PowerShell).*

3. El script automáticamente:
   - Detecta la instalación de XAMPP.
   - Crea la carpeta web en `C:\xampp\htdocs\mazal\`.
   - Copia todos los archivos optimizados de producción y el backend `api.php`.
   - **Verifica y crea automáticamente las bases de datos locales** (`mazal_bd` para Sucursal Norte y `mazal_bd1` para Sucursal Sur).
   - **Ejecuta la auto-migración de esquema (Self-Healing Schema)** creando todas las tablas y columnas necesarias si no existen o están incompletas.
   - Configura al Administrador General maestro con contraseña `admin030114`.
   - Abre el sistema automáticamente en tu navegador en `http://localhost/mazal/`.

---

## 3. Mecanismo de Auto-Provisión y Auto-Reparación (Self-Healing Schema)

El backend `api.php` incorpora una función de verificación continua (`autoMigrateSchema`):
- **Caso 1 (Base de Datos No Existe)**:
  - Al recibir la primera petición, se conecta a MySQL y ejecuta:
    ```sql
    CREATE DATABASE IF NOT EXISTS mazal_bd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE DATABASE IF NOT EXISTS mazal_bd1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ```
- **Caso 2 (Base de Datos Existe pero Faltan Tablas o Columnas)**:
  - Para cada tabla (`usuarios`, `productos`, `precios`, `clientes`, `proveedor`, `ventas`, `roles_permisos`, `mazal_app_state`), el sistema ejecuta `SHOW COLUMNS FROM <table>`.
  - Si detecta que faltan columnas nuevas (como `total_utilidad`, `cant_ade`, `Unitario`, etc.), ejecuta automáticamente:
    ```sql
    ALTER TABLE <table> ADD COLUMN <columna> <tipo>;
    ```
  - Si la tabla `roles_permisos` o `mazal_app_state` no existían, las crea automáticamente e inserta los permisos predeterminados.

---

## 4. Credenciales y Accesos del Sistema

| Tipo de Acceso | Identificador / Usuario | Contraseña / PIN | Alcance |
| :--- | :--- | :--- | :--- |
| **Administrador General Maestro** | `admin` | **`admin030114`** | Acceso total a todas las sucursales y módulos |
| **Sucursal 1 (MAZAL 1 / Norte)** | Selector Norte | `norte123` | Inventario y ventas de base `mazal_bd` |
| **Sucursal 2 (MAZAL 2 / Sur)** | Selector Sur | `sur123` | Inventario y ventas de base `mazal_bd1` |
| **Caja Rápida Express** | Botón directo | Sin clave | Operación exclusiva de cobro y tickets |

---

## 5. Verificación de Funcionamiento

Para verificar que el backend y las bases de datos responden correctamente, puedes abrir las siguientes URLs en tu navegador:

- **Catálogo y Sistema Web**: `http://localhost/mazal/`
- **Diagnóstico Sucursal Norte**: `http://localhost/mazal/api.php?action=ping&branch=Norte`
- **Diagnóstico Sucursal Sur**: `http://localhost/mazal/api.php?action=ping&branch=Sur`
- **Permisos de Roles en MySQL**: `http://localhost/mazal/api.php?action=get_permissions`
