import { PendingOperation, PendingOperationType, OfflineSyncState } from "../types";
import { doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { firestore, ensureAuth } from "../firebase";

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

// Auto Sync Algorithm with strict priority order:
// 1. Inventario -> 2. Clientes -> 3. Productos -> 4. Compras -> 5. Ventas -> 6. Caja -> 7. Otros
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
    await ensureAuth();

    // Sort queue by requested priority
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
      // Skip manually flagged conflicts until resolved by user
      if (op.status === "CONFLICT") continue;

      op.status = "SYNCING";
      notifySubscribers();

      try {
        const docRef = doc(firestore, op.collectionName, op.docId);

        if (op.action === "DELETE") {
          await deleteDoc(docRef);
        } else {
          // Check for cloud version if it's an update to detect potential conflicts
          if (op.action === "UPDATE") {
            try {
              const cloudSnap = await getDoc(docRef);
              if (cloudSnap.exists()) {
                const cloudData = cloudSnap.data();
                // Compare timestamps if cloud data was updated after local op was created
                if (cloudData.updatedAt && new Date(cloudData.updatedAt).getTime() > op.timestamp) {
                  op.status = "CONFLICT";
                  op.conflictDetails = {
                    localData: op.payload,
                    cloudData: cloudData,
                    detectedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
                  };
                  saveQueueToStorage(pendingQueue);
                  notifySubscribers();
                  continue;
                }
              }
            } catch (e) {
              // Ignore read check error and proceed with setDoc
            }
          }

          await setDoc(docRef, op.payload);
        }

        // Successfully synced
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
    const docRef = doc(firestore, op.collectionName, op.docId);

    if (choice === "USE_LOCAL") {
      await setDoc(docRef, op.payload);
    } else if (choice === "USE_CLOUD") {
      // Drop local operation and accept cloud version
    } else if (choice === "MERGE" && mergedData) {
      await setDoc(docRef, mergedData);
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
