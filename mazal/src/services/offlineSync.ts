import { PendingOperation, PendingOperationType, OfflineSyncState } from "../types";
import { supabase, isSupabaseConfigured, ensureSupabaseConfigured, getSupabaseClient } from "../supabase";

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
      PRODUCT: 3,
      PURCHASE: 4,
      SALE: 5,
      CASH_SESSION: 6,
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
          await client.from(table).upsert({
            id: String(op.docId),
            ...(op.payload || {})
          }, { onConflict: "id" });
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

// Automatic Network Event Listeners
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    isOnline = true;
    notifySubscribers();
    console.log("🌐 Conexión detectada: Ejecutando Offline Sync Manager...");
    triggerAutoSync();
  });

  window.addEventListener("offline", () => {
    isOnline = false;
    notifySubscribers();
    console.warn("🔴 Modo sin conexión activo: Todas las operaciones se guardarán localmente.");
  });
}
