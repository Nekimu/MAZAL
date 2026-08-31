/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PendingOperation, PendingOperationType, OfflineSyncState } from "../../types";
import { ensureSupabaseConfigured, getSupabaseClient } from "../../supabase";
import { mapLocalProductToDb } from "../supabaseSync";
import { syncQueueInstance } from "./syncQueue";
import { mapCollectionToSupabaseTable, formatEntityPayload } from "./entityMappers";

const LAST_SYNC_KEY = "mazal_last_sync_timestamp";

export class SyncEngine {
  private isOnline: boolean = typeof navigator !== "undefined" ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private lastSyncTime: string | null = typeof window !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null;
  private syncErrorsCount: number = 0;
  private subscribers = new Set<(state: OfflineSyncState) => void>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.checkActiveConnection();
      });
      window.addEventListener("offline", () => {
        this.isOnline = false;
        this.notify();
      });
      setInterval(() => this.checkActiveConnection(), 6000);
      setTimeout(() => this.checkActiveConnection(), 1000);
    }
  }

  public getState(): OfflineSyncState {
    const queue = syncQueueInstance.getQueue();
    const pendingByType = {
      sales: queue.filter((q) => q.type === "SALE").length,
      products: queue.filter((q) => q.type === "PRODUCT").length,
      movements: queue.filter((q) => q.type === "INVENTORY_MOVEMENT").length,
      customers: queue.filter((q) => q.type === "CUSTOMER").length,
      other: queue.filter(
        (q) => !["SALE", "PRODUCT", "INVENTORY_MOVEMENT", "CUSTOMER"].includes(q.type)
      ).length,
    };

    const conflicts = queue.filter((q) => q.status === "CONFLICT");

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: queue.length,
      lastSyncTime: this.lastSyncTime,
      syncErrorsCount: this.syncErrorsCount,
      pendingByType,
      conflicts,
    };
  }

  public subscribe(callback: (state: OfflineSyncState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public notify(): void {
    const state = this.getState();
    this.subscribers.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error("SyncEngine subscriber error:", e);
      }
    });
  }

  public enqueue(
    params: Omit<PendingOperation, "id" | "timestamp" | "status" | "retries">
  ): PendingOperation {
    const op = syncQueueInstance.enqueue(params);
    this.notify();
    if (this.isOnline && !this.isSyncing) {
      this.triggerAutoSync();
    }
    return op;
  }

  public dequeue(opId: string): void {
    syncQueueInstance.dequeue(opId);
    this.notify();
  }

  public clearQueue(): void {
    syncQueueInstance.clear();
    this.notify();
  }

  public async triggerAutoSync(): Promise<{ success: boolean; syncedCount: number; errors: number }> {
    if (this.isSyncing || !this.isOnline) {
      return { success: false, syncedCount: 0, errors: this.syncErrorsCount };
    }

    const queue = syncQueueInstance.getQueue();
    if (queue.length === 0) {
      this.lastSyncTime = new Date().toISOString().replace("T", " ").substring(0, 19);
      if (typeof window !== "undefined") localStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime);
      this.notify();
      return { success: true, syncedCount: 0, errors: 0 };
    }

    this.isSyncing = true;
    this.notify();

    let syncedCount = 0;
    let errorsCount = 0;

    try {
      const isConfigured = await ensureSupabaseConfigured();
      if (!isConfigured) {
        this.isSyncing = false;
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

      const sortedQueue = [...queue].sort((a, b) => {
        const pA = priorityOrder[a.type] || 99;
        const pB = priorityOrder[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return a.timestamp - b.timestamp;
      });

      for (const op of sortedQueue) {
        if (op.status === "CONFLICT") continue;

        op.status = "SYNCING";
        this.notify();

        try {
          const table = mapCollectionToSupabaseTable(op.collectionName);

          if (op.action === "DELETE") {
            await client.from(table).delete().eq("id", String(op.docId));
          } else {
            let formattedPayload: any;
            if (op.type === "PRODUCT" || table === "products") {
              formattedPayload = mapLocalProductToDb(op.payload, op.branch || "Norte");
            } else {
              formattedPayload = formatEntityPayload(op.type, table, op.docId, op.payload, op.branch || "Norte");
            }
            await client.from(table).upsert(formattedPayload, { onConflict: "id" });
          }

          this.dequeue(op.id);
          syncedCount++;
        } catch (err: any) {
          console.error(`Error syncing op (${op.id}):`, err);
          op.status = "FAILED";
          op.retries = (op.retries || 0) + 1;
          op.errorMessage = err?.message || String(err);
          errorsCount++;
        }
      }

      this.lastSyncTime = new Date().toISOString().replace("T", " ").substring(0, 19);
      if (typeof window !== "undefined") localStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime);
    } catch (err) {
      console.error("Global Auto Sync error:", err);
      errorsCount++;
    } finally {
      this.isSyncing = false;
      this.syncErrorsCount = errorsCount;
      this.notify();
    }

    return { success: errorsCount === 0, syncedCount, errors: errorsCount };
  }

  public async resolveConflict(
    opId: string,
    choice: "USE_LOCAL" | "USE_CLOUD" | "MERGE",
    mergedData?: any
  ): Promise<void> {
    const queue = syncQueueInstance.getQueue();
    const op = queue.find((q) => q.id === opId);
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

      this.dequeue(opId);
    } catch (e) {
      console.error("Error resolving conflict:", e);
    }
  }

  public async checkActiveConnection(): Promise<boolean> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (this.isOnline) {
        this.isOnline = false;
        this.notify();
      }
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const probeUrl = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
      await fetch(probeUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const wasOffline = !this.isOnline;
      this.isOnline = true;

      if (wasOffline) {
        this.notify();
        this.triggerAutoSync();
      }
      return true;
    } catch (e) {
      const wasOnline = this.isOnline;
      this.isOnline = false;
      if (wasOnline) {
        this.notify();
      }
      return false;
    }
  }
}

export const syncEngineInstance = new SyncEngine();
