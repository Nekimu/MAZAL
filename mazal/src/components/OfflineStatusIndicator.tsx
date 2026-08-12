import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Layers } from "lucide-react";
import { subscribeOfflineSyncState, getOfflineState } from "../services/offlineSync";
import { OfflineSyncState } from "../types";
import { OfflineSyncPanelModal } from "./OfflineSyncPanelModal";

export const OfflineStatusIndicator: React.FC = () => {
  const [syncState, setSyncState] = useState<OfflineSyncState>(getOfflineState());
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeOfflineSyncState((newState) => {
      setSyncState(newState);
    });
    return () => unsub();
  }, []);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black shadow-xs transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
          syncState.isSyncing
            ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse"
            : syncState.isOnline
            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-500/20"
            : "bg-rose-500 text-white border-rose-600 shadow-rose-500/20 animate-bounce"
        }`}
        title="Estado de Conexión y Sincronización (Haz clic para abrir el panel)"
      >
        <div className="relative flex items-center justify-center">
          {syncState.isSyncing ? (
            <RefreshCw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
          ) : syncState.isOnline ? (
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-white" />
          )}
        </div>

        <span className="tracking-tight">
          {syncState.isSyncing
            ? "Sincronizando..."
            : syncState.isOnline
            ? "En línea"
            : "Trabajando sin conexión"}
        </span>

        {syncState.pendingCount > 0 && (
          <span className="flex items-center gap-1 bg-amber-500 text-slate-900 font-mono text-[10px] font-black px-1.5 py-0.2 rounded-full">
            <Layers className="h-2.5 w-2.5" />
            {syncState.pendingCount}
          </span>
        )}
      </button>

      <OfflineSyncPanelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
