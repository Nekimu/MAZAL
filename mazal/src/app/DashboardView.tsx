/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  ShoppingCart, 
  ArrowRight, 
  Coins, 
  Users, 
  Truck, 
  BarChart3, 
  Package, 
  Receipt, 
  ShieldCheck 
} from "lucide-react";
import { OfflineDashboardWidget } from "../components/OfflineDashboardWidget";
import { Sale, Product } from "../types";

export interface DashboardViewProps {
  salesList: Sale[];
  productsList: Product[];
  customersList: any[];
  cashSessionActive: boolean;
  onNavigateTab: (tabId: string) => void;
  onOpenSyncModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  salesList,
  productsList,
  customersList,
  cashSessionActive,
  onNavigateTab,
  onOpenSyncModal
}) => {
  const todaySalesSum = salesList.reduce((sum: number, s: Sale) => sum + (Number(s?.total) || 0), 0);
  const todayProfitSum = salesList.reduce((sum: number, s: Sale) => sum + (Number(s?.profit) || 0), 0);
  const avgTicket = salesList.length > 0 ? todaySalesSum / salesList.length : 0;
  
  const lowStockCount = productsList.filter((p: Product) => (Number(p?.stock) || 0) <= (Number(p?.stockMin) || 0)).length;
  const criticalExpiryCount = productsList.filter((p: Product) => {
    if (!p?.expiryDate) return false;
    const diff = new Date(p.expiryDate).getTime() - new Date().getTime();
    return diff >= 0 && diff <= 15 * 24 * 60 * 60 * 1000;
  }).length;

  const totalOutstandingCredits = customersList.reduce((sum: number, c: any) => sum + (Number(c?.creditUsed) || 0), 0);

  const menuCards = [
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
      stats: `${salesList.length} recibos guardados`
    },
    {
      id: "security",
      title: "Control de Accesos y Seguridad",
      badge: "Seguridad",
      desc: "Administra cuentas de usuarios, define contraseñas, asigna permisos de rol y audita accesos y movimientos de inventario.",
      icon: ShieldCheck,
      color: "from-blue-600 to-cyan-600",
      stats: "Control RBAC Activo"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Ventas Hoy */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ventas Totales Hoy
            </span>
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              ${todaySalesSum.toFixed(2)} <span className="text-xs font-semibold text-slate-400">MXN</span>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              {salesList.length} tickets emitidos
            </p>
          </div>
        </div>

        {/* Metric 2: Ganancia Estimada */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Utilidad Bruta
            </span>
            <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
              <Coins className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-teal-600 dark:text-teal-400">
              ${todayProfitSum.toFixed(2)} <span className="text-xs font-semibold text-slate-400">MXN</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              Ticket Promedio: ${avgTicket.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Metric 3: Alertas de Stock */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Alertas de Stock
            </span>
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {lowStockCount} <span className="text-xs font-semibold text-slate-400">artículos mínimos</span>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-1">
              {criticalExpiryCount} por caducar en 15 días
            </p>
          </div>
        </div>

        {/* Metric 4: Crédito Fiado Activo */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saldo Fiado Activo
            </span>
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              ${totalOutstandingCredits.toFixed(2)} <span className="text-xs font-semibold text-slate-400">MXN</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              {customersList.filter((c: any) => (Number(c.creditUsed) || 0) > 0).length} clientes con adeudo
            </p>
          </div>
        </div>
      </div>

      {/* Offline Status Widget in Dashboard */}
      <OfflineDashboardWidget onOpenDetails={onOpenSyncModal} />

      {/* Navigation Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {menuCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              onClick={() => onNavigateTab(card.id)}
              className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-2xl bg-gradient-to-br ${card.color} text-white shadow-xs`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {card.badge}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {card.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">
                  {card.stats}
                </span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Ingresar <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
