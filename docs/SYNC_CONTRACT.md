# Contrato de Sincronización e Idempotencia Offline-First — MAZAL POS & ERP

**Documento de Especificación de Sincronización**  
**Versión:** 2.5.0  
**Fecha:** Agosto 2026  

---

## 1. Principio Fundamental de Sincronización

> **«Una operación procesada múltiples veces por la red o por reintentos debe producir exactamente el mismo estado empresarial en el sistema (Idempotencia Estricta).»**

---

## 2. Estructura de la Operación de Sincronización (`PendingOperation`)

Cada mutación de datos generada localmente en modo offline o conectividad intermitente se encapsula en el siguiente esquema:

```typescript
export interface PendingOperation {
  id: string;                      // UUID v4 único generado en el cliente
  type: PendingOperationType;      // 'SALE' | 'INVENTORY_MOVEMENT' | 'EXPENSE' | ...
  timestamp: number;               // Timestamp Unix en milisegundos
  isoDate: string;                 // Fecha ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
  branch: string;                  // Sucursal de origen ('Norte', 'Sur', 'Matriz', etc.)
  user: string;                    // Operador que generó la acción
  action: "CREATE" | "UPDATE" | "DELETE";
  collectionName: string;          // Tabla destino en Supabase / MySQL
  docId: string;                   // Identificador de la entidad afectada
  payload: Record<string, any>;    // Datos completos de la entidad
  status: "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";
  retries: number;                 // Contador de intentos fallidos
  errorMessage?: string;           // Detalle técnico del último fallo
  conflictDetails?: {
    localData: any;
    cloudData: any;
    detectedAt: string;
  };
}
```

---

## 3. Protocolo de Procesamiento y Ciclo de Vida

```
 [Operación Local] ──► [Insertar en Cola (IndexedDB)]
                              │
                              ▼
                   [¿Hay conexión activa?]
                     /                \
                   (No)              (Sí)
                    │                  │
            [Esperar evento            ▼
             'online' / Ping]   [Adquirir Lock de Sync]
                                       │
                                       ▼
                             [Validar Idempotencia]
                             (¿Ya existe docId/UUID?)
                               /              \
                             (Sí)            (No)
                              │                │
                      [Marcar Éxito /    [Ejecutar Transacción
                       Omitir Duplicado]  Remota en Supabase]
                                               │
                                               ▼
                                      [Eliminar de Cola]
```

### 3.1 Manejo de Reintentos y Retroceso Exponencial (Exponential Backoff)
1. **Intento 1:** Inmediato al detectar red.
2. **Intento 2:** Tras 3 segundos.
3. **Intento 3:** Tras 10 segundos.
4. **Intento 4+:** Intervalo exponencial hasta un tope de 60 segundos con advertencia visual al operador en `OfflineDashboardWidget`.

### 3.2 Estrategias de Resolución de Conflictos

1. **Ventas y Transacciones de Caja (`SALE`, `EXPENSE`, `CREDIT_PAYMENT`):**  
   *Estrategia Append-Only.* Las ventas no se sobreescriben; se insertan como registros inmutables con su `id` único.
2. **Movimientos de Inventario (`INVENTORY_MOVEMENT`):**  
   *Estrategia Kárdex Delta.* El stock se recalcula aplicando el delta numérico (`+cantidad` o `-cantidad`) en lugar de fijar un stock absoluto estático proveniente del cliente offline.
3. **Catálogo de Productos y Clientes (`PRODUCT`, `CUSTOMER`):**  
   *Estrategia Last-Write-Wins (LWW) con salvaguarda.* Si el registro remoto tiene una fecha de actualización (`updated_at`) posterior a la fecha local, se notifica el conflicto en el panel de sincronización para resolución manual o fusión de campos.
