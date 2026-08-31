# Diagnóstico y Auditoría Arquitectónica del Sistema — MAZAL POS & ERP

**Fecha de Auditoría:** Agosto 2026  
**Versión del Sistema:** 2.5.0  
**Stack Principal:** React 19, TypeScript, Vite, Tailwind CSS, Supabase (Cloud Postgres), MySQL / PHP Backend, PWA Offline-First con IndexedDB.

---

## 1. Resumen Ejecutivo

MAZAL POS & ERP es un sistema integral de punto de venta, inventario multi-sucursal, finanzas, kárdex y distribución. El análisis del repositorio evidencia una base funcional altamente madura pero con una concentración de responsabilidades en archivos monolíticos. El propósito de este documento es catalogar las áreas críticas y definir la línea base cuantitativa y cualitativa antes de ejecutar la refactorización modular progresiva.

---

## 2. Inventario Cuantitativo de Código

Total de líneas analizadas en módulos clave: **> 30,000 líneas**.

| Archivo | Líneas | Dominio Principal | Acoplamiento / Problema | Nivel de Riesgo |
| :--- | :---: | :--- | :--- | :---: |
| `mazal/src/components/InventoryModule.tsx` | 3,499 | Inventario & Catálogo | Concentración de catálogo, kárdex, traspasos, importadores y modales. | **Alto** |
| `mazal/src/components/SecurityModule.tsx` | 3,032 | Seguridad & Auditoría | Gestión de usuarios, matriz RBAC, visor de logs y políticas de contraseñas. | **Alto** |
| `api.php` | 2,512 | Backend PHP / MySQL | CRUD completo de todas las entidades, endpoints de autenticación y fallback. | **Medio** |
| `mazal/src/components/POSModule.tsx` | 2,328 | Punto de Venta | Lógica de cálculo comercial, lectura de báscula, ticketera y carrito en UI. | **Alto** |
| `mazal/src/components/CentralWarehouseModule.tsx` | 2,273 | Almacén Central & Distribución | Control de despachos, recepciones inter-sucursal y control de mermas. | **Medio** |
| `mazal/src/data.ts` | 2,170 | Capa de Datos & Estado | Persistencia local, cliente HTTP, catálogos iniciales y transformaciones. | **Crítico** |
| `mazal/src/components/FinanceModule.tsx` | 2,114 | Tesorería & Finanzas | Cuentas bancarias, sesiones de caja chica, gastos y conciliación. | **Medio** |
| `mazal/src/App.tsx` | 1,305 | Orquestador Global | Navegación manual, estados globales de sucursal, alertas y modales. | **Crítico** |
| `mazal/src/components/CustomersModule.tsx` | 1,211 | Clientes & Crédito | CRUD de clientes, historial de compras, límites de crédito y abonos. | **Medio** |
| `mazal/src/components/PurchasesModule.tsx` | 1,134 | Compras & Proveedores | Órdenes de compra, recepción de mercancía y actualización de costos. | **Medio** |
| `mazal/src/services/supabaseSync.ts` | 1,076 | Sincronización Supabase | Sincronización monolítica de todas las entidades en una sola clase. | **Alto** |
| `mazal/src/components/LoginAndCatalog.tsx` | 1,053 | Auth & Catálogo Kiosco | Mezcla de login de operadores y catálogo público de consulta. | **Medio** |
| `mazal/src/components/ReportsModule.tsx` | 904 | Reportes & Métricas | Cálculos de utilidad y gráficos Recharts dentro del ciclo de React. | **Bajo** |
| `mazal/src/utils/TicketPrinter.ts` | 692 | Impresión Térmica | Formateo e impresión física de tickets ESC/POS y DOM. | **Bajo** |
| `mazal/src/types.ts` | 652 | Tipos Globales | Definición centralizada de todas las interfaces del sistema. | **Medio** |
| `mazal/src/services/offlineSync.ts` | 502 | Cola Offline | Gestión de cola de operaciones y sincronización diferida. | **Medio** |
| `server.js` | 475 | Backend Node / Express | Servidor proxy de producción y healthcheck. | **Bajo** |

---

## 3. Puntos Críticos y Hallazgos Arquitectónicos

### 3.1 Acoplamiento de Lógica de Negocio en Componentes React
En `POSModule.tsx`, `InventoryModule.tsx` y `FinanceModule.tsx`, reglas de negocio críticas (tales como cálculo de descuentos escalonados por volumen, impuestos, redondeo a 4 decimales y conciliación de saldos) residen directamente dentro de callbacks de eventos (`onClick`, `onChange`).
* **Impacto:** Imposibilidad de realizar pruebas unitarias automatizadas sin montar el árbol completo del DOM de React.

### 3.2 Monolitos de Sincronización (`supabaseSync.ts` y `offlineSync.ts`)
Ambos módulos concentran en un único punto la serialización, reintento, detección de conflictos y actualización de tablas heterogéneas (ventas, inventario, compras, clientes, finanzas).
* **Impacto:** Una modificación en el esquema de sincronización de compras puede introducir regresiones involuntarias en el flujo de ventas o inventario.

### 3.3 Concentración de Tipos en `types.ts`
El archivo `types.ts` alberga más de 30 interfaces y enums de dominios dispares (básculas, vehículos, cuentas bancarias, kárdex, productos).
* **Impacto:** Dificultad para localizar contratos de datos específicos y alto consumo de contexto en herramientas de desarrollo asistido.

### 3.4 Persistencia Híbrida y Fallbacks en `data.ts`
`data.ts` maneja simultáneamente:
1. Semillas de datos en memoria.
2. Sincronización con `localStorage` e `IndexedDB`.
3. Peticiones HTTP a `api.php`.
4. Dispersión de estados entre sucursales (`Norte`, `Sur`, `Centro`, `Matriz`).

---

## 4. Estrategia de Mitigación y Objetivos de Calidad

1. **Descomposición por Dominios (Feature-Driven):** Migrar de una estructura plana a carpetas de dominio (`features/`, `domain/`, `services/sync/`).
2. **Capas Puras de Dominio:** Extraer funciones comerciales a archivos puros libres de dependencias de React (`domain/sales/`, `domain/inventory/`, etc.).
3. **Contratos de Compatibilidad:** Uso riguroso del patrón Barril (`index.ts`) para mantener intactos los puntos de entrada existentes (`import { Product } from './types'`).
4. **Validación Continua:** Ninguna fase de refactorización se considera terminada sin superar `tsc --noEmit` y `npm run build`.
