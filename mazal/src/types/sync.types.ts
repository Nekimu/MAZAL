/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PendingOperationType =
  | "SALE"
  | "INVENTORY_MOVEMENT"
  | "CUSTOMER"
  | "SUPPLIER"
  | "EXPENSE"
  | "USER"
  | "PRODUCT"
  | "PURCHASE"
  | "CASH_SESSION"
  | "TRANSFER"
  | "BRANCH_INVENTORY";

export interface PendingOperation {
  id: string; // Unique UUID
  type: PendingOperationType;
  timestamp: number;
  isoDate: string;
  branch: string;
  user: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  collectionName: string;
  docId: string;
  payload: any;
  status: "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";
  retries: number;
  errorMessage?: string;
  conflictDetails?: {
    localData: any;
    cloudData: any;
    detectedAt: string;
  };
}

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  syncErrorsCount: number;
  pendingByType: {
    sales: number;
    products: number;
    movements: number;
    customers: number;
    other: number;
  };
  conflicts: PendingOperation[];
}
