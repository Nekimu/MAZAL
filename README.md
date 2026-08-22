# 🛒 MAZAL POS & ERP — Sistema de Punto de Venta, Inventario y Mayoreo

Sistema integral de Punto de Venta (**POS**), Control de Inventario Multi-Sucursal, Gestión de Compras/Proveedores, Cuentas por Cobrar (Clientes y Fiados), Finanzas/Arqueo de Caja y Catálogo Mayorista en tiempo real. 

Diseñado con arquitectura **Server-Side Segura** en **Railway**, base de datos relacional en la nube **Supabase PostgreSQL 15+** con **Row Level Security (RLS)** y resiliencia **Offline-First** (PWA con sincronización automática).

---

## 🏛️ Arquitectura de Producción Oficial (Single-Stack)

El sistema opera bajo un stack consolidado único de producción:

```
┌────────────────────────────────────────────────────────┐
│                   SUPABASE CLOUD                       │
│    (PostgreSQL 15+ • Row Level Security • Realtime)    │
└──────────────────────────▲─────────────────────────────┘
                           │ TLS 1.3 / REST / WebSockets
                           │ (PostgREST + RLS Policies)
┌──────────────────────────▼─────────────────────────────┐
│                 RAILWAY HOSTING SERVER                 │
│      Node.js 22 • Express • Bcrypt • JWT Middleware    │
│      - POST /api/auth/login (Autenticación Server-Side)│
│      - GET  /api/auth/me    (Validación de Sesión)     │
│      - GET  /health         (Healthcheck / Uptime)     │
├────────────────────────────────────────────────────────┤
│                 MAZAL POS & ERP CLIENT                 │
│       React 19 • TypeScript • Tailwind CSS • Vite      │
│  🚀 Catálogo Mayorista Público y POS Multi-Sucursal   │
│  🛡️ Cola de contingencia y sincronización Offline      │
│  🖨️ Impresión Térmica de Tickets 80mm de Alta Precisión│
└────────────────────────────────────────────────────────┘
```

### Principios de Seguridad y Operación:
1. **Autenticación Server-Side Robusta**: El login se resuelve exclusivamente en el servidor backend (`POST /api/auth/login`) mediante hashes `bcrypt` (factor de costo 12) y tokens JWT firmados con `JWT_SECRET`. No se almacenan ni comparan contraseñas en el bundle del cliente.
2. **Row Level Security (RLS) en Postgres**: Todas las tablas de negocio (`sales`, `customers`, `users`, `stock_movements`, `bank_accounts`, etc.) tienen RLS habilitado con políticas estrictas. El rol anónimo (`anon`) únicamente tiene permiso de lectura (`SELECT`) sobre el catálogo público de productos.
3. **Protección Pre-commit de Secretos**: Hook automatizado (`scripts/check-secrets.js`) que bloquea cualquier commit que contenga tokens, contraseñas o claves API reales.
4. **Resiliencia Operativa Offline**: Si la conexión a internet falla en sucursal, el POS continúa operando localmente emitiendo tickets y registrando movimientos. Al restaurarse la red, la cola de sincronización sube los datos a Supabase automáticamente.

---

## 📋 Requisitos del Entorno

### Hardware Recomendado para Sucursal:
* **Computadora / Laptop**: Intel Core i3 / AMD Ryzen 3 o superior, 4 GB+ RAM.
* **Impresora Térmica**: Papel continuo de **80mm** (ej. END-80TEUX, Epson TM-T20, POS-80).
* **Lector de Código de Barras**: USB o Bluetooth (Plug & Play, emulación teclado).
* **Báscula Digital**: Compatible con venta fraccionada / pesaje a granel (Kg/g).

### Software:
* **Navegador Web**: Google Chrome, Microsoft Edge o Brave (versión moderna con soporte PWA).
* **Entorno de Ejecución**: Node.js v22+ (para el servidor web y compilación de producción).

---

## 🚀 Despliegue y Puesta en Marcha en Producción (Railway + Supabase)

### 1. Configuración de Variables de Entorno
Copia el archivo `.env.example` como `.env` en la raíz del proyecto y en la carpeta `mazal/`:

```bash
cp .env.example .env
cp .env.example mazal/.env
```

Configura tus credenciales reales en tu panel de **Railway** (Variables) o archivo `.env` local:
```ini
# --- SUPABASE CLOUD ---
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu_anon_key_publica"

# --- AUTENTICACIÓN SERVER-SIDE & JWT ---
# Genera una clave secreta con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="tu-clave-secreta-hex-de-64-caracteres"
VITE_USER_ADMIN_PASSWORD="tu-password-admin-seguro"

# --- PUERTO DEL SERVIDOR ---
PORT=3000
```

