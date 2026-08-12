# MAZAL - Sistema POS, Almacén, Mayoreo y Control Empresarial

Sistema integral de Punto de Venta (POS), administración de inventario, cálculo automático de precios por medio mayoreo / mayoreo, facturación, auditoría y control de usuarios.

---

## 🚀 Instrucciones para Ejecutar y Compilar desde el Archivo ZIP

### 1. Requisitos Previos
- **Node.js** (versión 18 o superior recomendada). Puedes descargarlo en [nodejs.org](https://nodejs.org/).

---

### 2. Descomprimir el Proyecto
Extrae el contenido del archivo `.zip` en una carpeta local de tu computadora.

---

### 3. Instalación de Dependencias
Abre una terminal (Símbolo del sistema, PowerShell o Terminal) en la carpeta donde descomprimiste el proyecto y ejecuta:

```bash
npm install
```

---

### 4. Modo Desarrollo (Local)
Para iniciar el servidor de desarrollo local con recarga en vivo:

```bash
npm run dev
```
Abre tu navegador web en la dirección indicada por la terminal (generalmente `http://localhost:5173`).

---

### 5. Compilación para Producción (Build)
Para generar la versión optimizada y compilada lista para producción o despliegue:

```bash
npm run build
```
- Este comando generará una carpeta llamada `dist/` con todos los archivos estáticos HTML, CSS y JavaScript optimizados.

Para previsualizar la versión compilada localmente:

```bash
npm run preview
```

---

## ⚡ Roles y Acceso Rápido
- **Catálogo Público**: Vista abierta para consultar productos, comparar precios unitarios, medio mayoreo y mayoreo.
- **Acceso Invitado (Venta Rápida)**: Permite ingresar directamente con NIP de autorización de 4 dígitos para operar la caja registradora de inmediato.
- **Administrador / Gerente / Cajero**: Sistema completo con módulos de Tablero, Caja POS, Almacén, Compras, Finanzas, Recibos y Seguridad.
