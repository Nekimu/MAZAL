import { PendingOperation, PendingOperationType, OfflineSyncState } from "../types";
import { ensureSupabaseConfigured, getSupabaseClient } from "../supabase";
import { mapLocalProductToDb } from "./supabaseSync";

const QUEUE_STORAGE_KEY = "mazal_pending_sync_queue_v1";
const LAST_SYNC_KEY = "mazal_last_sync_timestamp";

// Obfuscate / encrypt sensitive local payload data in local storage
const encryptPayload = (data: any): string => {
  try {
    const jsonStr = JSON.stringify(data);
    return btoa(encodeURIComponent(jsonStr));
  } catch (e) {
    return JSON.stringify(data);
  }
};

const decryptPayload = (str: string): any => {
  try {
    const decoded = decodeURIComponent(atob(str));
    return JSON.parse(decoded);
  } catch (e) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }
};

// Internal State
let pendingQueue: PendingOperation[] = [];
let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
let isSyncing = false;
let lastSyncTime: string | null = typeof window !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null;
let syncErrorsCount = 0;

const subscribers = new Set<(state: OfflineSyncState) => void>();

// Load Queue from Local Storage
const loadQueueFromStorage = (): PendingOperation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) {
      const items = decryptPayload(raw);
      if (Array.isArray(items)) return items;
    }
  } catch (e) {
    console.warn("Error loading offline queue from local storage:", e);
  }
  return [];
};

// Save Queue to Local Storage
const saveQueueToStorage = (queue: PendingOperation[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, encryptPayload(queue));
  } catch (e) {
    console.warn("Error saving offline queue to local storage:", e);
  }
};

// Initialize queue
pendingQueue = loadQueueFromStorage();

export const getOfflineState = (): OfflineSyncState => {
  const pendingByType = {
    sales: pendingQueue.filter((q) => q.type === "SALE").length,
    products: pendingQueue.filter((q) => q.type === "PRODUCT").length,
    movements: pendingQueue.filter((q) => q.type === "INVENTORY_MOVEMENT").length,
    customers: pendingQueue.filter((q) => q.type === "CUSTOMER").length,
    other: pendingQueue.filter(
      (q) => !["SALE", "PRODUCT", "INVENTORY_MOVEMENT", "CUSTOMER"].includes(q.type)
    ).length,
  };

  const conflicts = pendingQueue.filter((q) => q.status === "CONFLICT");

  return {
    isOnline,
    isSyncing,
    pendingCount: pendingQueue.length,
    lastSyncTime,
    syncErrorsCount,
    pendingByType,
    conflicts,
  };
};

export const subscribeOfflineSyncState = (
  callback: (state: OfflineSyncState) => void
) => {
  subscribers.add(callback);
  callback(getOfflineState());
  return () => {
    subscribers.delete(callback);
  };
};

const notifySubscribers = () => {
  const state = getOfflineState();
  subscribers.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error("Offline Sync subscriber error:", e);
    }
  });
};

// Queue operations
export const enqueueOperation = (
  params: Omit<PendingOperation, "id" | "timestamp" | "status" | "retries">
): PendingOperation => {
  const newOp: PendingOperation = {
    ...params,
    id: "OP_" + Math.random().toString(36).substring(2, 9).toUpperCase() + "_" + Date.now(),
    timestamp: Date.now(),
    status: "PENDING",
    retries: 0,
  };

  // Replace or append
  const existingIdx = pendingQueue.findIndex(
    (q) => q.collectionName === newOp.collectionName && q.docId === newOp.docId && q.action === newOp.action
  );

  if (existingIdx >= 0) {
    pendingQueue[existingIdx] = newOp;
  } else {
    pendingQueue.push(newOp);
  }

  saveQueueToStorage(pendingQueue);
  notifySubscribers();

  // If online, attempt immediate sync
  if (isOnline && !isSyncing) {
    triggerAutoSync();
  }

  return newOp;
};

export const dequeueOperation = (opId: string) => {
  pendingQueue = pendingQueue.filter((q) => q.id !== opId);
  saveQueueToStorage(pendingQueue);
  notifySubscribers();
};

export const clearPendingQueue = () => {
  pendingQueue = [];
  saveQueueToStorage(pendingQueue);
  notifySubscribers();
};

export function mapCollectionToSupabaseTable(colName: string): string {
  const cleanCol = colName.replace(/_(norte|sur|centro|bodega)$/i, "");
  const mapping: Record<string, string> = {
    products: "products",
    customers: "customers",
    suppliers: "suppliers",
    sales: "sales",
    movements: "stock_movements",
    stock_movements: "stock_movements",
    movimientos_inventario: "stock_movements",
    cashSessions: "cash_sessions",
    cash_sessions: "cash_sessions",
    expenses: "cash_expenses",
    cashExpenses: "cash_expenses",
    cash_expenses: "cash_expenses",
    purchaseOrders: "purchase_orders",
    purchase_orders: "purchase_orders",
    users: "users",
    branches: "branches",
    sucursales: "branches",
    branch_inventory: "branch_inventory",
    inventario_sucursal: "branch_inventory",
    bankAccounts: "bank_accounts",
    bank_accounts: "bank_accounts",
    bankMovements: "bank_movements",
    bank_movements: "bank_movements",
    budgets: "budgets",
    costCenters: "cost_centers",
    cost_centers: "cost_centers",
    vehicles: "vehicles",
    auditLogs: "audit_logs",
    audit_logs: "audit_logs",
    app_state: "app_state"
  };
  return mapping[cleanCol] || cleanCol;
}

