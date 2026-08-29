import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Server,
  Layers,
  ArrowRight,
  X,
  Trash2,
  FileText,
  ShoppingCart,
  Users,
  Package,
  Boxes
} from "lucide-react";
import {
  getOfflineState,
  subscribeOfflineSyncState,
  triggerAutoSync,
  clearPendingQueue,
  resolveConflict,
  setForcedOffline,
  isForcedOfflineMode,
  checkActiveConnection
} from "../services/offlineSync";
import { testSupabaseConnection, isSupabaseConfigured, SUPABASE_URL } from "../supabase";
import { syncDatabaseWithSupabase, loadDatabaseFromSupabase, callLocalApi, activeBranch } from "../data";
import { OfflineSyncState, PendingOperation } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineSyncPanelModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [syncState, setSyncState] = useState<OfflineSyncState>(getOfflineState());
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const [activeTab, setActiveTab] = useState<"status" | "queue" | "conflicts">("status");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isForced, setIsForced] = useState<boolean>(isForcedOfflineMode());
  const [mysqlStatus, setMysqlStatus] = useState<{
    tested: boolean;
    online: boolean;
    database?: string;
    totalProducts?: number;
    totalSales?: number;
    totalUsers?: number;
    error?: string;
  }>({ tested: false, online: false });

  useEffect(() => {
    const unsub = subscribeOfflineSyncState((newState) => {
      setSyncState(newState);
      setIsForced(isForcedOfflineMode());
    });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsub();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!isOpen) return null;

  const handleToggleForcedOffline = (forced: boolean) => {
    setIsForced(forced);
    setForcedOffline(forced);
    setSyncMessage(forced ? "🔴 Modo Offline forzado activado (Contingencia local XAMPP)." : "🟢 Modo En Línea activado (Detección automática).");
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleTestMySQLLocal = async () => {
    setIsSyncingManual(true);
    setSyncMessage("Probando conexión con MySQL Local (XAMPP / api.php)...");
    try {
      const res = await callLocalApi(`action=ping&branch=${encodeURIComponent(activeBranch || "Norte")}`);
      const data = await res.json();
      if (data.success) {
        setMysqlStatus({
          tested: true,
          online: true,
          database: data.database,
          totalProducts: data.total_productos,
          totalSales: data.total_ventas,
          totalUsers: data.total_usuarios
        });
        setSyncMessage(`✅ Conexión con MySQL Local (${data.database}) exitosa. ${data.total_productos} productos, ${data.total_ventas} ventas en BD.`);
      } else {
        setMysqlStatus({ tested: true, online: false, error: data.error || "Respuesta inválida" });
        setSyncMessage(`❌ Error MySQL: ${data.error || "No respondió adecuadamente"}`);
      }
    } catch (e: any) {
      setMysqlStatus({ tested: true, online: false, error: e.message || String(e) });
      setSyncMessage(`❌ Error conectando con Apache/MySQL local: ${e.message || String(e)}`);
    } finally {
      setIsSyncingManual(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncingManual(true);
    setSyncMessage("Sincronizando operaciones encoladas con Supabase Cloud...");
    try {
      const res = await triggerAutoSync();
      if (res.success) {
        setSyncMessage(`Sincronización completada con éxito. ${res.syncedCount} operaciones enviadas.`);
      } else {
        setSyncMessage(`Sincronización finalizada con ${res.errors} advertencias/errores.`);
      }
    } catch (e: any) {
      setSyncMessage("Error al intentar la sincronización: " + (e.message || String(e)));
    } finally {
      setIsSyncingManual(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const getOpBadge = (type: string) => {
    switch (type) {
      case "SALE":
        return <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs px-2 py-0.5 rounded-md font-bold"><ShoppingCart className="h-3 w-3" /> Venta</span>;
      case "PRODUCT":
        return <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 text-xs px-2 py-0.5 rounded-md font-bold"><Package className="h-3 w-3" /> Producto</span>;
      case "INVENTORY_MOVEMENT":
        return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs px-2 py-0.5 rounded-md font-bold"><Boxes className="h-3 w-3" /> Mov. Inventario</span>;
      case "CUSTOMER":
        return <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 text-xs px-2 py-0.5 rounded-md font-bold"><Users className="h-3 w-3" /> Cliente</span>;
      default:
        return <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 text-xs px-2 py-0.5 rounded-md font-bold"><FileText className="h-3 w-3" /> {type}</span>;
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto transition-all"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[88vh] my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${syncState.isOnline ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
              {syncState.isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5 animate-bounce" />}
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                Offline & Online Sync Manager
                <span className="text-[10px] bg-slate-800 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
                  XAMPP MySQL + Supabase
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Detección automática de red, persistencia en BD local (XAMPP) y sincronización con Supabase Cloud
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        <div
          className={`px-6 py-3 border-b flex items-center justify-between transition-colors ${
            syncState.isSyncing
              ? "bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-900/30"
              : syncState.isOnline
              ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/30"
              : "bg-rose-500/10 text-rose-900 dark:text-rose-300 border-rose-200 dark:border-rose-900/30"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  syncState.isSyncing ? "bg-amber-400" : syncState.isOnline ? "bg-emerald-400" : "bg-rose-400"
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  syncState.isSyncing ? "bg-amber-500" : syncState.isOnline ? "bg-emerald-500" : "bg-rose-500"
                }`}
              ></span>
            </span>
            <span>
              {syncState.isSyncing
                ? "🟠 Sincronizando información en tiempo real con la nube..."
                : syncState.isOnline
                ? "🟢 En Línea: Conexión activa con Supabase Cloud"
                : "🔴 Modo Offline: Operaciones guardándose en BD Local MySQL (XAMPP)"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setIsSyncingManual(true);
                setSyncMessage("Verificando estado del adaptador de red e internet...");
                const online = await checkActiveConnection();
                setIsSyncingManual(false);
                setSyncMessage(online ? "🟢 Conexión a Internet activa y verificada." : "🔴 Sin conexión a Internet detectada. Operando en modo local XAMPP.");
                setTimeout(() => setSyncMessage(null), 4000);
              }}
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
              title="Comprueba en tiempo real el estado del adaptador de red y acceso a internet"
            >
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
              <span>Verificar Conexión</span>
            </button>

            <button
              onClick={handleSyncNow}
              disabled={isSyncingManual || syncState.isSyncing}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingManual || syncState.isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncingManual || syncState.isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="bg-slate-900 text-emerald-300 px-6 py-2 text-xs font-mono border-b border-slate-800 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab("status")}
            className={`px-4 py-2.5 font-extrabold text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === "status"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            📊 Estado de Red y Servidores
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-2.5 font-extrabold text-xs border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "queue"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            📦 Cola de Operaciones
            {syncState.pendingCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold">
                {syncState.pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("conflicts")}
            className={`px-4 py-2.5 font-extrabold text-xs border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "conflicts"
                ? "border-rose-600 text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-800 rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            ⚠️ Panel de Conflictos
            {syncState.conflicts.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold">
                {syncState.conflicts.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === "status" && (
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold">Estado Red</span>
                    {syncState.isOnline ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-rose-500" />}
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white">
                    {syncState.isOnline ? "Conectado" : "Sin Conexión"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{isForced ? "Modo Forzado Activo" : "Detección Automática"}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold">En Cola</span>
                    <Layers className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-base font-black text-amber-600 dark:text-amber-400">
                    {syncState.pendingCount} Operaciones
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Pendientes de subir</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold">Última Sincronización</span>
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                    {syncState.lastSyncTime ? syncState.lastSyncTime.split(" ")[1] || syncState.lastSyncTime : "Hace un momento"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{syncState.lastSyncTime ? syncState.lastSyncTime.split(" ")[0] : "Hoy"}</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold">BD Local MySQL</span>
                    <Database className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    XAMPP Activo
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{activeBranch === "Sur" ? "mazal_bd1" : "mazal_bd"}</div>
                </div>
              </div>

              {/* Local MySQL (XAMPP) Card */}
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 text-xs text-emerald-900 dark:text-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-black flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
                    <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Base de Datos Local MySQL (XAMPP / localhost)
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold text-[10px]">
                    🟢 Activo (CRUD Completo)
                  </span>
                </div>
                <p className="leading-relaxed text-slate-600 dark:text-slate-400">
                  Todas las operaciones CRUD (Productos, Ventas, Clientes, Proveedores, Kárdex, Caja) se ejecutan y persisten en la base de datos MySQL local ({activeBranch === "Sur" ? "mazal_bd1" : "mazal_bd"}) para garantizar funcionamiento 100% offline.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleTestMySQLLocal}
                    disabled={isSyncingManual}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-50"
                  >
                    <Database className="h-3.5 w-3.5" /> Probar Conexión MySQL Local
                  </button>

                  {mysqlStatus.tested && (
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                      {mysqlStatus.online ? `✅ ${mysqlStatus.database}: ${mysqlStatus.totalProducts} prods, ${mysqlStatus.totalSales} ventas` : `❌ ${mysqlStatus.error}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Breakdown by Module */}
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Detalle de Operaciones Pendientes por Módulo
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                      <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" /> Ventas
                    </span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{syncState.pendingByType.sales}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                      <Boxes className="h-3.5 w-3.5 text-amber-500" /> Mov. Stock
                    </span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400">{syncState.pendingByType.movements}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                      <Package className="h-3.5 w-3.5 text-blue-500" /> Productos
                    </span>
                    <span className="font-mono font-black text-blue-600 dark:text-blue-400">{syncState.pendingByType.products}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                      <Users className="h-3.5 w-3.5 text-purple-500" /> Clientes
                    </span>
                    <span className="font-mono font-black text-purple-600 dark:text-purple-400">{syncState.pendingByType.customers}</span>
                  </div>
                </div>
              </div>

              {/* Supabase Cloud Status Card */}
              <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40 rounded-xl p-4 text-xs text-sky-900 dark:text-sky-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-black flex items-center gap-2 text-sm text-sky-800 dark:text-sky-300">
                    <Cloud className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    Servidor en la Nube: Supabase Cloud
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold text-[10px]">
                    🟢 {isSupabaseConfigured ? "Conectado" : "Pendiente"}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-600 dark:text-slate-400">
                  Alojamiento y respaldo en la nube activo. Permite consultar y sincronizar los datos de ventas e inventarios desde cualquier dispositivo en tiempo real.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setIsSyncingManual(true);
                      setSyncMessage("Probando conexión con Supabase Cloud...");
                      const res = await testSupabaseConnection();
                      setSyncMessage(res.message ? "Conexión con la nube verificada correctamente." : "Error de conexión.");
                      setIsSyncingManual(false);
                      setTimeout(() => setSyncMessage(null), 6000);
                    }}
                    disabled={isSyncingManual}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Server className="h-3.5 w-3.5 text-sky-500" /> Probar Conexión Nube
                  </button>

                  <button
                    onClick={async () => {
                      setIsSyncingManual(true);
                      setSyncMessage("Sincronizando información completa con la nube...");
                      const res = await syncDatabaseWithSupabase();
                      if (res.success) {
                        setSyncMessage("Información sincronizada con la nube exitosamente.");
                      } else {
                        setSyncMessage("Aviso: " + (res.error || "Error al sincronizar con la nube"));
                      }
                      setIsSyncingManual(false);
                      setTimeout(() => setSyncMessage(null), 6000);
                    }}
                    disabled={isSyncingManual}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingManual ? "animate-spin" : ""}`} /> Subir Todo a la Nube
                  </button>

                  <button
                    onClick={async () => {
                      setIsSyncingManual(true);
                      setSyncMessage("Descargando datos actualizados desde la nube...");
                      await loadDatabaseFromSupabase();
                      setSyncMessage("Datos recargados desde la nube con éxito.");
                      setIsSyncingManual(false);
                      setTimeout(() => setSyncMessage(null), 5000);
                    }}
                    disabled={isSyncingManual}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingManual ? "animate-spin" : ""}`} /> Descargar de la Nube
                  </button>
                </div>
              </div>

              {/* Status feedback banner */}
              {syncMessage && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-850 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2 animate-fadeIn">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                  <span>{syncMessage}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === "queue" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Cola de Operaciones Pendientes ({syncState.pendingCount})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Operaciones registradas localmente en contingencia para enviar a Supabase.
                  </p>
                </div>
                {syncState.pendingCount > 0 && (
                  <button
                    onClick={async () => {
                      if (window.confirm("¿Seguro que deseas descartar la cola de pendientes?")) {
                        await clearPendingQueue();
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Vaciar Cola
                  </button>
                )}
              </div>

              {syncState.pendingCount === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Sin Operaciones Pendientes</p>
                  <p className="text-[11px] text-slate-400 mt-1">Todos tus registros locales están sincronizados con la nube.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 font-bold border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
                      <span>Hay {syncState.pendingCount} operaciones encoladas en contingencia.</span>
                      <button
                        onClick={handleSyncNow}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold"
                      >
                        Subir Ahora
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "conflicts" && (
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Resolución Manual de Conflictos
              </h4>
              {syncState.conflicts.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No hay conflictos de datos registrados
                  </p>
                  <p className="text-xs text-slate-400">
                    Todas las ediciones coinciden perfectamente entre la nube y la base local.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {syncState.conflicts.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-rose-300 dark:border-rose-900/50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            Conflicto en documento {c.docId} ({c.type})
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{c.isoDate}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="font-sans font-bold text-emerald-600 mb-1">Versión Local (Este Equipo)</div>
                          <pre className="text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                            {JSON.stringify(c.conflictDetails?.localData || c.payload, null, 2)}
                          </pre>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                          <div className="font-sans font-bold text-blue-600 mb-1">Versión Nube (Supabase)</div>
                          <pre className="text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto">
                            {JSON.stringify(c.conflictDetails?.cloudData || {}, null, 2)}
                          </pre>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          onClick={() => resolveConflict(c.id, "USE_LOCAL")}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Conservar Versión Local
                        </button>
                        <button
                          onClick={() => resolveConflict(c.id, "USE_CLOUD")}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Conservar Versión Nube
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-500" />
            <span>Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-all cursor-pointer"
          >
            Cerrar Panel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
