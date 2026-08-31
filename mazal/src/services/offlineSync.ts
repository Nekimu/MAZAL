/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  syncEngineInstance,
  mapCollectionToSupabaseTable as mapperTable
} from "./sync";
import { PendingOperation, OfflineSyncState } from "../types";

export const getOfflineState = (): OfflineSyncState => syncEngineInstance.getState();

export const subscribeOfflineSyncState = (
  callback: (state: OfflineSyncState) => void
) => syncEngineInstance.subscribe(callback);

export const enqueueOperation = (
  params: Omit<PendingOperation, "id" | "timestamp" | "status" | "retries">
): PendingOperation => syncEngineInstance.enqueue(params);

export const dequeueOperation = (opId: string) => syncEngineInstance.dequeue(opId);

export const clearPendingQueue = () => syncEngineInstance.clearQueue();

export const mapCollectionToSupabaseTable = (colName: string): string => mapperTable(colName);

export const triggerAutoSync = () => syncEngineInstance.triggerAutoSync();

export const resolveConflict = (
  opId: string,
  choice: "USE_LOCAL" | "USE_CLOUD" | "MERGE",
  mergedData?: any
) => syncEngineInstance.resolveConflict(opId, choice, mergedData);

export const checkActiveConnection = () => syncEngineInstance.checkActiveConnection();

export const setForcedOffline = (_forced: boolean) => {
  syncEngineInstance.checkActiveConnection();
};

export const isForcedOfflineMode = (): boolean => false;