// Auto Sync Algorithm with strict priority order:
export const triggerAutoSync = async (): Promise<{ success: boolean; syncedCount: number; errors: number }> => {
  if (isSyncing) return { success: false, syncedCount: 0, errors: syncErrorsCount };
  if (!isOnline) return { success: false, syncedCount: 0, errors: syncErrorsCount };
  if (pendingQueue.length === 0) {
    lastSyncTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (typeof window !== "undefined") localStorage.setItem(LAST_SYNC_KEY, lastSyncTime);
    notifySubscribers();
    return { success: true, syncedCount: 0, errors: 0 };
  }

  isSyncing = true;
  notifySubscribers();

  let syncedCount = 0;
  let errorsCount = 0;

  try {
    const isConfigured = await ensureSupabaseConfigured();
    if (!isConfigured) {
      isSyncing = false;
      return { success: true, syncedCount: 0, errors: 0 };
    }

    const client = getSupabaseClient();

    const priorityOrder: Record<PendingOperationType, number> = {
      INVENTORY_MOVEMENT: 1,
      CUSTOMER: 2,
      SUPPLIER: 2,
      USER: 2,
      PRODUCT: 3,
      PURCHASE: 4,
      SALE: 5,
      CASH_SESSION: 6,
      EXPENSE: 6,
      TRANSFER: 7,
      BRANCH_INVENTORY: 8,
    };

    const sortedQueue = [...pendingQueue].sort((a, b) => {
      const pA = priorityOrder[a.type] || 99;
      const pB = priorityOrder[b.type] || 99;
      if (pA !== pB) return pA - pB;
      return a.timestamp - b.timestamp;
    });

    for (const op of sortedQueue) {
      if (op.status === "CONFLICT") continue;

      op.status = "SYNCING";
      notifySubscribers();

      try {
        const table = mapCollectionToSupabaseTable(op.collectionName);

        if (op.action === "DELETE") {
          await client.from(table).delete().eq("id", String(op.docId));
        } else {
          let formattedPayload: any = { id: String(op.docId), ...(op.payload || {}) };

          if (op.type === "PRODUCT" || table === "products") {
            formattedPayload = mapLocalProductToDb(op.payload, op.branch || "Norte");
          } else if (op.type === "SALE" || table === "sales") {
            const s = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              ticket_number: s.ticketNumber || `TICK-${op.docId}`,
              total: Number(s.total || 0),
              cost_total: Number(s.costTotal || 0),
              profit: Number(s.profit || 0),
              payment_method: s.paymentMethod || "Efectivo",
              customer_id: s.customerId || null,
              customer_name: s.customerName || "Público General",
              user_id: s.userId || "USR_01",
              user_name: s.userName || "Cajero",
              date: s.date || new Date().toISOString(),
              amount_paid: Number(s.amountPaid || 0),
              change: Number(s.change || 0),
              sucursal: op.branch || s.sucursal || "Norte",
              items: s.items || [],
              raw_data: s
            };
          } else if (op.type === "CUSTOMER" || table === "customers") {
            const c = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              name: c.name || "Cliente",
              phone: c.phone || "",
              email: c.email || "",
              address: c.address || "",
              rfc: c.rfc || "",
              role: c.role || "Cliente Normal",
              credit_limit: Number(c.creditLimit || 0),
              credit_used: Number(c.creditUsed || 0),
              credit_days: Number(c.creditDays || 30),
              notes: c.notes || "",
              status: c.status || "Activo",
              raw_data: c,
              updated_at: new Date().toISOString()
            };
          } else if (op.type === "SUPPLIER" || table === "suppliers") {
            const supp = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              name: supp.name || "Proveedor",
              contact: supp.contact || "",
              phone: supp.phone || "",
              email: supp.email || "",
              address: supp.address || "",
              rfc: supp.rfc || "",
              outstanding_balance: Number(supp.outstandingBalance || supp.adeudo || 0),
              raw_data: supp,
              updated_at: new Date().toISOString()
            };
          } else if (op.type === "EXPENSE" || table === "cash_expenses") {
            const exp = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              description: exp.description || "Gasto",
              amount: Number(exp.amount || 0),
              category: exp.category || "General",
              date: exp.date || new Date().toISOString(),
              user_name: exp.user || exp.userName || "Admin",
              sucursal: op.branch || exp.sucursal || "Norte",
              raw_data: exp
            };
          } else if (op.type === "PURCHASE" || table === "purchase_orders") {
            const o = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              supplier_id: o.supplierId || null,
              supplier_name: o.supplierName || "",
              total: Number(o.total || 0),
              status: o.status || "Pendiente",
              date: o.date || new Date().toISOString().split("T")[0],
              received_date: o.receivedDate || null,
              payment_status: o.paymentStatus || "Pendiente",
              sucursal: op.branch || o.sucursal || "Norte",
              items: o.items || [],
              raw_data: o
            };
          } else if (op.type === "INVENTORY_MOVEMENT" || table === "stock_movements") {
            const m = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              product_id: String(m.productId || op.docId),
              product_name: m.productName || "",
              type: m.type || "AJUSTE",
              quantity: Number(m.quantity || 0),
              previous_stock: Number(m.previousStock || 0),
              new_stock: Number(m.newStock || 0),
              date: m.date || new Date().toISOString(),
              user_name: m.user || m.userName || "Admin",
              notes: m.notes || "",
              sucursal: op.branch || m.sucursal || "Norte",
              raw_data: m
            };
          } else if (op.type === "CASH_SESSION" || table === "cash_sessions") {
            const cs = op.payload || {};
            formattedPayload = {
              id: String(op.docId),
              start_time: cs.startTime || new Date().toISOString(),
              end_time: cs.endTime || null,
              opened_by: cs.openedBy || "Admin",
              initial_cash: Number(cs.initialCash || 0),
              final_cash: cs.finalCash !== undefined && cs.finalCash !== null ? Number(cs.finalCash) : null,
              status: cs.status || "Abierta",
              sales_total: Number(cs.salesTotal || 0),
              expenses_total: Number(cs.expensesTotal || 0),
              expected_final_cash: Number(cs.expectedFinalCash || 0),
              sucursal: op.branch || cs.sucursal || "Norte",
              raw_data: cs
            };
          }

          await client.from(table).upsert(formattedPayload, { onConflict: "id" });
        }

        dequeueOperation(op.id);
        syncedCount++;
      } catch (err: any) {
        console.error(`Error syncing pending op (${op.id}):`, err);
        op.status = "FAILED";
        op.retries = (op.retries || 0) + 1;
        op.errorMessage = err?.message || String(err);
        errorsCount++;
      }
    }

    lastSyncTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (typeof window !== "undefined") localStorage.setItem(LAST_SYNC_KEY, lastSyncTime);
  } catch (err) {
    console.error("Global Auto Sync error:", err);
    errorsCount++;
  } finally {
    isSyncing = false;
    syncErrorsCount = errorsCount;
    notifySubscribers();
  }

  return { success: errorsCount === 0, syncedCount, errors: errorsCount };
};

