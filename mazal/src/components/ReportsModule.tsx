/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  ArrowUpRight, 
  DollarSign, 
  Activity, 
  PieChart, 
  Calendar, 
  Download, 
  Lightbulb, 
  ArrowDownRight,
  TrendingDown,
  Percent,
  RefreshCw,
  Award,
  CheckCircle2
} from "lucide-react";
import { Product, Sale, Customer, Supplier } from "../types";
import { getDatabase, subscribeToDb } from "../data";

export default function ReportsModule() {
  const [db, setDb] = useState(getDatabase());
  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);
  const [activeSubTab, setActiveSubTab] = useState<"sheets" | "abc" | "stats" | "products">("sheets");
  
  // Custom states for editable opening Balance sheet numbers
  const [initialCash, setInitialCash] = useState<number>(() => {
    const saved = localStorage.getItem("mazal_balance_initial_cash");
    return saved !== null ? parseFloat(saved) : 1000.0;
  });
  const [fixedAssets, setFixedAssets] = useState<number>(() => {
    const saved = localStorage.getItem("mazal_balance_fixed_assets");
    return saved !== null ? parseFloat(saved) : 25000.0;
  });
  const [initialEquityCapital, setInitialEquityCapital] = useState<number>(() => {
    const saved = localStorage.getItem("mazal_balance_initial_equity");
    return saved !== null ? parseFloat(saved) : 20000.0;
  });
  const [isEditingBalanceSettings, setIsEditingBalanceSettings] = useState(false);
  const [tempInitialCash, setTempInitialCash] = useState(String(initialCash));
  const [tempFixedAssets, setTempFixedAssets] = useState(String(fixedAssets));
  const [tempInitialCapital, setTempInitialCapital] = useState(String(initialEquityCapital));

  // Simulated exports
  const [exportMessage, setExportMessage] = useState("");

  const triggerReload = () => {
    setDb(getDatabase());
  };

  // --- DYNAMIC FINANCIAL CALCULATIONS ---
  // Calculates live numbers based on transactions
  const totalSales = db.sales.reduce((sum: number, s: Sale) => sum + s.total, 0);
  const totalCostOfGoods = db.sales.reduce((sum: number, s: Sale) => sum + s.costTotal, 0);
  const grossProfit = totalSales - totalCostOfGoods;
  
  // Expenses sum
  const totalExpenses = db.expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const netProfit = grossProfit - totalExpenses;

  // Balance sheet assets (using our customizable starting values)
  const cashInRegister = initialCash + totalSales - totalExpenses; // Cash register fund + cash sales - paid expenses
  const inventoryValueAtCost = db.products.reduce((sum: number, p: Product) => sum + p.cost * p.stock, 0);
  const accountsReceivable = db.customers.reduce((sum: number, c: Customer) => sum + c.creditUsed, 0);
  const totalCirculatingAssets = cashInRegister + inventoryValueAtCost + accountsReceivable;
  const totalAssets = totalCirculatingAssets + fixedAssets;

  // Liabilities
  const accountsPayable = db.suppliers ? db.suppliers.reduce((sum: number, s: any) => sum + (s.outstandingBalance || 0), 0) : 0;
  const totalLiabilities = accountsPayable;

  // Equity
  const retainedEarnings = totalCirculatingAssets - accountsPayable + fixedAssets - initialEquityCapital;
  const totalEquityAndLiabilities = totalLiabilities + (initialEquityCapital + retainedEarnings);

  // --- ABC INVENTORY ANALYSIS ---
  // A: 80% of value, B: 15%, C: 5%
  const productsWithValues = db.products.map((p: Product) => ({
    product: p,
    totalValue: p.cost * p.stock
  })).sort((a: any, b: any) => b.totalValue - a.totalValue);

  const totalInvValue = productsWithValues.reduce((sum: any, item: any) => sum + item.totalValue, 0);
  
  let accumulatedValue = 0;
  const abcProducts = productsWithValues.map((item: any) => {
    accumulatedValue += item.totalValue;
    const accumulatedPercent = (accumulatedValue / (totalInvValue || 1)) * 100;
    
    let classification = "C";
    if (accumulatedPercent <= 70) classification = "A (Alta Rotación / Valor)";
    else if (accumulatedPercent <= 90) classification = "B (Rotación Media)";

    return {
      ...item,
      accumulatedPercent,
      classification
    };
  });

  // --- PRODUCT SALES & ROTATION ANALYTICS ---
  const productSalesMap: Record<string, { name: string; category: string; quantitySold: number; totalRevenue: number; stock: number; unit: string }> = {};
  
  // Initialize map with all current products
  db.products.forEach((p: Product) => {
    productSalesMap[p.id] = {
      name: p.name,
      category: p.category,
      quantitySold: 0,
      totalRevenue: 0,
      stock: p.stock,
      unit: p.unit
    };
  });

  // Accumulate sales data
  db.sales.forEach((sale: Sale) => {
    sale.items.forEach((item) => {
      if (productSalesMap[item.productId]) {
        productSalesMap[item.productId].quantitySold += item.quantity;
        productSalesMap[item.productId].totalRevenue += item.totalPrice;
      } else {
        productSalesMap[item.productId] = {
          name: item.productName,
          category: "General",
          quantitySold: item.quantity,
          totalRevenue: item.totalPrice,
          stock: 0,
          unit: "pzas"
        };
      }
    });
  });

  const productSalesList = Object.keys(productSalesMap).map((id) => ({
    id,
    ...productSalesMap[id]
  }));

  // Top 10 selling products (sorted descending by quantitySold, only if sold > 0)
  const topSellingProducts = [...productSalesList]
    .filter(p => p.quantitySold > 0)
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  // Bottom 10 selling products (sorted ascending by quantitySold, only if sold > 0)
  const bottomSellingProducts = [...productSalesList]
    .filter(p => p.quantitySold > 0)
    .sort((a, b) => a.quantitySold - b.quantitySold)
    .slice(0, 10);

  // Never sold products (where quantitySold === 0)
  const neverSoldProducts = [...productSalesList]
    .filter(p => p.quantitySold === 0);

  // --- DYNAMIC CATEGORY REVENUE & SHARE ---
  const categoryRevenueMap: Record<string, number> = {};
  let grandTotalRevenue = 0;

  db.sales.forEach((sale: Sale) => {
    sale.items.forEach((item) => {
      const categoryName = productSalesMap[item.productId]?.category || "General";
      categoryRevenueMap[categoryName] = (categoryRevenueMap[categoryName] || 0) + item.totalPrice;
      grandTotalRevenue += item.totalPrice;
    });
  });

  const categoryShares = Object.keys(categoryRevenueMap).map((catName) => {
    const revenue = categoryRevenueMap[catName];
    const percentage = grandTotalRevenue > 0 ? (revenue / grandTotalRevenue) * 100 : 0;
    return {
      category: catName,
      revenue,
      percentage
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // If there are no sales yet, get categories from currently registered products with 0%
  const fallbackCategories = Array.from(new Set(db.products.map(p => p.category || "General")))
    .filter(Boolean)
    .map(cat => ({
      category: cat,
      revenue: 0,
      percentage: 0
    }));

  const activeCategoryShares = categoryShares.length > 0 ? categoryShares : fallbackCategories;

  const handleExport = (format: "Excel" | "PDF", sheetName: string) => {
    try {
      if (format === "Excel" || sheetName.includes("Rotación")) {
        // Build CSV for product rotation
        let csvContent = "";
        
        // 1. TOP SELLING
        csvContent += "--- LOS 10 PRODUCTOS MAS VENDIDOS ---\n";
        csvContent += "Posición,Producto,Categoría,Unidades Vendidas,Ingresos Generados ($)\n";
        topSellingProducts.forEach((p, idx) => {
          csvContent += `"${idx + 1}","${p.name.replace(/"/g, '""')}","${p.category.replace(/"/g, '""')}","${p.quantitySold} ${p.unit}","${p.totalRevenue.toFixed(2)}"\n`;
        });
        csvContent += "\n\n";

        // 2. BOTTOM SELLING
        csvContent += "--- LOS 10 PRODUCTOS MENOS VENDIDOS ---\n";
        csvContent += "Posición,Producto,Categoría,Unidades Vendidas,Ingresos Generados ($)\n";
        bottomSellingProducts.forEach((p, idx) => {
          csvContent += `"${idx + 1}","${p.name.replace(/"/g, '""')}","${p.category.replace(/"/g, '""')}","${p.quantitySold} ${p.unit}","${p.totalRevenue.toFixed(2)}"\n`;
        });
        csvContent += "\n\n";

        // 3. NEVER SOLD
        csvContent += "--- PRODUCTOS SIN VENTAS (INACTIVOS) ---\n";
        csvContent += "Producto,Categoría,Existencia Actual,Unidad\n";
        neverSoldProducts.forEach((p) => {
          csvContent += `"${p.name.replace(/"/g, '""')}","${p.category.replace(/"/g, '""')}","${p.stock}","${p.unit}"\n`;
        });

        // Trigger real file download with UTF-8 byte order mark (\ufeff)
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Mazal_Rotacion_Productos_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage(`Exportado "${sheetName}" en formato Excel con éxito. ¡Comenzando descarga!`);
      } else if (sheetName === "Estado de Resultados") {
        // Build CSV for Income Statement
        let csvContent = "--- ESTADO DE RESULTADOS ---\n";
        csvContent += `Periodo: Hoy en curso\n\n`;
        csvContent += "Concepto,Monto ($ MXN)\n";
        csvContent += `"(+) Ventas de Mercancías","${totalSales.toFixed(2)}"\n`;
        csvContent += `"(-) Costo de lo Vendido","-${totalCostOfGoods.toFixed(2)}"\n`;
        csvContent += `"= Utilidad Bruta","${grossProfit.toFixed(2)}"\n`;
        csvContent += `"(-) Gastos Operativos (Caja Chica)","-${totalExpenses.toFixed(2)}"\n`;
        csvContent += `"= UTILIDAD NETA","${netProfit.toFixed(2)}"\n`;

        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Mazal_Estado_Resultados_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setExportMessage(`Exportado "${sheetName}" con éxito. ¡Comenzando descarga!`);
      } else if (sheetName === "Balance General") {
        // Build CSV for Balance General
        let csvContent = "--- BALANCE GENERAL SITUACIONAL ---\n";
        csvContent += `Corte al: Hoy en curso\n\n`;
        csvContent += "ACTIVO (Bienes y Derechos),Monto ($ MXN),PASIVO Y CAPITAL,Monto ($ MXN)\n";
        csvContent += `"Caja y Fondo","${cashInRegister.toFixed(2)}","Cuentas por Pagar (Prov)","${accountsPayable.toFixed(2)}"\n`;
        csvContent += `"Almacén (Valuado Costo)","${inventoryValueAtCost.toFixed(2)}","Capital Social Inicial","${initialEquityCapital.toFixed(2)}"\n`;
        csvContent += `"Cuentas por Cobrar (Clientes)","${accountsReceivable.toFixed(2)}","",""\n`;
        csvContent += `"Activo Fijo (Muebles)","${fixedAssets.toFixed(2)}","",""\n`;
        csvContent += `"TOTAL ACTIVO","${totalAssets.toFixed(2)}","TOTAL PASIVO Y CAPITAL","${totalEquityAndLiabilities.toFixed(2)}"\n`;

        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Mazal_Balance_General_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setExportMessage(`Exportado "${sheetName}" con éxito. ¡Comenzando descarga!`);
      } else {
        setExportMessage(`Exportando "${sheetName}" en formato ${format}... ¡Descarga lista!`);
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al intentar generar la exportación.");
    }
    setTimeout(() => setExportMessage(""), 4000);
  };

  return (
    <div className="space-y-6" id="reports-module-container">
      
      {/* Top Controls with Segment selector */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold text-gray-850 dark:text-slate-100">Inteligencia de Negocio y Finanzas</h2>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-slate-800 p-1 self-stretch sm:self-auto text-xs font-semibold">
          <button
            onClick={() => setActiveSubTab("sheets")}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === "sheets" ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
          >
            Libros Contables (Estados Financieros)
          </button>
          <button
            onClick={() => setActiveSubTab("abc")}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === "abc" ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
          >
            Análisis ABC de Inventario
          </button>
          <button
            onClick={() => setActiveSubTab("stats")}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === "stats" ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
          >
            Estadísticas de Venta
          </button>
          <button
            onClick={() => setActiveSubTab("products")}
            className={`px-3 py-1.5 rounded-md transition-all ${activeSubTab === "products" ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
          >
            Rotación de Productos (Top/Bottom)
          </button>
        </div>

      </div>

      {exportMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-250 text-xs rounded-xl flex items-center gap-2 font-mono">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{exportMessage}</span>
        </div>
      )}

      {/* --- SUBTAB 1: LIBROS CONTABLES --- */}
      {activeSubTab === "sheets" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* INCOME STATEMENT (Estado de Resultados) */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Estado de Resultados</h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Periodo: Hoy en curso</p>
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => handleExport("PDF", "Estado de Resultados")}
                  className="p-1.5 rounded border border-gray-250 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-850 text-gray-500 hover:text-gray-700"
                  title="Exportar PDF"
                  id="pdf-income-btn"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Income Sheet Rows */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-850">
                <span className="text-gray-600 dark:text-slate-400 font-medium">(+) Ventas de Mercancías</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">${totalSales.toFixed(2)} MXN</span>
              </div>
              
              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-850">
                <span className="text-gray-600 dark:text-slate-400">(-) Costo de lo Vendido</span>
                <span className="font-mono text-gray-700 dark:text-slate-300">-${totalCostOfGoods.toFixed(2)} MXN</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-150 dark:border-slate-800 bg-gray-50 dark:bg-slate-850/50 px-2 rounded font-bold">
                <span className="text-gray-800 dark:text-slate-200">(=) Utilidad Bruta</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">${grossProfit.toFixed(2)} MXN</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-slate-850">
                <span className="text-gray-600 dark:text-slate-400">(-) Gastos Operativos (Caja Chica)</span>
                <span className="font-mono text-gray-700 dark:text-slate-300">-${totalExpenses.toFixed(2)} MXN</span>
              </div>

              <div className="flex justify-between py-2 bg-emerald-500 text-white px-2.5 rounded-lg font-extrabold text-sm">
                <span>(=) UTILIDAD NETA</span>
                <span className="font-mono">${netProfit.toFixed(2)} MXN</span>
              </div>
            </div>

            {/* Micro analytics tips */}
            <div className="p-3 bg-amber-50 dark:bg-slate-850/60 rounded-xl border border-amber-200 dark:border-slate-850 flex gap-2 text-[11px] text-amber-800 dark:text-amber-400">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Rentabilidad del Periodo</p>
                <p className="opacity-90">
                  El margen neto es del <strong>{totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0"}%</strong>. 
                  Un margen saludable para tiendas de abarrotes oscila entre el 15% y 25%.
                </p>
              </div>
            </div>

          </div>

          {/* BALANCE GENERAL (Balance Sheet) */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800 gap-2">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Balance General Situacional</h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Corte de Caja en Tiempo Real</p>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setTempInitialCash(String(initialCash));
                    setTempFixedAssets(String(fixedAssets));
                    setTempInitialCapital(String(initialEquityCapital));
                    setIsEditingBalanceSettings(!isEditingBalanceSettings);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-250 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-850 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer flex items-center gap-1"
                >
                  ⚙️ Ajustar Apertura
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("PDF", "Balance General")}
                  className="p-1.5 rounded-lg border border-gray-250 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-850 text-gray-500 hover:text-gray-700 transition-all cursor-pointer"
                  title="Exportar PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Editable Form */}
            {isEditingBalanceSettings && (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl space-y-3">
                <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide font-mono">
                  Ajustar Cifras Iniciales de Apertura
                </h4>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Modifica los valores iniciales del ERP para adaptarlos a la realidad de tu empresa. Si no deseas tener cifras simuladas, puedes ponerlas en 0.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Caja y Fondo Inicial ($)</label>
                    <input
                      type="number"
                      step="any"
                      value={tempInitialCash}
                      onChange={(e) => setTempInitialCash(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-xs font-mono"
                      placeholder="Ej. 1000.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Activo Fijo / Muebles ($)</label>
                    <input
                      type="number"
                      step="any"
                      value={tempFixedAssets}
                      onChange={(e) => setTempFixedAssets(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-xs font-mono"
                      placeholder="Ej. 25000.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Capital Social Inicial ($)</label>
                    <input
                      type="number"
                      step="any"
                      value={tempInitialCapital}
                      onChange={(e) => setTempInitialCapital(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-xs font-mono"
                      placeholder="Ej. 20000.00"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInitialCash(0);
                      setFixedAssets(0);
                      setInitialEquityCapital(0);
                      localStorage.setItem("mazal_balance_initial_cash", "0");
                      localStorage.setItem("mazal_balance_fixed_assets", "0");
                      localStorage.setItem("mazal_balance_initial_equity", "0");
                      setTempInitialCash("0");
                      setTempFixedAssets("0");
                      setTempInitialCapital("0");
                      setIsEditingBalanceSettings(false);
                    }}
                    className="px-2.5 py-1.5 text-rose-600 hover:text-rose-700 font-bold text-[11px] rounded transition-all cursor-pointer mr-auto"
                  >
                    Poner todo en 0
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingBalanceSettings(false)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold text-[11px] rounded-lg transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashVal = parseFloat(tempInitialCash) || 0;
                      const assetsVal = parseFloat(tempFixedAssets) || 0;
                      const capVal = parseFloat(tempInitialCapital) || 0;
                      
                      setInitialCash(cashVal);
                      setFixedAssets(assetsVal);
                      setInitialEquityCapital(capVal);
                      
                      localStorage.setItem("mazal_balance_initial_cash", String(cashVal));
                      localStorage.setItem("mazal_balance_fixed_assets", String(assetsVal));
                      localStorage.setItem("mazal_balance_initial_equity", String(capVal));
                      
                      setIsEditingBalanceSettings(false);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all cursor-pointer"
                  >
                    Guardar Cifras
                  </button>
                </div>
              </div>
            )}

            {/* Active vs Passive layout */}
            <div className="space-y-4 text-xs">
              
              {/* ACTIVO */}
              <div className="space-y-1.5">
                <h4 className="font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide text-[10px] font-mono">Activo (Bienes y Derechos)</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Caja y Fondo</p>
                    <p className="font-bold font-mono text-gray-800 dark:text-slate-200">${cashInRegister.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Almacén (Valuado Costo)</p>
                    <p className="font-bold font-mono text-gray-800 dark:text-slate-200">${inventoryValueAtCost.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Cuentas por Cobrar (Clientes)</p>
                    <p className="font-bold font-mono text-gray-800 dark:text-slate-200">${accountsReceivable.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Activo Fijo (Muebles)</p>
                    <p className="font-bold font-mono text-gray-800 dark:text-slate-200">${fixedAssets.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex justify-between pt-1 font-bold text-gray-850 dark:text-slate-100 border-t border-dashed">
                  <span>TOTAL ACTIVO:</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">${totalAssets.toFixed(2)} MXN</span>
                </div>
              </div>

              {/* PASIVO Y CAPITAL */}
              <div className="space-y-1.5 pt-2 border-t">
                <h4 className="font-bold text-red-800 dark:text-red-400 uppercase tracking-wide text-[10px] font-mono">Pasivo y Capital</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Cuentas por Pagar (Prov)</p>
                    <p className="font-bold font-mono text-red-600">${accountsPayable.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded bg-gray-50 dark:bg-slate-850">
                    <p className="text-gray-900 dark:text-slate-350 font-medium">Capital Social Inicial</p>
                    <p className="font-bold font-mono text-gray-800 dark:text-slate-200">${initialEquityCapital.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex justify-between pt-1 font-bold text-gray-850 dark:text-slate-100 border-t border-dashed">
                  <span>TOTAL PASIVO Y CAPITAL:</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">${totalEquityAndLiabilities.toFixed(2)} MXN</span>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* --- SUBTAB 2: ANALISIS ABC DE PRODUCTOS --- */}
      {activeSubTab === "abc" && (
        <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-4">
          
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Segmentación de Inventario ABC (Regla de Pareto)</h3>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">Identifica tus productos de mayor valor en bodega</p>
            </div>

            <div className="flex gap-2 text-[11px]">
              <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">A = 70% Valor</span>
              <span className="px-2.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">B = 20% Valor</span>
              <span className="px-2.5 py-0.5 rounded bg-red-100 text-red-800 font-bold border border-red-200">C = 10% Valor</span>
            </div>
          </div>

          {/* ABC Products grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-850 border-b border-gray-150 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                  <th className="p-3">Producto</th>
                  <th className="p-3">Existencia</th>
                  <th className="p-3">Costo Base</th>
                  <th className="p-3">Valor de Bodega</th>
                  <th className="p-3">% Acumulado</th>
                  <th className="p-3 text-center">Clasificación ABC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {abcProducts.map((item, idx) => {
                  const isA = item.classification.startsWith("A");
                  const isB = item.classification.startsWith("B");
                  
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="p-3 font-bold text-gray-800 dark:text-slate-200">
                        {item.product.name}
                        <p className="text-[10px] text-gray-400 font-normal mt-0.5">Categoría: {item.product.category}</p>
                      </td>
                      <td className="p-3 font-mono">{item.product.stock} {item.product.unit}</td>
                      <td className="p-3 font-mono">${item.product.cost.toFixed(2)}</td>
                      <td className="p-3 font-mono font-bold">${item.totalValue.toFixed(2)}</td>
                      <td className="p-3 font-mono">{item.accumulatedPercent.toFixed(1)}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isA 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                            : isB 
                            ? "bg-amber-100 text-amber-850 border border-amber-250"
                            : "bg-red-50 text-red-800 border border-red-100"
                        }`}>
                          Clase {isA ? "A" : isB ? "B" : "C"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* --- SUBTAB 3: ESTADISTICAS DE VENTA --- */}
      {activeSubTab === "stats" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Daily Hourly Pico Chart (SVG) */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-4 lg:col-span-2">
            <div>
              <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Flujo de Tránsito por Horas (Ventas del Día)</h3>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">Detección de horas pico para planificación de personal en cajas</p>
            </div>

            {/* Custom SVG Line/Bar Chart representing sales peak */}
            <div className="h-60 w-full bg-gray-50 dark:bg-slate-950 rounded-xl p-4 border border-gray-100 dark:border-slate-850 relative flex flex-col justify-between">
              
              {/* Simple Chart Grid Lines & Bars */}
              <div className="flex-1 flex items-end justify-between gap-3 px-4 relative">
                
                {/* 08:00 */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500/25 group-hover:bg-emerald-500/50 rounded-t h-[15%] transition-all relative">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$146</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">08:00</span>
                </div>

                {/* 10:00 */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500/25 group-hover:bg-emerald-500/50 rounded-t h-[30%] transition-all relative">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$350</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">10:00</span>
                </div>

                {/* 12:00 (PICO 1) */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500 hover:bg-emerald-600 rounded-t h-[80%] transition-all relative shadow-sm">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$1,120</span>
                  </div>
                  <span className="text-[10px] text-gray-800 dark:text-slate-300 font-mono font-bold">12:00</span>
                </div>

                {/* 14:00 */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500/25 group-hover:bg-emerald-500/50 rounded-t h-[45%] transition-all relative">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$580</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">14:00</span>
                </div>

                {/* 16:00 */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500/25 group-hover:bg-emerald-500/50 rounded-t h-[55%] transition-all relative">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$720</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">16:00</span>
                </div>

                {/* 18:00 (PICO 2) */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500 hover:bg-emerald-600 rounded-t h-[95%] transition-all relative shadow-sm">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$1,350</span>
                  </div>
                  <span className="text-[10px] text-gray-800 dark:text-slate-300 font-mono font-bold">18:00</span>
                </div>

                {/* 20:00 */}
                <div className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full bg-emerald-500/25 group-hover:bg-emerald-500/50 rounded-t h-[25%] transition-all relative">
                    <span className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-1.5 rounded font-mono z-10">$210</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">20:00</span>
                </div>

              </div>

            </div>

          </div>

          {/* DYNAMIC CATEGORIES PROPORTIONS */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm">Participación por Categorías</h3>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">Top de ventas acumuladas por categoría</p>
            </div>

            <div className="space-y-4 text-xs">
              {activeCategoryShares.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-gray-200 dark:border-slate-800 text-center text-gray-400">
                  <p className="font-medium">Sin categorías de productos registradas</p>
                  <p className="text-[10px] mt-1">Crea productos con categorías en el módulo de Inventario para ver las estadísticas.</p>
                </div>
              ) : (
                activeCategoryShares.map((share, idx) => {
                  const colors = ["bg-emerald-500", "bg-teal-500", "bg-amber-500", "bg-indigo-500", "bg-pink-500", "bg-sky-500"];
                  const colorClass = colors[idx % colors.length];
                  return (
                    <div className="space-y-1" key={share.category}>
                      <div className="flex justify-between font-medium">
                        <span className="capitalize">{share.category}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-gray-400 text-[10px]">(${share.revenue.toFixed(2)})</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{share.percentage.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div className={`h-full ${colorClass} rounded-full transition-all duration-500`} style={{ width: `${share.percentage || 1}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
              {grandTotalRevenue === 0 && activeCategoryShares.length > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono text-center pt-2 leading-tight">
                  ⚠️ Mostrando categorías de tu catálogo actual con 0% de ventas. Registra ventas en el módulo de Caja POS para ver su participación real.
                </p>
              )}
            </div>

          </div>

        </div>
      )}

      {/* --- SUBTAB 4: ROTACION DE PRODUCTOS (TOP/BOTTOM) --- */}
      {activeSubTab === "products" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-slate-800 dark:text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" /> Diagnóstico de Rotación de Catálogo (Mazal)
              </h3>
              <p className="text-xs opacity-90">
                Análisis en tiempo real de los artículos estrella (mayor venta), colas de rotación lenta (menor venta) y stock inactivo (nunca vendido).
              </p>
            </div>
            <button
              onClick={() => handleExport("Excel", "Rotación de Productos")}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0"
            >
              <Download className="h-3.5 w-3.5" /> Exportar Informe
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUMN 1: TOP 10 MOST SOLD */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
              <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                <span className="text-[9px] uppercase tracking-wider font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded font-mono">Artículos Estrella</span>
                <h3 className="font-extrabold text-slate-950 dark:text-white text-sm mt-1">Los 10 Más Vendidos</h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Ordenados por volumen total de piezas</p>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {topSellingProducts.map((p, idx) => (
                  <div key={p.id} className="p-2.5 rounded-xl border border-gray-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center font-bold font-mono text-emerald-800 dark:text-emerald-400">
                        {idx + 1}
                      </div>
                      <div className="truncate max-w-[120px]">
                        <p className="font-bold text-slate-850 dark:text-slate-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{p.category}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <p className="font-extrabold text-emerald-600 dark:text-emerald-400">{p.quantitySold} {p.unit}</p>
                      <p className="text-[10px] text-gray-400">${p.totalRevenue.toFixed(2)}</p>
                    </div>
                  </div>
                ))}

                {topSellingProducts.length === 0 && (
                  <p className="text-xs text-center py-10 text-gray-400 font-mono">No hay registros de ventas.</p>
                )}
              </div>
            </div>

            {/* COLUMN 2: BOTTOM 10 LEAST SOLD */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
              <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-mono">Rotación Lenta</span>
                <h3 className="font-extrabold text-slate-950 dark:text-white text-sm mt-1">Los 10 Menos Vendidos</h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Artículos con salida baja (mínimo 1 venta)</p>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {bottomSellingProducts.map((p, idx) => (
                  <div key={p.id} className="p-2.5 rounded-xl border border-gray-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center font-bold font-mono text-amber-800 dark:text-amber-450">
                        {idx + 1}
                      </div>
                      <div className="truncate max-w-[120px]">
                        <p className="font-bold text-slate-850 dark:text-slate-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{p.category}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <p className="font-extrabold text-amber-600 dark:text-amber-500">{p.quantitySold} {p.unit}</p>
                      <p className="text-[10px] text-gray-400">Stock: {p.stock}</p>
                    </div>
                  </div>
                ))}

                {bottomSellingProducts.length === 0 && (
                  <p className="text-xs text-center py-10 text-gray-400 font-mono">No hay artículos con bajas ventas en el rango.</p>
                )}
              </div>
            </div>

            {/* COLUMN 3: NEVER SOLD (DEAD INVENTORY) */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
              <div className="border-b border-gray-100 dark:border-slate-800 pb-3">
                <span className="text-[9px] uppercase tracking-wider font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded font-mono">Inventario Muerto</span>
                <h3 className="font-extrabold text-slate-950 dark:text-white text-sm mt-1">Nunca Vendidos</h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Productos con cero ventas registradas</p>
              </div>

              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {neverSoldProducts.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-xl border border-gray-150 dark:border-slate-850 bg-rose-50/5 dark:bg-slate-950/10 flex items-center justify-between gap-3 text-xs">
                    <div className="truncate max-w-[140px]">
                      <p className="font-bold text-slate-850 dark:text-slate-200 truncate">{p.name}</p>
                      <p className="text-[10px] text-rose-500 font-semibold font-mono">{p.category}</p>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <p className="font-extrabold text-slate-600 dark:text-slate-400">Existencia: {p.stock}</p>
                      <span className="text-[9px] bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-350 px-1.5 py-0.5 rounded font-bold">
                        Sugerir Oferta
                      </span>
                    </div>
                  </div>
                ))}

                {neverSoldProducts.length === 0 && (
                  <p className="text-xs text-center py-10 text-gray-400 font-mono">¡Felicidades! Se ha vendido al menos una pieza de todos los productos.</p>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
