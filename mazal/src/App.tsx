/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  ShoppingCart, 
  Plus, 
  ArrowRight, 
  CheckCircle2, 
  Coins, 
  ShieldAlert, 
  Bell, 
  Store,
  RefreshCw,
  Users,
  Truck,
  BookOpen,
  ShieldCheck,
  Warehouse,
  ChevronDown,
  Sun,
  Moon,
  LayoutDashboard,
  Lock,
  Package,
  BarChart3,
  CalendarDays,
  KeyRound,
  Receipt,
  LogOut,
  User,
  Wifi,
  WifiOff,
  Download,
  Smartphone,
  HardDrive,
  X
} from "lucide-react";
import POSModule from "./components/POSModule";
import InventoryModule from "./components/InventoryModule";
import CustomersModule from "./components/CustomersModule";
import PurchasesModule from "./components/PurchasesModule";
import ReportsModule from "./components/ReportsModule";
import FinanceModule from "./components/FinanceModule";
import ReceiptsModule from "./components/ReceiptsModule";
import SecurityModule from "./components/SecurityModule";
import LoginAndCatalog from "./components/LoginAndCatalog";
import BranchGate from "./components/BranchGate";
import { MazalLogo } from "./components/MazalLogo";
import { OfflineStatusIndicator } from "./components/OfflineStatusIndicator";
import { OfflineDashboardWidget } from "./components/OfflineDashboardWidget";

