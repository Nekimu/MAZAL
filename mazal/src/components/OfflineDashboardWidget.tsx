import React, { useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Cloud,
  CheckCircle2,
  Clock,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Server
} from "lucide-react";
import { getOfflineState, subscribeOfflineSyncState, triggerAutoSync } from "../services/offlineSync";
import { OfflineSyncState } from "../types";
import { OfflineSyncPanelModal } from "./OfflineSyncPanelModal";

export const OfflineDashboardWidget: React.FC = () => {
  const [syncState, setSyncState] = useState<OfflineSyncState>(getOfflineState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeOfflineSyncState((newState) => {
      setSyncState(newState);
    });
    return () => unsub();
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await triggerAutoSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs relative overflow-hidden transition-all hover:shadow-md">
        {/* Background Decorative Accent */}
        <div
          className={`absolute -right-6 -bottom-6 w-28 h-28 rounded-full opacity-10 pointer-events-none ${
            syncState.isOnline ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                syncState.isOnline
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
              }`}
            >
              {syncState.isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                Estado del Motor Offline First
                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  ACTIVO
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Garantía de ventas e inventario sin internet</p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 cursor-pointer hover:underline"
          >
            Ver Detalles <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Grid Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
              Estado de Internet
              {syncState.isOnline ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-rose-500" />}
            </div>
            <div className={`font-black text-sm ${syncState.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {syncState.isOnline ? "🟢 En línea" : "🔴 Sin Conexión"}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
              Operaciones Pendientes
              <Layers className="h-3 w-3 text-amber-500" />
            </div>
            <div className="font-black text-sm text-amber-600 dark:text-amber-400 font-mono">
              {syncState.pendingCount} en cola
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
              Última Sincronización
              <Clock className="h-3 w-3 text-blue-500" />
            </div>
            <div className="font-black text-xs text-slate-800 dark:text-slate-200 truncate">
              {syncState.lastSyncTime ? syncState.lastSyncTime.split(" ")[1] || syncState.lastSyncTime : "Hace un momento"}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
              Base Local
              <Database className="h-3 w-3 text-purple-500" />
            </div>
            <div className="font-black text-xs text-emerald-600 dark:text-emerald-400">
              Cifrada & Lista
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <Cloud className="h-3.5 w-3.5 text-emerald-500" />
            <span>Base Nube: Firebase Firestore Enterprise</span>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing || syncState.isSyncing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || syncState.isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing || syncState.isSyncing ? "Sincronizando..." : "Sincronizar Ahora"}</span>
          </button>
        </div>
      </div>

      <OfflineSyncPanelModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
