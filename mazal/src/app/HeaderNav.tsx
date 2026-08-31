/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  Store, 
  Clock, 
  User, 
  Moon, 
  Sun, 
  LogOut, 
  RefreshCw, 
  LayoutDashboard 
} from "lucide-react";
import { MazalLogo } from "../components/MazalLogo";
import { OfflineStatusIndicator } from "../components/OfflineStatusIndicator";

export interface HeaderNavProps {
  currentBranch: string;
  currentUser: { name: string; role: any };
  onlyPOSMode: boolean;
  theme: "light" | "dark";
  cashSessionActive: boolean;
  activeTab: string;
  isSyncing: boolean;
  onToggleTheme: () => void;
  onToggleCashSession: () => void;
  onTriggerManualSync: () => void;
  onChangeBranch: () => void;
  onLogout: () => void;
  onNavigateTab: (tabId: string) => void;
  menuDetails: {
    id: string;
    title: string;
    badge: string;
    icon: any;
  }[];
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentBranch,
  currentUser,
  onlyPOSMode,
  theme,
  cashSessionActive,
  activeTab,
  isSyncing,
  onToggleTheme,
  onToggleCashSession,
  onTriggerManualSync,
  onChangeBranch,
  onLogout,
  onNavigateTab,
  menuDetails
}) => {
  return (
    <nav className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-[#e2e6dd] dark:border-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-3 sm:px-5 lg:px-6 py-2.5 transition-all">
      <div className="w-full max-w-[1720px] mx-auto flex flex-col gap-2.5">
        
        {/* TIER 1: Logos, Branch and Toolbar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          
          {/* Left: Brand & Active Branch */}
          <div className="flex items-center gap-3 shrink-0">
            <div 
              className={`flex items-center gap-2 ${onlyPOSMode ? "" : "cursor-pointer hover:opacity-90 transition-opacity"}`} 
              onClick={() => { if (!onlyPOSMode) onNavigateTab("dashboard"); }}
              title="Ir al Tablero Principal"
            >
              <MazalLogo size="md" />
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 text-xs font-black text-emerald-800 dark:text-emerald-300 font-mono shadow-2xs">
              <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="tracking-wide uppercase">
                {currentBranch === "Sur" ? "MAZAL 2 (SUR)" : "MAZAL 1 (NORTE)"}
              </span>
            </div>
          </div>

          {/* Right: Actions & User */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            <OfflineStatusIndicator />

            <button
              onClick={onTriggerManualSync}
              disabled={isSyncing}
              className="h-8.5 px-2.5 sm:px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="Sincronizar todos los datos con Supabase Cloud ahora"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
            </button>

            {!onlyPOSMode ? (
              <>
                <button 
                  onClick={onToggleCashSession}
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

                <div className="h-8.5 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs">
                  <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold max-w-[90px] truncate">{currentUser.name}</span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded uppercase">
                    {currentUser.role}
                  </span>
                </div>

                <button 
                  onClick={onToggleTheme}
                  id="main-theme-toggle-btn"
                  className="h-8.5 w-8.5 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
                  title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
                >
                  {theme === "light" ? <Moon className="h-4 w-4 text-slate-700" /> : <Sun className="h-4 w-4 text-amber-400" />}
                </button>

                <button
                  onClick={onChangeBranch}
                  className="h-8.5 px-2.5 sm:px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/30 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Regresar a la selección de sucursal"
                >
                  <Store className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cambiar Sucursal</span>
                </button>

                <button
                  onClick={onLogout}
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
                  onClick={onToggleTheme}
                  className="h-8.5 w-8.5 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
                >
                  {theme === "light" ? <Moon className="h-4 w-4 text-slate-700" /> : <Sun className="h-4 w-4 text-amber-400" />}
                </button>

                <button
                  onClick={onLogout}
                  className="h-8.5 px-3.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Salir de Caja</span>
                </button>
              </>
            )}

          </div>
        </div>

        {/* TIER 2: Navigation Bar */}
        {!onlyPOSMode && (
          <div className="w-full flex items-center justify-start sm:justify-center pt-1.5 pb-0.5 border-t border-gray-100 dark:border-slate-800/60 overflow-x-auto no-scrollbar scroll-smooth">
            <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100/90 dark:bg-slate-950/80 p-1 sm:p-1.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 shrink-0 min-w-max px-2.5 shadow-inner">
              <button 
                onClick={() => onNavigateTab("dashboard")}
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
                    onClick={() => onNavigateTab(item.id)}
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
  );
};