> [!IMPORTANT]
> **NUNCA** subas tu archivo `.env` al repositorio de Git. El archivo `.gitignore` y el pre-commit hook bloquean automáticamente la inclusión de secretos.

---

### 2. Inicialización de la Base de Datos y RLS en Supabase
1. Ingresa a tu panel de control en [Supabase](https://supabase.com/).
2. Ve a la sección **SQL Editor**.
3. Abre el archivo [`scripts/sql/supabase_schema.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_schema.sql) (o [`scripts/sql/supabase_purge.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_purge.sql) para purgado total).
4. Pégalo en el editor SQL de Supabase y presiona **Run**.
5. *(Opcional)* Purgar o sembrar desde la consola:
   ```bash
   npm run purge:supabase
   npm run seed:supabase
   ```

---

### 3. Compilación y Ejecución del Servidor Web

#### En Entorno Local:
```bash
# 1. Instalar dependencias
npm install

# 2. Compilar bundle frontend optimizado
npm run build

# 3. Iniciar el servidor web seguro con Express + JWT
npm start
```
El sistema estará activo en `http://localhost:3000`.

#### En Railway:
Railway detecta automáticamente el repositorio mediante [`railway.json`](file:///c:/xampp/htdocs/MAZAL/mazal/railway.json) y [`Dockerfile`](file:///c:/xampp/htdocs/MAZAL/mazal/Dockerfile), compila la aplicación y levanta el servidor web con compresión Gzip, cabeceras HSTS y HTTPS activo.

---

## 🔒 Matriz de Roles y Permisos

| Rol | Permisos | Acceso a Módulos |
| :--- | :--- | :--- |
| **Administrador** | Control total del sistema y gestión de colaboradores | Todos (POS, Inventario, Compras, Clientes, Finanzas, Seguridad, Reportes) |
| **Gerente** | Operación y supervisión de sucursal | POS, Inventario, Compras, Clientes, Finanzas, Reportes |
| **Cajero** | Cobro ágil y arqueo de turno | POS, Catálogo, Recibos, Turnos |
| **Almacenista** | Entradas, salidas y conteo físico | Inventario, Bodega Central, Ajustes de Stock, Compras |
| **Compras** | Proveedores y órdenes de compra | Compras, Proveedores, Inventario |
| **Contabilidad** | Cuentas bancarias y finanzas | Finanzas, Reportes, Cuentas por Cobrar |

---

## 🛠️ Herramientas de Despliegue y Scripts Organizados

Todos los scripts y utilidades están organizados en subcarpetas dedicadas:
* [`docs/GUIA_DESPLIEGUE_NUEVO_EQUIPO.md`](file:///c:/xampp/htdocs/MAZAL/mazal/docs/GUIA_DESPLIEGUE_NUEVO_EQUIPO.md): Manual completo de instalación en equipos nuevos.
* [`scripts/deploy/desplegar_nuevo_equipo.bat`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/desplegar_nuevo_equipo.bat) / [`.ps1`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/desplegar_nuevo_equipo.ps1): Asistente de despliegue en 1 clic.
* [`scripts/deploy/ABRIR_MAZAL_POS.bat`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/ABRIR_MAZAL_POS.bat): Lanzador rápido de servicios locales en Windows.
* [`scripts/deploy/MIGRAR_A_SUPABASE.bat`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/deploy/MIGRAR_A_SUPABASE.bat): Lanzador de migración de MySQL a Supabase.
* [`scripts/sql/supabase_schema.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_schema.sql): Esquema DDL oficial de PostgreSQL.
* [`scripts/sql/supabase_purge.sql`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/sql/supabase_purge.sql): Script de purgado limpio.
* [`scripts/purge_and_verify_supabase.mjs`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/purge_and_verify_supabase.mjs): Verificador de conectividad y métodos Supabase.
* [`scripts/migrate_mysql_to_supabase.mjs`](file:///c:/xampp/htdocs/MAZAL/mazal/scripts/migrate_mysql_to_supabase.mjs): Script Node.js de volcado de datos.

---

## 🧪 Pruebas y Validación de Calidad

```bash
# Validar que no existan secretos expuestos en Git
npm run check:secrets

# Compilar frontend y validar tipado estricto TypeScript
npm run build
```

---

© MAZAL POS & ERP — Distribuidora de Productos Desechables, Plásticos y Comestibles.
