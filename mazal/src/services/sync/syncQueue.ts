/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PendingOperation } from "../../types";

const QUEUE_STORAGE_KEY = "mazal_pending_sync_queue_v1";

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

export class SyncQueueManager {
  private queue: PendingOperation[] = [];

  constructor() {
    this.queue = this.loadQueue();
  }

  public getQueue(): PendingOperation[] {
    return [...this.queue];
  }

  public loadQueue(): PendingOperation[] {
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
  }

  public saveQueue(newQueue: PendingOperation[]): void {
    this.queue = newQueue;
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, encryptPayload(newQueue));
    } catch (e) {
      console.warn("Error saving offline queue to local storage:", e);
    }
  }

  public enqueue(
    params: Omit<PendingOperation, "id" | "timestamp" | "status" | "retries">
  ): PendingOperation {
    const newOp: PendingOperation = {
      ...params,
      id: "OP_" + Math.random().toString(36).substring(2, 9).toUpperCase() + "_" + Date.now(),
      timestamp: Date.now(),
      status: "PENDING",
      retries: 0,
    };

    const existingIdx = this.queue.findIndex(
      (q) => q.collectionName === newOp.collectionName && q.docId === newOp.docId && q.action === newOp.action
    );

    if (existingIdx >= 0) {
      this.queue[existingIdx] = newOp;
    } else {
      this.queue.push(newOp);
    }

    this.saveQueue(this.queue);
    return newOp;
  }

  public dequeue(opId: string): void {
    this.queue = this.queue.filter((q) => q.id !== opId);
    this.saveQueue(this.queue);
  }

  public clear(): void {
    this.queue = [];
    this.saveQueue(this.queue);
  }
}

export const syncQueueInstance = new SyncQueueManager();