import { UserRole, Product, Sale, CashSession, PaymentMethod, MovementType, Customer } from "./types";
import { 
  getDatabase, 
  saveDatabase, 
  logAction, 
  loadDatabaseFromFirebase, 
  loadDatabaseFromSupabase,
  syncWithLocalMySQL,
  subscribeToDb, 
  activeBranch, 
  setActiveBranch,
  subscribeNetworkStatus,
  syncToFirebase,
  syncDatabaseWithSupabase
} from "./data";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("mazal_theme");
    return (saved === "dark" || saved === "light") ? saved : "light";
  });
  
  // Default branch state - defaults to 'Norte' so Sucursal Norte Public Wholesale Catalog is the main landing page
  const [currentBranch, setCurrentBranch] = useState<string | null>(() => {
    return (localStorage.getItem("mazal_active_branch") as string) || "Norte";
  });

  // Current logged in simulation user - always null initially so that visiting the link directs to the login screen
  const [currentUser, setCurrentUser] = useState<{ name: string; role: UserRole } | null>(null);
  const [onlyPOSMode, setOnlyPOSMode] = useState(false);

  const handleLoginSuccess = (user: { name: string; role: UserRole }, onlyPOS: boolean = false) => {
    setCurrentUser(user);
    setOnlyPOSMode(onlyPOS);
    if (onlyPOS) {
      setActiveTab("pos");
    } else {
      setActiveTab("dashboard");
    }
    localStorage.setItem("mazal_session", JSON.stringify(user));
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
    localStorage.removeItem("mazal_session");
  };

  // DB state
  const [db, setDb] = useState(getDatabase());
  const [cashSessionActive, setCashSessionActive] = useState(true);
  const [netStatus, setNetStatus] = useState({ isOnline: true, isSyncing: false, pendingSync: false });
  const [showPwaModal, setShowPwaModal] = useState(false);

  useEffect(() => {
    // Initial sync with local MySQL on boot
    syncWithLocalMySQL().then((res) => {
      if (res.success) {
        setDb(getDatabase());
      }
    });

    const unsubNet = subscribeNetworkStatus((status) => {
      setNetStatus(status);
    });
    return () => unsubNet();
  }, []);

  const reloadDb = () => {
    const freshDb = getDatabase();
    setDb(freshDb);
    
    // Check if open session exists
    const openSess = freshDb.cashSessions.some((s: CashSession) => s.status === "Abierta");
    setCashSessionActive(openSess);
  };

  useEffect(() => {
    if (!currentBranch) return; // Wait for branch selection before loading database

    let unsubscribe: (() => void) | undefined;
    const initData = async () => {
      // Set the active branch in our data engine
      setActiveBranch(currentBranch);

      // Sync with local MySQL for selected branch (mazal_bd for Norte, mazal_bd1 for Sur)
      await syncWithLocalMySQL(currentBranch);

      // Sincronizar con Supabase Cloud (Base de datos principal en línea)
      await loadDatabaseFromSupabase(currentBranch);

      // Then optionally sync with Firebase (safeguarded)
      await loadDatabaseFromFirebase();
      
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

  // Apply dark mode class and body style to root container
  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    if (theme === "dark") {
      root.classList.add("dark");
      if (body) {
        body.classList.add("dark");
        body.style.backgroundColor = "#000000"; // Negro AMOLED
        body.style.color = "#f5f5f7"; // Apple silver text
      }
    } else {
      root.classList.remove("dark");
      if (body) {
        body.classList.remove("dark");
        body.style.backgroundColor = "#eef1e9"; // Soft sage-gray matching Mazal logo
        body.style.color = "#1d1d1f"; // Apple dark text
      }
    }
  }, [theme]);

  // Handle Cash Session toggles
  const handleToggleCashSession = () => {
    const database = getDatabase();
    if (cashSessionActive) {
      // Close session
      database.cashSessions = database.cashSessions.map((s: CashSession) => {
        if (s.status === "Abierta") {
          return {
            ...s,
            status: "Cerrada",
            endTime: new Date().toISOString().replace("T", " ").substring(0, 19),
            finalCash: s.initialCash + (s.salesTotal || 0) - (s.expensesTotal || 0)
          };
        }
        return s;
      });
      saveDatabase(database);
      setCashSessionActive(false);
      
      logAction(
        currentUser.name,
        currentUser.role,
        "Cierre de Caja",
        "Cierre de turno de caja. Sesión guardada."
      );
    } else {
      // Open session
      const newSess: CashSession = {
        id: "SESS_" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        startTime: new Date().toISOString().replace("T", " ").substring(0, 19),
        openedBy: currentUser.name,
        initialCash: 1000.00,
        status: "Abierta",
        salesTotal: 0,
        expensesTotal: 0
      };
      database.cashSessions.unshift(newSess);
      saveDatabase(database);
      setCashSessionActive(true);

      logAction(
        currentUser.name,
        currentUser.role,
        "Apertura de Caja",
        "Abrió sesión de caja con fondo de contingencia de $1,000.00 MXN"
      );
    }
    reloadDb();
  };

  // Callback to simulate role changes
  const handleChangeRole = (newRole: UserRole, mockName: string) => {
    setCurrentUser({
      name: mockName,
      role: newRole
    });
    logAction(
      mockName,
      newRole,
      "Cambio de Operador",
      `Inició operaciones como rol: ${newRole}`
    );
  };

  // Real-time calculated dashboard metric numbers with defensive fallbacks
  const salesList: Sale[] = Array.isArray(db?.sales) ? db.sales : [];
  const productsList: Product[] = Array.isArray(db?.products) ? db.products : [];
  const customersList: any[] = Array.isArray(db?.customers) ? db.customers : [];

  const todaySalesSum = salesList.reduce((sum: number, s: Sale) => sum + (Number(s?.total) || 0), 0);
  const todayProfitSum = salesList.reduce((sum: number, s: Sale) => sum + (Number(s?.profit) || 0), 0);
  const avgTicket = salesList.length > 0 ? todaySalesSum / salesList.length : 0;
  
  const lowStockCount = productsList.filter((p: Product) => (Number(p?.stock) || 0) <= (Number(p?.stockMin) || 0)).length;
  const criticalExpiryCount = productsList.filter((p: Product) => {
    if (!p?.expiryDate) return false;
    const diff = new Date(p.expiryDate).getTime() - new Date().getTime();
    return diff >= 0 && diff <= 15 * 24 * 60 * 60 * 1000; // 15 days
  }).length;

  const totalOutstandingCredits = customersList.reduce((sum: number, c: any) => sum + (Number(c?.creditUsed) || 0), 0);

  // Check module role restrictions
  const isRoleAllowed = (tabId: string) => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    
    const allowedRoles: Record<string, string[]> = {
      dashboard: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAREHOUSE, UserRole.PURCHASING, UserRole.ACCOUNTANT],
      pos: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAREHOUSE, UserRole.PURCHASING, UserRole.ACCOUNTANT],
      inventory: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE, UserRole.PURCHASING, UserRole.CASHIER, UserRole.ACCOUNTANT],
      customers: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.ACCOUNTANT, UserRole.WAREHOUSE, UserRole.PURCHASING],
      purchases: [UserRole.ADMIN, UserRole.MANAGER, UserRole.PURCHASING, UserRole.ACCOUNTANT, UserRole.CASHIER, UserRole.WAREHOUSE],
      reports: [UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.PURCHASING, UserRole.CASHIER, UserRole.WAREHOUSE],
      receipts: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.ACCOUNTANT, UserRole.PURCHASING, UserRole.WAREHOUSE],
      security: [UserRole.ADMIN, UserRole.MANAGER],
    };
    return allowedRoles[tabId]?.includes(currentUser.role) ?? true;
  };

  const handleTabClick = (tabId: string) => {
    if (!currentUser) return;
    if (isRoleAllowed(tabId)) {
      setActiveTab(tabId);
    } else {
      alert(`Tu rol de operador actual (${currentUser.role}) no tiene autorización para ingresar a este módulo.`);
    }
  };

  const menuDetails = [
    {
      id: "pos",
      title: "Punto de Venta (Cobro Rápido)",
      badge: "Vender Ahora",
      desc: "Registra cobros rápidos en caja, elige tipo de venta (menudeo/mayoreo) artículo por artículo y calcula ganancias al instante.",
      icon: ShoppingCart,
      color: "from-emerald-500 to-teal-600",
      stats: cashSessionActive ? "Caja Abierta y Lista" : "Caja Cerrada"
    },
    {
      id: "inventory",
      title: "Control de Inventarios y Almacén",
      badge: "Inventario",
      desc: "Agrega productos frescos, consulta el kárdex detallado de mermas y ajustes de stock, y vigila alertas de caducidad.",
      icon: Package,
      color: "from-amber-500 to-orange-600",
      stats: `${lowStockCount} alertas de stock bajo`
    },
    {
      id: "customers",
      title: "Clientes y Crédito Fiado",
      badge: "Clientes",
      desc: "Administra el saldo fiado de los vecinos, registra abonos inmediatos, asigna límites de crédito y autoriza plazos.",
      icon: Users,
      color: "from-orange-500 to-rose-500",
      stats: `$${totalOutstandingCredits.toFixed(2)} total fiado`
    },
    {
      id: "purchases",
      title: "Compras y Abastecimiento",
      badge: "Compras",
      desc: "Surtido de productos, compras directas a proveedores, seguimiento de facturas y cuentas de abasto pendientes.",
      icon: Truck,
      color: "from-indigo-500 to-violet-600",
      stats: "Proveedores al corriente"
    },
    {
      id: "reports",
      title: "Finanzas y Márgenes de Utilidad",
      badge: "Finanzas",
      desc: "Estado de pérdidas y ganancias diario, balance general del negocio y consulta rápida de márgenes por artículo.",
      icon: BarChart3,
      color: "from-violet-500 to-fuchsia-600",
      stats: `Ganancia hoy: $${todayProfitSum.toFixed(2)}`
    },
    {
      id: "receipts",
      title: "Historial de Recibos y Tickets",
      badge: "Recibos",
      desc: "Consulta e imprime recibos históricos de ventas, genera duplicados de tickets y busca transacciones de contado y crédito fiado.",
      icon: Receipt,
      color: "from-amber-500 to-yellow-600",
      stats: `${(db.sales || []).length} recibos guardados`
    },
    {
      id: "security",
      title: "Control de Accesos y Seguridad",
      badge: "Seguridad",
      desc: "Administra cuentas de usuarios, define contraseñas, asigna permisos de rol y audita accesos y movimientos de inventario en tiempo real.",
      icon: ShieldCheck,
      color: "from-blue-600 to-cyan-600",
      stats: `${(db.auditLogs || []).length} eventos registrados`
    }
  ];

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
      
      {/* REAL-TIME PENDING STOCK TRANSFERS ALERT BANNER (Only displayed for the receiving branch) */}
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

      {/* BRAND & 2-TIER TOP HEADER */}
      <nav className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-[#e2e6dd] dark:border-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-3 sm:px-5 lg:px-6 py-2.5 transition-all">
        <div className="w-full max-w-[1720px] mx-auto flex flex-col gap-2.5">
          
          {/* TIER 1 (Fila Superior): Logos y Sucursal a la izquierda | Barra de herramientas (En línea primero) a la derecha */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            
            {/* Izquierda: Logos y Sucursal activa fija (Sin lista desplegable) */}
            <div className="flex items-center gap-3 shrink-0">
              <div 
                className={`flex items-center gap-2 ${onlyPOSMode ? "" : "cursor-pointer hover:opacity-90 transition-opacity"}`} 
                onClick={() => { if (!onlyPOSMode) setActiveTab("dashboard"); }}
                title="Ir al Tablero Principal"
              >
                <MazalLogo size="md" />
              </div>

              {/* Chip de Sucursal Activa Fija (Sin dropdown select) */}
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 text-xs font-black text-emerald-800 dark:text-emerald-300 font-mono shadow-2xs">
                <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400 animate-pulse shrink-0" />
                <span className="tracking-wide uppercase">
                  {currentBranch === "Sur" ? "MAZAL 2" : "MAZAL 1"}
                </span>
              </div>
            </div>

            {/* Derecha: Barra de Herramientas con 'En línea' primero y sus demás elementos */}
            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
              
              {/* 1. Botón 'En Línea' (Abre ventana emergente) */}
              <OfflineStatusIndicator />

              {!onlyPOSMode ? (
                <>
                  {/* 2. Abrir / Cerrar Turno de Caja */}
                  <button 
                    onClick={handleToggleCashSession}
                    className={`h-8.5 px-2.5 sm:px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                      cashSessionActive 
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100/80" 
                        : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/80"
                    }`}
                    title="Haz clic para abrir o cerrar sesión de caja y corte de turno"
                  >
                    <Clock className={`h-3.5 w-3.5 ${cashSessionActive ? "text-emerald-500 animate-pulse" : "text-amber-500"}`} />
                    <span className="hidden sm:inline">{cashSessionActive ? "Caja Abierta (Cerrar Turno)" : "Caja Cerrada (Abrir Turno)"}</span>
                  </button>

                  {/* 3. Usuario con Rol */}
                  <div className="h-8.5 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs">
                    <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold max-w-[90px] truncate">{currentUser.name}</span>
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded uppercase">
                      {currentUser.role}
                    </span>
                  </div>

                  {/* 5. Botón Modo Claro/Oscuro */}
                  <button 
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    id="main-theme-toggle-btn"
                    className="h-8.5 w-8.5 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
                    title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
                    aria-label="Alternar modo claro/oscuro"
                  >
                    {theme === "light" ? (
                      <Moon className="h-4 w-4 text-slate-700" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-400" />
                    )}
                  </button>

                  {/* 6. Cambiar Sucursal */}
                  <button
                    onClick={() => {
                      handleLogout();
                      setCurrentBranch(null);
                      setActiveBranch(null);
                    }}
                    className="h-8.5 px-2.5 sm:px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/30 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Regresar a la selección de sucursal"
                  >
                    <Store className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Cambiar Sucursal</span>
                  </button>

                  {/* 7. Cerrar Sesión */}
                  <button
                    onClick={handleLogout}
                    className="h-8.5 px-2.5 sm:px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Cerrar sesión activa"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Cerrar Sesión</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="h-8.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Modo Caja
                  </div>

                  <button 
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    className="h-8.5 w-8.5 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
                    title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
                  >
                    {theme === "light" ? <Moon className="h-4 w-4 text-slate-700" /> : <Sun className="h-4 w-4 text-amber-400" />}
                  </button>

                  <button
                    onClick={handleLogout}
                    className="h-8.5 px-3.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Regresar al Catálogo Público"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Salir de Caja</span>
                  </button>
                </>
              )}

            </div>
          </div>

          {/* TIER 2 (Fila Inferior): Barra de navegación centrada con Tablero, Vender Ahora / POS, Inventario, Clientes, Compras, Finanzas, Recibos, Seguridad */}
          {!onlyPOSMode && (
            <div className="w-full flex justify-center items-center pt-1 border-t border-gray-100 dark:border-slate-800/60">
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 bg-slate-100/90 dark:bg-slate-950/80 p-1 sm:p-1.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 overflow-x-auto max-w-full no-scrollbar shadow-inner">
                <button 
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === "dashboard"
                      ? "bg-emerald-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                  }`}
                >
                  <LayoutDashboard className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Tablero</span>
                </button>
                {menuDetails.map(item => {
                  const Icon = item.icon;
                  const isSelected = activeTab === item.id;
                  const displayLabel = item.id === "pos" ? "Vender Ahora" : item.badge;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        isSelected 
                          ? "bg-emerald-600 text-white shadow-xs font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{displayLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto max-w-[1720px] mx-auto w-full space-y-6">
        
        {/* OFFLINE NOTICE BANNER */}
        {!netStatus.isOnline && (
          <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs flex items-center justify-between gap-3 shadow-xs font-sans animate-fade-in">
            <div className="flex items-center gap-2.5">
              <WifiOff className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-extrabold uppercase tracking-wide block">Modo Sin Conexión Activo (Doble Función Offline / Online)</span>
                <span className="text-[11px] opacity-90">
                  El sistema está operando de forma local. Todas las ventas, tickets y cobros se están guardando localmente en este dispositivo. Al restablecerse la conexión a Internet, los cambios en el inventario y ventas se sincronizarán automáticamente con la nube.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* UPPER BANNER / BREADCRUMBS */}
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
                      {activeTab === "central_warehouse" && "Almacén General & Distribución"}
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
                {activeTab === "central_warehouse" && "Almacén General & Distribución Maestro"}
                {activeTab === "pos" && "Terminal Punto de Venta (Caja)"}
                {activeTab === "inventory" && "Control y Kárdex de Almacén"}
                {activeTab === "customers" && "Clientes y Saldos Fiados"}
                {activeTab === "purchases" && "Abastecimiento y Cuentas por Pagar"}
                {activeTab === "reports" && "Finanzas, Utilidades y Márgenes"}
                {activeTab === "security" && "Auditoría de Transacciones y RBAC"}
              </h1>
            </div>

            {/* Quick Alert Badges */}
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

        {/* DYNAMIC VIEW ROUTER */}
        <div className="transition-all duration-200">
          
          {/* --- DASHBOARD TAB VIEW (MOSAIC CARDS GRID) --- */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Offline First Engine Overview Widget */}
              <OfflineDashboardWidget />

              {/* Dynamic KPI Cards Bento Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Sales metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#e2e6dd] dark:border-slate-800 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Ventas de Hoy</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      ${todaySalesSum.toFixed(2)}
                    </h3>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Turno activo de caja
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <DollarSign className="h-6 w-6" />
                  </div>
                </div>

                {/* Profit metric */}
                {currentUser.role === UserRole.ADMIN && (
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#e2e6dd] dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Ganancia Estimada</p>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                        ${todayProfitSum.toFixed(2)}
                      </h3>
                      <p className="text-[10px] text-gray-500 dark:text-slate-400">Margen bruto promedio: {todaySalesSum > 0 ? ((todayProfitSum / todaySalesSum) * 100).toFixed(1) : "0"}%</p>
                    </div>
                    <div className="p-3 bg-teal-50 dark:bg-teal-950/35 text-teal-600 dark:text-teal-400 rounded-xl">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                )}

                {/* Ticket metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#e2e6dd] dark:border-slate-800 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Ticket Promedio</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      ${avgTicket.toFixed(2)}
                    </h3>
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">{(db.sales || []).length} compras concretadas hoy</p>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/35 text-orange-600 dark:text-orange-400 rounded-xl">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                </div>

                {/* Outstanding credits total */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#e2e6dd] dark:border-slate-800 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Adeudos de Clientes</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                      ${totalOutstandingCredits.toFixed(2)}
                    </h3>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Cuentas fiadas vigentes
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/35 text-amber-600 dark:text-amber-400 rounded-xl">
                    <Users className="h-6 w-6" />
                  </div>
                </div>

              </div>

              {/* SECTION HEADER FOR MOSAIC */}
              <div className="pt-6 border-t border-[#e2e6dd] dark:border-slate-800 space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-emerald-600 shadow-sm ring-4 ring-emerald-500/20" />
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                    Panel Principal de Operaciones
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium pl-6.5">
                  Selecciona el módulo correspondiente para operar o administrar el sistema de abarrotes Mazal.
                </p>
              </div>

              {/* THE MOSAIC CARDS GRID - 2 OR 3 COLUMNS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                
                {menuDetails.map((menu) => {
                  const Icon = menu.icon;
                  const allowed = isRoleAllowed(menu.id);
                  return (
                    <div
                      key={menu.id}
                      onClick={() => handleTabClick(menu.id)}
                      className={`group p-6 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer ${
                        allowed 
                          ? "bg-white dark:bg-slate-900 border-[#e2e6dd] dark:border-slate-800 hover:shadow-md hover:border-emerald-300 dark:hover:border-slate-700 hover:-translate-y-1" 
                          : "bg-gray-100/70 dark:bg-slate-950/40 border-gray-200 dark:border-slate-900 opacity-70"
                      }`}
                      id={`mosaic-card-${menu.id}`}
                    >
                      <div>
                        {/* Header card icon and lock display */}
                        <div className="flex items-center justify-between mb-4">
                          <div className={`p-3.5 rounded-xl bg-gradient-to-br ${menu.color} text-white shadow-xs`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          {!allowed ? (
                            <div className="flex items-center gap-1 text-xs text-amber-600 font-bold bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-lg border border-amber-200/40">
                              <Lock className="h-3 w-3" /> Bloqueado
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20 font-mono uppercase">
                              {menu.stats}
                            </span>
                          )}
                        </div>

                        {/* Title and descriptions */}
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {menu.title}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                          {menu.desc}
                        </p>
                      </div>

                      {/* Footer card link */}
                      <div className="mt-6 pt-4 border-t border-gray-55 dark:border-slate-800/50 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>{!allowed ? "Cambiar rol para simular" : "Entrar a operar"}</span>
                        <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all group-hover:translate-x-1" />
                      </div>
                    </div>
                  );
                })}

              </div>

            </div>
          )}

          {/* --- POS MODULE TAB --- */}
          {activeTab === "pos" && (
            <POSModule 
              currentUser={currentUser} 
              cashSessionActive={cashSessionActive}
              onOpenCashSession={handleToggleCashSession}
              onlyPOSMode={onlyPOSMode}
              onSaleComplete={() => {
                if (onlyPOSMode) {
                  handleLogout();
                }
              }}
            />
          )}

          {/* --- INVENTORY MODULE TAB --- */}
          {activeTab === "inventory" && (
            <InventoryModule currentUser={currentUser} currentBranch={currentBranch} />
          )}

          {/* --- CUSTOMERS & CREDIT TAB --- */}
          {activeTab === "customers" && (
            <CustomersModule currentUser={currentUser} />
          )}

          {/* --- PURCHASES & SUPPLIERS TAB --- */}
          {activeTab === "purchases" && (
            <PurchasesModule currentUser={currentUser} />
          )}

          {/* --- REPORTS AND FINANCIAL ANALYTICS --- */}
          {activeTab === "reports" && (
            <FinanceModule currentUser={currentUser} />
          )}

          {/* --- RECEIPTS & TICKETS TAB --- */}
          {activeTab === "receipts" && (
            <ReceiptsModule currentUser={currentUser} />
          )}

          {/* --- SECURITY & AUDIT LOGS TAB --- */}
          {activeTab === "security" && (
            <SecurityModule 
              currentUser={currentUser} 
              onChangeRole={handleChangeRole} 
            />
          )}

        </div>

        {/* Global Application Footer */}
        <footer className="mt-8 pt-4 pb-6 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-[#e2e6dd] dark:border-slate-800">
          <p>Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026</p>
        </footer>

      </main>

      {/* --- PWA NETLIFY OFFLINE MODAL --- */}
      {showPwaModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            <button
              onClick={() => setShowPwaModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-xl">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Funcionamiento Offline (PWA)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sistema Dual: Trabaja con o sin Internet en tu tienda
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  1. Service Worker & Caché Local
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
                  El sistema guarda los archivos necesarios en la memoria del navegador para abrir de forma instantánea aún sin conexión a internet.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  2. Instala la App en PC o Celular (PWA)
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
                  En la barra de direcciones de tu navegador haz clic en <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong> para tener el acceso directo en tu escritorio o celular.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  3. Inventario y Sincronización Automática
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
                  Cada cobro descuenta el inventario de inmediato. Al recuperar la conexión a Internet, el sistema sincroniza automáticamente los cambios con la nube.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowPwaModal(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
