/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck, 
  BarChart3, 
  ShieldCheck, 
  BookOpen, 
  LogOut, 
  Menu, 
  X,
  Sun,
  Moon,
  Store,
  Clock
} from "lucide-react";
import { UserRole, getRolePermissionsForUser } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: { name: string; role: UserRole };
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  cashSessionActive: boolean;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  theme,
  setTheme,
  cashSessionActive
}: SidebarProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permKey: "always" },
    { id: "pos", label: "Punto de Venta", icon: ShoppingCart, permKey: "pos" },
    { id: "inventory", label: "Inventario", icon: Package, permKey: "inventory" },
    { id: "customers", label: "Clientes y Crédito", icon: Users, permKey: "customers" },
    { id: "purchases", label: "Compras y Prov", icon: Truck, permKey: "purchases" },
    { id: "reports", label: "Finanzas y Reportes", icon: BarChart3, permKey: "reports" },
    { id: "security", label: "Seguridad y Auditoría", icon: ShieldCheck, permKey: "security" },
    { id: "docs", label: "Centro de Ingeniería", icon: BookOpen, permKey: "always" },
  ];

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  // Filter menu items dynamically by current user role permissions
  const userPerms = getRolePermissionsForUser(currentUser.role);
  const allowedMenuItems = menuItems.filter(item => {
    if (item.permKey === "always") return true;
    if (currentUser.role === UserRole.ADMIN) return true;
    return !!userPerms[item.permKey as keyof typeof userPerms];
  });

  return (
    <>
      {/* Mobile Toggle Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800 bg-teal-950 dark:bg-slate-900 text-white z-50">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-400" />
          <span className="font-bold tracking-tight">FreshMercado ERP</span>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="p-2 rounded-lg bg-emerald-900/50 hover:bg-emerald-800/50"
          id="mobile-menu-toggle"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main Sidebar Component */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 md:sticky md:flex md:flex-col
        border-r border-gray-200 dark:border-slate-800
        bg-emerald-950 dark:bg-slate-950 text-emerald-100 dark:text-slate-300
        transition-all duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-emerald-900/40 dark:border-slate-800 bg-emerald-900/20 dark:bg-slate-900/40">
          <Store className="h-7 w-7 text-emerald-400" />
          <div className="flex flex-col">
            <span className="font-bold text-white tracking-tight leading-none text-base">FreshMercado</span>
            <span className="text-[10px] text-emerald-300/80 tracking-wider font-mono mt-1">ERP ABARROTES v1.0</span>
          </div>
        </div>

        {/* Current Turn & Cash Session Quick Badge */}
        <div className="px-4 py-3 mx-3 my-4 rounded-xl bg-emerald-900/30 dark:bg-slate-900/50 border border-emerald-800/40 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className={`h-4 w-4 ${cashSessionActive ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-300/70 dark:text-slate-400">Sesión de Caja</span>
              <span className="text-xs font-semibold text-white">
                {cashSessionActive ? "Turno Activo" : "Caja Cerrada"}
              </span>
            </div>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${cashSessionActive ? "bg-emerald-400" : "bg-amber-400"}`} />
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {allowedMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-btn-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${isActive 
                    ? "bg-emerald-600 dark:bg-slate-800 text-white font-semibold shadow-md border-l-4 border-amber-400" 
                    : "hover:bg-emerald-900/50 dark:hover:bg-slate-900 text-emerald-200 hover:text-white dark:text-slate-400 dark:hover:text-slate-200"
                  }
                `}
              >
                <Icon className={`h-4.5 w-4.5 ${isActive ? "text-amber-400" : "text-emerald-300 dark:text-slate-500"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer Area with Theme Switcher and User Profile */}
        <div className="p-4 border-t border-emerald-900/40 dark:border-slate-800 bg-emerald-900/10 dark:bg-slate-900/20 space-y-4">
          
          {/* Light/Dark Toggle */}
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-emerald-300/70 dark:text-slate-400 font-mono">Apariencia</span>
            <button 
              onClick={toggleTheme}
              id="theme-switcher-btn"
              className="p-1.5 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 dark:bg-slate-900 dark:hover:bg-slate-800 border border-emerald-800/40 dark:border-slate-700/60 transition-colors"
              title="Cambiar tema"
            >
              {theme === "light" ? (
                <Moon className="h-4.5 w-4.5 text-amber-300" />
              ) : (
                <Sun className="h-4.5 w-4.5 text-amber-400" />
              )}
            </button>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-900/30 dark:bg-slate-900/40 border border-emerald-800/30 dark:border-slate-800/40">
            <div className="h-9 w-9 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold text-sm">
              {currentUser.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-tight">{currentUser.name}</p>
              <p className="text-[10px] text-emerald-300 dark:text-slate-400 truncate mt-0.5 uppercase tracking-wide font-mono">{currentUser.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
