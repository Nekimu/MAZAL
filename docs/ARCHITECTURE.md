# Arquitectura Modular del Sistema — MAZAL POS & ERP

**Documento de Arquitectura de Software**  
**Versión:** 2.5.0  
**Fecha:** Agosto 2026  

---

## 1. Principios de Diseño

1. **Separación Estricta de Responsabilidades:** Cada capa (UI, Dominio, Servicios, Persistencia) posee un propósito único y bien delimitado.
2. **Independencia del Dominio:** Las reglas comerciales de cálculo de ventas, utilidades, inventario y finanzas son funciones puras independientes de React y del navegador.
3. **Offline-First Resiliente:** La aplicación opera con normalidad sin conexión a Internet, almacenando operaciones pendientes en cola local y resolviendo sincronizaciones al recuperar enlace.
4. **Idempotencia Garantizada:** Toda operación sincronizada posee un identificador único (UUID) que impide duplicidades comerciales en caso de retransmisiones.

---

## 2. Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Capa de Presentación (UI)                        │
│             React 19 + Tailwind CSS + Lucide Icons + Recharts           │
│           features/{pos, inventory, finance, security, ...}             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Invoca
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Capa de Hooks & Controladores                       │
│     useSales(), useInventory(), useCashSession(), useAuthSession()      │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│        Capa de Dominio (Pure)         │ │       Capa de Servicios       │
│    Reglas comerciales, validación,    │ │  AuthService, TicketPrinter,  │
│      cálculos, redondeos a 4 dec.     │ │   WeightService, SyncEngine   │
└───────────────────┬───────────────────┘ └───────────────┬───────────────┘
                    │                                     │
                    └──────────────────┬──────────────────┘
                                       │ Persiste / Sincroniza
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Capa de Acceso a Datos & Sync                       │
│    • Supabase Postgres (Cloud)   • MySQL / PHP API    • IndexedDB / LS  │
│    • SyncQueue & Engine          • ConflictResolver   • RetryStrategy   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Estructura de Directorios Modular

```
mazal/src/
├── app/
│   ├── App.tsx                     # Orquestador y layout principal
│   ├── routes.tsx                  # Enrutador y renderizador modular de vistas
│   └── providers/                  # Contextos de autenticación, sucursal y notificaciones
│
├── features/                       # Módulos encapsulados por dominio
│   ├── auth/                       # Login, selector de sucursal, recuperación
│   ├── pos/                        # Punto de venta, carrito, cobro, báscula
│   ├── inventory/                  # Catálogo, kárdex, stock, importación
│   ├── warehouse/                  # Almacén central, traspasos y recepciones
│   ├── cash/                       # Sesiones de caja chica, cortes X y Z
│   ├── expenses/                   # Gastos de operación y clasificación
│   ├── purchases/                  # Proveedores, órdenes y compras
│   ├── customers/                  # Clientes, estados de cuenta y crédito
│   ├── finance/                    # Cuentas bancarias y balance financiero
│   ├── reports/                    # Dashboard analítico, utilidades y reportes
│   └── security/                   # Usuarios, roles RBAC y auditoría
│
├── domain/                         # Lógica comercial pura (Zero React)
│   ├── sales/                      # calculateSaleTotals(), applyDiscount()
│   ├── inventory/                  # calculateKardexDelta(), validateStock()
│   ├── cash/                       # calculateCashBalance(), validateSessionClose()
│   └── finance/                    # calculateBalances(), formatCurrency()
│
├── services/                       # Integraciones de infraestructura
│   ├── api/                        # Cliente HTTP y adaptadores REST/PHP
│   ├── auth/                       # TokenManager, SessionManager, RBACGuard
│   ├── hardware/                   # WeightService (Básculas), TicketPrinter
│   └── sync/                       # Arquitectura de sincronización desacoplada
│       ├── syncEngine.ts           # Coordinador central de sincronización
│       ├── syncQueue.ts            # Gestor de cola local (IndexedDB)
│       ├── conflictResolver.ts     # Estrategia de resolución de conflictos
│       └── adapters/               # Adaptadores especializados por entidad
│
├── types/                          # Contratos de tipos desacoplados
│   ├── auth.types.ts
│   ├── product.types.ts
│   ├── sale.types.ts
│   ├── inventory.types.ts
│   ├── finance.types.ts
│   ├── sync.types.ts
│   └── index.ts                    # Re-exportador compatible
│
└── components/ui/                  # Primitivas UI reutilizables
```

---

## 4. Convenciones y Reglas de Dependencia

1. **Flujo Unidireccional de Dependencias:**  
   `UI (Features)` ➔ `Hooks` ➔ `Domain / Services` ➔ `Data Access / Storage`.  
   *Prohibido que `domain/` o `services/` importen componentes visuales de React.*
2. **Inmutabilidad de Datos:** Los estados de dominio no se mutan directamente; se devuelven nuevas estructuras clonadas.
3. **Formatos Numéricos y Redondeos:**  
   Todos los cálculos monetarios respetan el redondeo de precisión (`formatPrice`) a 4 decimales internos y 2 decimales para visualización general.
