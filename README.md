# 🛒 MAZAL POS - Sistema Integral de Punto de Venta, Inventario y Mayoreo

Sistema profesional de Punto de Venta (POS), Control de Inventario, Gestión de Proveedores/Compras, Cuentas por Cobrar (Clientes y Fiados), Finanzas y Catálogo Mayorista en tiempo real con arquitectura multi-sucursal y persistencia MySQL.

---

## 📋 Tabla de Contenidos
1. [Requisitos del Sistema](#-requisitos-del-sistema)
2. [Estructura del Proyecto](#-estructura-del-proyecto)
3. [Guía de Instalación Rápida (Nuevo Computador)](#-guía-de-instalación-rápida-nuevo-computador)
4. [Configuración de Base de Datos MySQL](#-configuración-de-base-de-datos-mysql)
5. [Configuración de Impresora Térmica (80mm)](#-configuración-de-impresora-térmica-80mm)
6. [Credenciales de Acceso](#-credenciales-de-acceso)
7. [Módulos y Funcionalidades del Sistema](#-módulos-y-funcionalidades-del-sistema)
8. [Modo Desarrollo y Recompilación](#-modo-desarrollo-y-recompilación)
9. [Solución de Problemas Frecuentes](#-solución-de-problemas-frecuentes)

---

## 💻 Requisitos del Sistema

### Hardware Mínimo:
* **Procesador**: Intel Core i3 / AMD Ryzen 3 o superior.
* **Memoria RAM**: 4 GB mínimo (8 GB recomendado).
* **Almacenamiento**: 500 MB de espacio disponible en disco.
* **Periféricos opcionales**:
  * Impresora térmica de tickets de **80mm** (ej. END-80TEUX, Epson TM-T20, POS-80).
  * Lector de código de barras USB o Bluetooth (Plug & Play).
  * Báscula digital (compatible con venta fraccionada / granel).

### Software Requerido:
* **Sistema Operativo**: Windows 10, Windows 11 o Windows Server (64-bit).
* **Servidor Web y Base de Datos**: **XAMPP para Windows** (con Apache 2.4+ y MySQL / MariaDB 10.4+, PHP 8.0 o superior).
* **Navegador Web**: Google Chrome, Microsoft Edge o Brave (versión actualizada).
* *(Opcional, solo si deseas modificar el código fuente)*: Node.js v18+ y npm.

---

## 📁 Estructura del Proyecto

```text
c:\xampp\htdocs\MAZAL_POS\
├── index.html                   # Entrada principal de la aplicación web
├── api.php                      # Backend API REST en PHP para conectar MySQL
├── ABRIR_MAZAL_POS.bat          # Script de inicio rápido en 1-clic (inicia Apache/MySQL y abre navegador)
├── manifest.json & sw.js        # Configuración de Progressive Web App (PWA)
├── assets\                      # Archivos JS, CSS e imágenes compiladas para producción
├── backups\                     # Respaldos SQL listos para importar
│   ├── mazal_bd_principal_20260810.sql   # BD Principal MAZAL 1
│   └── mazal_bd_purged_admin_20260810.sql
├── mazal\                       # Código fuente en React + TypeScript + TailwindCSS + Vite
│   ├── src\
│   │   ├── components\          # Módulos: POS, Inventario, Compras, Clientes, Finanzas, etc.
│   │   ├── utils\               # Utilidades de impresión de tickets (TicketPrinter.ts)
│   │   └── data.ts              # Capa de sincronización LocalStorage / API MySQL
│   └── package.json
└── README.md                    # Documentación y guía de despliegue
```

---

## 🚀 Guía de Instalación Rápida (Nuevo Computador)

Sigue estos sencillos pasos para dejar el sistema funcionando en cualquier computadora nueva:

### Paso 1: Instalar XAMPP
1. Descarga e instala **XAMPP** desde [https://www.apachefriends.org/](https://www.apachefriends.org/).
2. Instálalo en la ruta por defecto: `C:\xampp`.

### Paso 2: Copiar el Proyecto a `htdocs`
1. Copia la carpeta completa `MAZAL_POS` dentro del directorio `htdocs` de XAMPP:
   ```text
   C:\xampp\htdocs\MAZAL_POS\
   ```

### Paso 3: Iniciar Apache y MySQL
1. Abre el **XAMPP Control Panel**.
2. Haz clic en **Start** en el módulo de **Apache** y en el de **MySQL**.
3. Ambos módulos deben mostrarse en color verde.

---

## 🗄️ Configuración de Base de Datos MySQL

### Paso 1: Abrir phpMyAdmin
* Ingresa a tu navegador y entra a: `http://localhost/phpmyadmin/`.

### Paso 2: Crear la Base de Datos Principal
1. En el menú izquierdo de phpMyAdmin, haz clic en **"Nueva"**.
2. Nombre de la base de datos: `mazal_bd`.
3. Cotejamiento: `utf8mb4_general_ci`.
4. Haz clic en **"Crear"**.

### Paso 3: Importar los Datos
1. Selecciona la base de datos `mazal_bd` recién creada.
2. Ve a la pestaña superior **"Importar"**.
3. Haz clic en **"Seleccionar archivo"** y busca el archivo ubicado en:
   ```text
   C:\xampp\htdocs\MAZAL_POS\backups\mazal_bd_principal_20260810.sql
   ```
4. Haz clic en **"Importar"** al final de la página.

*(Opcional para MAZAL 2 / Sucursal Secundaria)*: Si deseas habilitar la base de datos secundaria para MAZAL 2, repite el proceso creando una base de datos llamada `mazal_bd1`.

---

## 🔑 Credenciales de Acceso

Al entrar a `http://localhost/MAZAL_POS/`, el sistema cargará por defecto el **Catálogo Público Mayorista**. Para ingresar al panel de administración o punto de venta:

1. Haz clic en el botón superior derecho **"Iniciar Sesión"** o **"Cambiar Sucursal"**.
2. Usa las siguientes credenciales:

| Rol | Usuario | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **Administrador General** | `admin` | `admin` *(o `1234`)* | Acceso total (POS, Inventario, Compras, Clientes, Finanzas, Seguridad, Modificar/Eliminar Clientes) |
| **Cajero / Vendedor** | `cajero` | `1234` | Punto de Venta, Cobro, Recibos, Consultas |
| **Almacén** | `almacen` | `1234` | Ajuste de Stock, Inventario, Recepción de Compras |

---

## 🖨️ Configuración de Impresora Térmica (80mm)

El generador de tickets térmicos está calibrado para papel de **80mm** con **escala al 170%**:

1. En el módulo **POS** o **Recibos**, haz clic en **"Imprimir Ticket"**.
2. En la ventana de diálogo de impresión del navegador:
   * **Destino**: Selecciona tu impresora térmica (ej. *END-80TEUX*, *POS-80* o *Generic 80mm*).
   * **Márgenes**: Selecciona **"Ninguno"** (None / 0mm).
   * **Escala**: **170%** (o ajusta entre 160% - 170% según el ancho exacto del cabezal).
   * **Opciones**: Activar casilla **"Gráficos de fondo"** (Background graphics).
3. **Formato del Ticket Generado**:
   * **Encabezado**: `M A Z A L - Distribuidor de productos desechables, plásticos y comestibles`
   * **Dirección**: `Manzana 008, 50830 Jiquipilco, Méx.` | **Teléfono**: `7121110085`
   * **Folio y Fecha/Hora**: Formato cronológico sin segundos (ej. `FOLIO: TK-20260811-1822` | `FECHA: 2026-08-11 18:22`).
   * **Sin IVA ni QR**: Total directo y limpio.

---

## 📦 Módulos y Funcionalidades del Sistema

### 1. 🛍️ Catálogo Público Mayorista (Página Principal)
* Acceso directo para clientes y cotizaciones sin necesidad de iniciar sesión.
* Buscador en tiempo real anclado en el encabezado (*Sticky Header*).
* Filtros rápidos por Departamento, Categoría y Tipo de Unidad (Pieza, Kg, Litro, Paquete, etc.).
* Desglose automático de tarifas: Precio Menudeo, Medio Mayoreo (12+ pzas) y Mayoreo Especial (50+ pzas).

### 2. ⚡ Punto de Venta (POS - Vender Ahora)
* Cobro ágil con escáner de código de barras o búsqueda manual.
* Soporte para venta por pieza, empaque, peso (báscula / gramos / Kg) y volumen (litros / ml).
* Métodos de pago: Efectivo, Tarjeta, Transferencia y Crédito Fiado.
* Impresión térmica instantánea y guardado histórico de ventas.

### 3. 📦 Control de Inventario y Ajustes de Stock
* Catálogo de productos con SKU, códigos de barra, costos, precios mínimos y máximos.
* **Modal Inteligente de Ajuste de Stock**:
  * Buscador interactivo por producto.
  * Modos: Conteo Físico Directo, Entrada por Ajuste (+), Salida por Ajuste (-) y Salida por Caducidad (-).
  * Edición en la misma ventana de la unidad de medida (`Pza`, `Kg`, `L`, `Paq`, `Caja`, `g`, `ml`), venta a granel/fraccionada y gramaje base.
  * Cálculo y visualizador en tiempo real: `Stock Anterior ➔ Nuevo Stock Resultante`.

### 4. 👥 Clientes y Saldos Fiados (Cuentas por Cobrar)
* Registro de clientes con límites de crédito y plazos de pago.
* Registro de Abonos Parciales, Liquidación Total, Cargos y Quitas con bitácora de movimientos.
* **Control de Seguridad Exclusivo para Administrador**:
  * Botón **Modificar**: Solo el Administrador puede editar los datos maestros del cliente.
  * Botón **Eliminar**: Exclusivo para el Administrador con validación automática que impide eliminar clientes con deuda pendiente.

### 5. 🚚 Compras y Proveedores (Cuentas por Pagar)
* Directorio de proveedores con saldo de cuentas por pagar.
* Generador de Órdenes de Compra (OC).
* Recepción de mercancía con actualización automática de existencias en el inventario.

### 6. 💰 Finanzas y Arqueo de Caja
* Apertura y Cierre de Turno / Caja con cálculo de sobrantes/faltantes.
* Registro de Gastos Operativos (Gasolina, Servicios, Viáticos, Mantenimiento).
* Balance financiero, utilidades netas y exportación de reportes.

### 7. 🔒 Seguridad y Auditoría
* Gestión de usuarios y contraseñas.
* Matriz de permisos por rol (`ADMIN`, `MANAGER`, `CASHIER`, `WAREHOUSE`, `PURCHASING`, `ACCOUNTANT`).
* Bitácora de auditoría en tiempo real (*Timeline de movimientos*).
* Sincronización y respaldo en la nube (Firestore / Local).

---

## 🛠️ Modo Desarrollo y Recompilación

El proyecto ya incluye el bundle de producción compilado en `assets/`, pero si realizas cambios en el código fuente en `mazal/src/`, sigue estos pasos para recompilar:

1. Abre una terminal de comandos (CMD o PowerShell) en la carpeta `mazal`:
   ```bash
   cd C:\xampp\htdocs\MAZAL_POS\mazal
   ```
2. Instala las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
3. Compila el proyecto para producción:
   ```bash
   npm run build
   ```
4. Copia los archivos generados en `dist` a la raíz de `MAZAL_POS`:
   ```bash
   xcopy /E /I /Y C:\xampp\htdocs\MAZAL_POS\mazal\dist\* C:\xampp\htdocs\MAZAL_POS\
   ```

---

## ❓ Solución de Problemas Frecuentes

### 1. Aparece el error "Error al conectar con MySQL":
* Verifica que el servicio **MySQL** esté iniciado y en verde en el panel de XAMPP.
* Comprueba que la base de datos `mazal_bd` exista en `http://localhost/phpmyadmin/`.

### 2. El ticket se imprime muy pequeño o se corta:
* En el diálogo de impresión de Chrome/Edge, asegúrate de colocar los **Márgenes en "Ninguno"** y la **Escala en "170%"**.

### 3. No permite modificar o eliminar un cliente:
* Verifica que hayas iniciado sesión con el usuario `admin`. Los roles de cajero o almacén tienen acceso restringido en modo consulta por seguridad contable.

---

## ⚡ Acceso Directo de Inicio Rápido (1-Clic)

Para facilitar el inicio diario en la computadora de cobro:
1. En el escritorio de Windows, crea un acceso directo al archivo:
   ```text
   C:\xampp\htdocs\MAZAL_POS\ABRIR_MAZAL_POS.bat
   ```
2. Al hacer doble clic, el script verificará e iniciará Apache y MySQL automáticamente y abrirá MAZAL POS en el navegador.

---
© MAZAL POS — Todos los derechos reservados. Distribuidor de productos desechables, plásticos y comestibles.
