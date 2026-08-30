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
  ChevronDown,
  ChevronUp,
  Server,
  Zap
} from "lucide-react";
import { getOfflineState, subscribeOfflineSyncState, triggerAutoSync } from "../services/offlineSync";
import { ensureSupabaseConfigured, PAUSE_ONLINE_SYNC } from "../supabase";
import { syncDatabaseWithSupabase, loadDatabaseFromSupabase, syncWithLocalMySQL, loadDatabaseFromMySQL } from "../data";
import { OfflineSyncState } from "../types";
import { OfflineSyncPanelModal } from "./OfflineSyncPanelModal";

export const OfflineDashboardWidget: React.FC = () => {
  const [syncState, setSyncState] = useState<OfflineSyncState>(getOfflineState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeOfflineSyncState((newState) => {
      setSyncState(newState);
    });
    return () => unsub();
  }, []);

  const handleSyncNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      if (PAUSE_ONLINE_SYNC) {
        const res = await syncWithLocalMySQL();
        await loadDatabaseFromMySQL();
        setSyncFeedback({
          success: true,
          message: res.message || "Sincronizado con MySQL Local (mazal_bd) exitosamente."
        });
      } else {
        await ensureSupabaseConfigured();
        await triggerAutoSync();
        const cloudRes = await syncDatabaseWithSupabase();
        await loadDatabaseFromSupabase();
        if (cloudRes.success) {
          setSyncFeedback({
            success: true,
            message: (cloudRes as any).message || "Sincronizado con Supabase Cloud exitosamente."
          });
        } else {
          setSyncFeedback({
            success: false,
            message: (cloudRes as any).error || "Aviso al sincronizar con la nube."
          });
        }
      }
    } catch (err: any) {
      setSyncFeedback({
        success: false,
        message: "Error: " + (err?.message || String(err))
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-all duration-300 overflow-hidden">
        
        {/* COMPACT COLLAPSIBLE TAB HEADER (Always Visible as a sleek bar) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between p-3.5 sm:px-4 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-850/50 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                syncState.isOnline
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
              }`}
            >
              {syncState.isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </div>

            <div className="flex items-center gap-2 truncate">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-1.5">
                <span className="hidden sm:inline">Motor Híbrido:</span> Supabase & Local MySQL
              </span>
              
              <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {syncState.isOnline ? "En Línea" : "Offline"}
              </span>

              {syncState.pendingCount > 0 && (
                <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {syncState.pendingCount} pendientes
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing || syncState.isSyncing}
              className="hidden sm:flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Sincronizar ahora con Supabase y base local"
            >
              <RefreshCw className={`h-3 w-3 text-emerald-600 ${isSyncing || syncState.isSyncing ? "animate-spin" : ""}`} />
              <span>Sincronizar</span>
            </button>

            <button
              type="button"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <span className="text-[11px] hidden md:inline">{isExpanded ? "Ocultar" : "Desplegar"}</span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Sync Feedback Message */}
        {syncFeedback && (
          <div className={`px-4 py-2 text-xs border-t flex items-center justify-between gap-2 transition-all ${
            syncFeedback.success
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40"
              : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/40"
          }`}>
            <div className="flex items-center gap-2">
              {syncFeedback.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Zap className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />}
              <span className="font-semibold">{syncFeedback.message}</span>
            </div>
            <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">✕</button>
          </div>
        )}

        {/* EXPANDABLE ACCORDION BODY (Hidden by default to save Dashboard space) */}
        {isExpanded && (
          <div className="p-4 pt-1 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 animate-fadeIn">
            
            {/* Grid Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs pt-2">
              <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                  Estado Conexión
                  {syncState.isOnline ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-rose-500" />}
                </div>
                <div className={`font-black text-xs sm:text-sm ${syncState.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {syncState.isOnline ? "🟢 En línea" : "🔴 Sin Conexión"}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                  Cola de Operaciones
                  <Layers className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <div className="font-black text-xs sm:text-sm text-amber-600 dark:text-amber-400 font-mono">
                  {syncState.pendingCount} pendientes
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                  Última Sincronización
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div className="font-bold text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  {syncState.lastSyncTime ? syncState.lastSyncTime.split(" ")[1] || syncState.lastSyncTime : "Hace un momento"}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="text-[10px] text-slate-400 font-bold mb-1 flex items-center justify-between">
                  Almacenamiento Local
                  <Database className="h-3.5 w-3.5 text-purple-500" />
                </div>
                <div className="font-black text-[11px] text-emerald-600 dark:text-emerald-400">
                  MySQL XAMPP Activo
                </div>
              </div>
            </div>

            {/* Footer Details & Modal trigger */}
            <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
                <Cloud className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Arquitectura Híbrida: Supabase Cloud PostgreSQL + Local MySQL</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <span>Ver Panel y Registros</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isSyncing || syncState.isSyncing}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || syncState.isSyncing ? "animate-spin" : ""}`} />
                  <span>{isSyncing || syncState.isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      <OfflineSyncPanelModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