// Resolve Conflict
export const resolveConflict = async (
  opId: string,
  choice: "USE_LOCAL" | "USE_CLOUD" | "MERGE",
  mergedData?: any
) => {
  const op = pendingQueue.find((q) => q.id === opId);
  if (!op) return;

  try {
    const table = mapCollectionToSupabaseTable(op.collectionName);
    const isConfigured = await ensureSupabaseConfigured();

    if (isConfigured) {
      const client = getSupabaseClient();
      if (choice === "USE_LOCAL") {
        await client.from(table).upsert(op.payload, { onConflict: "id" });
      } else if (choice === "MERGE" && mergedData) {
        await client.from(table).upsert(mergedData, { onConflict: "id" });
      }
    }

    dequeueOperation(opId);
    notifySubscribers();
  } catch (e) {
    console.error("Error resolving conflict:", e);
  }
};

// Simulated / Forced Offline Mode
const FORCED_OFFLINE_KEY = "mazal_forced_offline";
let isForcedOffline = typeof window !== "undefined" ? localStorage.getItem(FORCED_OFFLINE_KEY) === "true" : false;

if (isForcedOffline) {
  isOnline = false;
}

export const setForcedOffline = (forced: boolean) => {
  isForcedOffline = forced;
  if (typeof window !== "undefined") {
    localStorage.setItem(FORCED_OFFLINE_KEY, forced ? "true" : "false");
  }
  isOnline = forced ? false : (typeof navigator !== "undefined" ? navigator.onLine : true);
  notifySubscribers();
  if (isOnline) {
    triggerAutoSync();
  }
};

export const isForcedOfflineMode = (): boolean => {
  return isForcedOffline;
};

// Automatic Network Event Listeners & Active Connectivity
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!isForcedOffline) {
      isOnline = true;
      notifySubscribers();
      console.log("🌐 Conexión detectada: Ejecutando Offline Sync Manager...");
      triggerAutoSync();
    }
  });

  window.addEventListener("offline", () => {
    isOnline = false;
    notifySubscribers();
    console.warn("🔴 Modo sin conexión activo: Todas las operaciones se guardarán localmente.");
  });
}
