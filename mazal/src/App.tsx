/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  WifiOff, 
  Layers, 
  Truck, 
  CheckCircle2, 
  X, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck as TruckIcon, 
  BarChart3, 
  Receipt, 
  ShieldCheck, 
  LayoutDashboard 
} from "lucide-react";
import LoginAndCatalog from "./components/LoginAndCatalog";
import BranchGate from "./components/BranchGate";
import { OfflineSyncPanelModal } from "./components/OfflineSyncPanelModal";
import { 
  getOfflineState, 
  subscribeOfflineSyncState, 
  setForcedOffline, 
  isForcedOfflineMode, 
  triggerAutoSync 
} from "./services/offlineSync";
import { 
  UserRole, 
  Product, 
  Sale, 
  CashSession, 
  normalizeUserRole, 
  getRolePermissionsForUser, 
  RolePermissions 
} from "./types";
import { 
  getDatabase, 
  saveDatabase, 
  logAction, 
  loadDatabaseFromSupabase, 
  loadDatabaseFromMySQL, 
  subscribeToDb, 
  setActiveBranch, 
  subscribeNetworkStatus, 
  syncDatabaseWithSupabase, 
  ensureSupabaseConfigured, 
  saveCashSessionToMySQL 
} from "./data";
import { HeaderNav } from "./app/HeaderNav";
import { DashboardView } from "./app/DashboardView";
import { RouteRenderer } from "./app/routes";
import { SyncResultModal } from "./app/SyncResultModal";
import { PwaGuideModal } from "./app/PwaGuideModal";

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("mazal_theme");
    return (saved === "dark" || saved === "light") ? saved : "light";
  });
  
  const [currentBranch, setCurrentBranch] = useState<string | null>(() => {
    return (localStorage.getItem("mazal_active_branch") as string) || "Norte";
  });

  const [currentUser, setCurrentUser] = useState<{ name: string; role: any } | null>(() => {
    try {
      const saved = localStorage.getItem("mazal_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          return {
            name: parsed.name,
            role: normalizeUserRole(parsed.role)
          };
        }
      }
    } catch (e) {}
    return null;
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("mazal_active_tab");
      return saved || "dashboard";
    } catch (e) {
      return "dashboard";
    }
  });

  const [onlyPOSMode, setOnlyPOSMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mazal_only_pos") === "true";
    } catch (e) {
      return false;
    }
  });

  const [syncModalState, setSyncModalState] = useState<{
    isOpen: boolean;
    loading: boolean;
    result: {
      success: boolean;
      message: string;
      error?: string;
      syncedTables?: string[];
      totalRecords?: number;
      pendingSynced?: number;
    } | null;
  } | null>(null);

  const [db, setDb] = useState(getDatabase());
  const [cashSessionActive, setCashSessionActive] = useState(true);
  const [netStatus, setNetStatus] = useState({ isOnline: true, isSyncing: false, pendingSync: false });
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [offlineState, setOfflineState] = useState(getOfflineState());
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);

  useEffect(() => {
    loadDatabaseFromMySQL().then(() => {
      setDb(getDatabase());
    }).catch(() => {});

    const unsubNet = subscribeNetworkStatus((status) => {
      setNetStatus(status);
    });

    let prevOnline = getOfflineState().isOnline;
    const unsubOffline = subscribeOfflineSyncState((state) => {
      setOfflineState(state);
      if (!prevOnline && state.isOnline) {
        setShowReconnectedToast(true);
        setTimeout(() => setShowReconnectedToast(false), 7000);
      }
      prevOnline = state.isOnline;
    });

    return () => {
      unsubNet();
      unsubOffline();
    };
  }, []);

  const reloadDb = () => {
    const freshDb = getDatabase();
    setDb(freshDb);
    const openSess = freshDb.cashSessions.some((s: CashSession) => s.status === "Abierta");
    setCashSessionActive(openSess);
  };

  useEffect(() => {
    if (!currentBranch) return;

    let unsubscribe: (() => void) | undefined;
    const initData = async () => {
      setActiveBranch(currentBranch);
      await loadDatabaseFromMySQL(currentBranch).catch(() => {});
      setDb(getDatabase());

      unsubscribe = subscribeToDb((updatedDb) => {
        setDb({ ...updatedDb });
        const openSess = updatedDb.cashSessions ? updatedDb.cashSessions.some((s: CashSession) => s.status === "Abierta") : false;
        setCashSessionActive(openSess);
      });
    };
    initData();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentBranch]);

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    if (theme === "dark") {
      root.classList.add("dark");
      if (body) {
        body.classList.add("dark");
        body.style.backgroundColor = "#000000";
        body.style.color = "#f5f5f7";
      }
    } else {
      root.classList.remove("dark");
      if (body) {
        body.classList.remove("dark");
        body.style.backgroundColor = "#eef1e9";
        body.style.color = "#1d1d1f";
      }
    }
  }, [theme]);

  const handleLoginSuccess = (user: { name: string; role: any }, onlyPOS: boolean = false) => {
    const normalizedUser = {
      name: user.name || "Administrador General",
      role: normalizeUserRole(user.role)
    };
    setCurrentUser(normalizedUser);
    setOnlyPOSMode(onlyPOS);
    try {
      localStorage.setItem("mazal_session", JSON.stringify(normalizedUser));
      localStorage.setItem("mazal_only_pos", onlyPOS ? "true" : "false");
    } catch (e) {}

    if (onlyPOS || normalizedUser.role === UserRole.CASHIER || String(normalizedUser.role).toLowerCase().includes("cajer")) {
      setActiveTab("pos");
      try {
        localStorage.setItem("mazal_active_tab", "pos");
      } catch (e) {}
    } else {
      const savedTab = localStorage.getItem("mazal_active_tab");
      const target = (savedTab && savedTab !== "dashboard") ? savedTab : "pos";
      setActiveTab(target);
      try {
        localStorage.setItem("mazal_active_tab", target);
      } catch (e) {}
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      logAction(
        currentUser.name,
        currentUser.role,
        "Cierre de Sesión",
        "El colaborador cerró su sesión activa voluntariamente."
      );
    }
    setCurrentUser(null);
    setOnlyPOSMode(false);
    try {
      localStorage.removeItem("mazal_session");
      localStorage.removeItem("mazal_only_pos");
      localStorage.removeItem("mazal_active_tab");
    } catch (e) {}
  };

  const handleTriggerManualSync = async () => {
    setSyncModalState({ isOpen: true, loading: true, result: null });
    try {
      await ensureSupabaseConfigured();
      const queueRes = await triggerAutoSync();
      const cloudRes = await syncDatabaseWithSupabase(currentBranch || "Norte");
      await loadDatabaseFromSupabase(currentBranch || "Norte");
      setDb(getDatabase());

      if (cloudRes.success) {
        setSyncModalState({
          isOpen: true,
          loading: false,
          result: {
            success: true,
            message: "Todos los registros locales se han guardado y sincronizado con Supabase Cloud exitosamente.",
            syncedTables: (cloudRes as any).syncedTables || [],
            totalRecords: (cloudRes as any).totalRecords || 0,
            pendingSynced: queueRes.syncedCount || 0
          }
        });
      } else {
        setSyncModalState({
          isOpen: true,
          loading: false,
          result: {
            success: false,
            message: "Ocurrió un problema al sincronizar con Supabase Cloud.",
            error: (cloudRes as any).error || "No se pudo completar la transferencia a la base de datos en la nube."
          }
        });
      }
    } catch (err: any) {
      console.error("Manual sync error:", err);
      setSyncModalState({
        isOpen: true,
        loading: false,
        result: {
          success: false,
          message: "Error de red o excepción inesperada al conectar con Supabase.",
          error: err?.message || String(err)
        }
      });
    }
  };

  const handleToggleCashSession = () => {
    if (!currentUser) return;
    if (cashSessionActive) {
      if (activeTab !== "pos" && activeTab !== "finances") {
        if (window.confirm("Hay una sesión de caja activa. ¿Deseas ir al Punto de Venta para realizar el corte y arqueo de caja?")) {
          setActiveTab("pos");
        }
      } else {
        alert("Para realizar el corte de caja, utiliza el botón 'Realizar Corte de Caja' en la barra superior del Punto de Venta o en el módulo de Finanzas.");
      }
    } else {
      const fundStr = window.prompt("Apertura de Turno de Caja:\nIntroduce el fondo inicial de efectivo ($ MXN):", "1000");
      if (fundStr === null) return;
      const fund = parseFloat(fundStr);
      if (isNaN(fund) || fund < 0) {
        alert("Introduce un monto de fondo inicial válido mayor o igual a 0.");
        return;
      }

      if (!window.confirm(`¿Confirmas abrir la caja con un fondo inicial de $${fund.toFixed(2)} MXN a nombre de "${currentUser.name}"?`)) {
        return;
      }

      const database = getDatabase();
      const dateStr = new Date().toISOString().replace("T", " ").substring(0, 19);
      const newSess: CashSession = {
        id: "SESS_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        startTime: dateStr,
        openedBy: currentUser.name,
        initialCash: fund,
        status: "Abierta",
        salesTotal: 0,
        expensesTotal: 0,
        expectedFinalCash: fund
      };

      if (!Array.isArray(database.cashSessions)) database.cashSessions = [];
      database.cashSessions.unshift(newSess);
      
      const branch = currentBranch || "Norte";
      saveCashSessionToMySQL(newSess, branch).catch(() => {});
      saveDatabase(database).catch(() => {});
      setCashSessionActive(true);

      logAction(
        currentUser.name,
        currentUser.role,
        "Apertura de Caja",
        `Abrió sesión de caja con fondo inicial de $${fund.toFixed(2)} MXN`
      ).catch(() => {});
      
      reloadDb();
    }
  };

  const isRoleAllowed = (tabId: string) => {
    if (!currentUser) return false;
    const role = normalizeUserRole(currentUser.role);
    if (role === UserRole.ADMIN) return true;
    if (tabId === "dashboard" || tabId === "docs") return true;
    
    const perms = getRolePermissionsForUser(role);
    const permKey = tabId as keyof RolePermissions;
    if (perms && perms[permKey] !== undefined) {
      return perms[permKey];
    }
    return true;
  };

  const handleTabClick = (tabId: string) => {
    if (!currentUser) return;
    if (isRoleAllowed(tabId)) {
      setActiveTab(tabId);
      try {
        localStorage.setItem("mazal_active_tab", tabId);
      } catch (e) {}
    } else {
      alert(`Tu rol de operador actual (${currentUser.role}) no tiene autorización para ingresar a este módulo.`);
    }
  };

  const menuDetails = [
    {
      id: "pos",
      title: "Punto de Venta (Cobro Rápido)",
      badge: "Vender Ahora",
      icon: ShoppingCart
    },
    {
      id: "inventory",
      title: "Control de Inventarios y Almacén",
      badge: "Inventario",
      icon: Package
    },
    {
      id: "customers",
      title: "Clientes y Crédito Fiado",
      badge: "Clientes",
      icon: Users
    },
    {
      id: "purchases",
      title: "Compras y Abastecimiento",
      badge: "Compras",
      icon: TruckIcon
    },
    {
      id: "reports",
      title: "Finanzas y Márgenes de Utilidad",
      badge: "Finanzas",
      icon: BarChart3
    },
    {
      id: "receipts",
      title: "Historial de Recibos y Tickets",
      badge: "Recibos",
      icon: Receipt
    },
    {
      id: "security",
      title: "Control de Accesos y Seguridad",
      badge: "Seguridad",
      icon: ShieldCheck
    }
  ];

  const salesList: Sale[] = Array.isArray(db?.sales) ? db.sales : [];
  const productsList: Product[] = Array.isArray(db?.products) ? db.products : [];
  const customersList: any[] = Array.isArray(db?.customers) ? db.customers : [];

  const lowStockCount = productsList.filter((p: Product) => (Number(p?.stock) || 0) <= (Number(p?.stockMin) || 0)).length;
  const criticalExpiryCount = productsList.filter((p: Product) => {
    if (!p?.expiryDate) return false;
    const diff = new Date(p.expiryDate).getTime() - new Date().getTime();
    return diff >= 0 && diff <= 15 * 24 * 60 * 60 * 1000;
  }).length;

  if (!currentBranch) {
    return (
      <BranchGate 
        onBranchSelect={(branch) => {
          setCurrentBranch(branch);
          setActiveBranch(branch);
        }}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === "light" ? "dark" : "light")}
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginAndCatalog
        currentBranch={currentBranch || "Norte"}
        onBranchChange={(branch) => {
          setCurrentBranch(branch);
          setActiveBranch(branch);
        }}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === "light" ? "dark" : "light")}
        onLoginSuccess={(user, onlyPOS) => handleLoginSuccess(user, onlyPOS)}
        onBackToBranch={() => {
          handleLogout();
          setCurrentBranch(null);
          setActiveBranch(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#eef1e9] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Real-Time Traspasos Alert */}
      {(() => {
        const branchNormalized = (currentBranch || "").toLowerCase();
        const incomingPendingList = (db.stockTransfers || []).filter(
          (t: any) =>
            t.status === "PENDIENTE_RECEPCION" &&
            branchNormalized &&
            t.toBranch?.toLowerCase() === branchNormalized
        );

        if (incomingPendingList.length === 0) return null;

        return (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 flex items-center justify-between gap-3 text-xs font-bold shadow-md z-50 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 animate-bounce shrink-0" />
              <span>
                🚨 <strong>NOTIFICACIÓN TRASPASO ENTRANTE:</strong> Tienes {incomingPendingList.length} traspaso(s) inter-sucursal entrante(s) pendiente(s) por verificar y confirmar en {currentBranch}.
              </span>
            </div>
            <button
              onClick={() => setActiveTab("inventory")}
              className="px-3 py-1 bg-slate-950 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition-all shadow-xs cursor-pointer shrink-0"
            >
              Revisar y Confirmar Recepción
            </button>
          </div>
        );
      })()}

      {/* Offline Contingency Notice */}
      {(!offlineState.isOnline || isForcedOfflineMode()) && (
        <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-bold shadow-lg z-50 animate-fadeIn border-b border-rose-800">
          <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
            <div className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </div>
            <WifiOff className="h-4 w-4 shrink-0 animate-bounce text-amber-200" />
            <span className="leading-snug">
              <strong>⚡ MODO OFFLINE ACTIVO (CONTINGENCIA LOCAL):</strong> Operando sin conexión con Supabase. Todas las ventas e inventarios se están guardando localmente en MySQL y la cola de sincronización.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {offlineState.pendingCount > 0 && (
              <span className="bg-black/30 text-amber-200 font-mono px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 border border-amber-300/30">
                <Layers className="h-3 w-3" />
                {offlineState.pendingCount} pendientes
              </span>
            )}
            <button
              onClick={() => setIsOfflineModalOpen(true)}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-rose-800 rounded-lg font-black text-xs transition-all shadow-xs cursor-pointer"
            >
              Ver Cola & Estado
            </button>
            <button
              onClick={() => {
                setForcedOffline(false);
                triggerAutoSync();
              }}
              className="px-3 py-1 bg-black/40 hover:bg-black/60 text-white rounded-lg font-bold text-xs transition-all cursor-pointer"
              title="Intentar reconectar con Supabase Cloud"
            >
              Probar Reconexión
            </button>
          </div>
        </div>
      )}

      {/* Header Navigation */}
      <HeaderNav
        currentBranch={currentBranch}
        currentUser={currentUser}
        onlyPOSMode={onlyPOSMode}
        theme={theme}
        cashSessionActive={cashSessionActive}
        activeTab={activeTab}
        isSyncing={syncModalState?.loading || false}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onToggleCashSession={handleToggleCashSession}
        onTriggerManualSync={handleTriggerManualSync}
        onChangeBranch={() => {
          handleLogout();
          setCurrentBranch(null);
          setActiveBranch(null);
        }}
        onLogout={handleLogout}
        onNavigateTab={handleTabClick}
        menuDetails={menuDetails}
      />

      {/* Main Container */}
      <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto max-w-[1720px] mx-auto w-full space-y-6">
        
        {/* Offline Notice Banner */}
        {!netStatus.isOnline && (
          <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs flex items-center justify-between gap-3 shadow-xs font-sans animate-fade-in">
            <div className="flex items-center gap-2.5">
              <WifiOff className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-extrabold uppercase tracking-wide block">Modo Sin Conexión Activo (Doble Función Offline / Online)</span>
                <span className="text-[11px] opacity-90">
                  El sistema está operando de forma local. Todas las ventas, tickets y cobros se están guardando localmente en este dispositivo.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Upper Header & Breadcrumbs */}
        {!onlyPOSMode ? (
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#e2e6dd] dark:border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                {activeTab === "dashboard" ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded">
                      Tablero de Mandos
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </>
                ) : (
                  <button 
                    onClick={() => setActiveTab("dashboard")}
                    className="text-xs text-emerald-700 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <LayoutDashboard className="h-3 w-3" />
                    Tablero Principal
                  </button>
                )}
                {activeTab !== "dashboard" && (
                  <>
                    <span className="text-gray-300 dark:text-slate-700">/</span>
                    <span className="text-xs font-semibold text-gray-500 capitalize">
                      {activeTab === "pos" && "Cobros de Caja"}
                      {activeTab === "inventory" && "Existencias e Inventario"}
                      {activeTab === "customers" && "Créditos Fiados"}
                      {activeTab === "purchases" && "Surtido y Proveedores"}
                      {activeTab === "reports" && "Estados de Resultados"}
                      {activeTab === "security" && "Permisos y RBAC"}
                    </span>
                  </>
                )}
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2">
                {activeTab === "dashboard" && "Tablero de Control Mazal"}
                {activeTab === "pos" && "Terminal Punto de Venta (Caja)"}
                {activeTab === "inventory" && "Control y Kárdex de Almacén"}
                {activeTab === "customers" && "Clientes y Saldos Fiados"}
                {activeTab === "purchases" && "Abastecimiento y Cuentas por Pagar"}
                {activeTab === "reports" && "Finanzas, Utilidades y Márgenes"}
                {activeTab === "security" && "Auditoría de Transacciones y RBAC"}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {(lowStockCount > 0 || criticalExpiryCount > 0) && (
                <button 
                  onClick={() => handleTabClick("inventory")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Ver productos con existencias por debajo del mínimo"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-[11px] font-medium">{lowStockCount + criticalExpiryCount} avisos de stock</span>
                </button>
              )}
            </div>
          </header>
        ) : (
          <header className="flex justify-between items-center border-b border-[#e2e6dd] dark:border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-md">
                Sesión de Venta Exclusiva
              </span>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1.5">
                Caja Registradora Activa
              </h1>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Colaborador: <strong className="text-slate-800 dark:text-white">{currentUser.name}</strong>
            </div>
          </header>
        )}

        {/* Dynamic View Router */}
        <div className="transition-all duration-200">
          {activeTab === "dashboard" ? (
            <DashboardView
              salesList={salesList}
              productsList={productsList}
              customersList={customersList}
              cashSessionActive={cashSessionActive}
              onNavigateTab={handleTabClick}
              onOpenSyncModal={() => setIsOfflineModalOpen(true)}
            />
          ) : (
            <RouteRenderer
              activeTab={activeTab}
              db={db}
              currentUser={currentUser}
              currentBranch={currentBranch}
              theme={theme}
              cashSessionActive={cashSessionActive}
              onOpenCashSession={handleToggleCashSession}
              onNavigateTab={handleTabClick}
              reloadDb={reloadDb}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-4 pb-6 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-[#e2e6dd] dark:border-slate-800">
          <p>Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026</p>
        </footer>

      </main>

      {/* PWA & Sync Modals */}
      <PwaGuideModal isOpen={showPwaModal} onClose={() => setShowPwaModal(false)} />
      
      <SyncResultModal
        isOpen={syncModalState?.isOpen || false}
        loading={syncModalState?.loading || false}
        result={syncModalState?.result || null}
        onClose={() => setSyncModalState(null)}
        onRetry={handleTriggerManualSync}
      />

      {showReconnectedToast && (
        <div className="fixed bottom-6 right-6 z-[99999] bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-slideUp">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-200" />
          <div>
            <div className="font-black text-xs tracking-tight">🟢 Conexión Restablecida</div>
            <div className="text-[11px] text-emerald-100">Sincronizando operaciones pendientes con Supabase Cloud...</div>
          </div>
          <button 
            onClick={() => setShowReconnectedToast(false)}
            className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <OfflineSyncPanelModal 
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
      />

    </div>
  );
}
