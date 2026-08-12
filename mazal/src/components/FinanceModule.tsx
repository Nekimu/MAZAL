/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Calendar, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  Wallet, 
  FileText, 
  AlertTriangle, 
  Users, 
  Plus, 
  Search, 
  Trash2, 
  Printer, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  UserCheck, 
  Eye, 
  Edit2,
  Lock,
  Unlock,
  Check
} from "lucide-react";
import { 
  Product, 
  Sale, 
  Customer, 
  Supplier, 
  CashExpense, 
  CashSession, 
  UserRole,
  formatPrice
} from "../types";
import { getDatabase, saveDatabase, subscribeToDb, logAction } from "../data";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

// Shared Visual Constants
const cardClass = "p-5 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-xs transition-all hover:shadow-md";
const titleClass = "text-xs font-bold text-gray-500 dark:text-slate-400 font-sans uppercase tracking-wider";
const valueClass = "text-2xl font-black font-sans tracking-tight text-gray-900 dark:text-white mt-1";
const selectClass = "px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-700 dark:text-gray-200";
const btnPrimary = "flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const btnSec = "flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-bold text-sm rounded-lg transition-all cursor-pointer";
const tableHeader = "px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase font-mono tracking-wider bg-gray-50 dark:bg-slate-950/40 border-b border-gray-200 dark:border-slate-800";
const tableCell = "px-4 py-3.5 text-sm text-gray-700 dark:text-slate-300 font-sans border-b border-gray-100 dark:border-slate-800/60";

export default function FinanceModule({ currentUser }: { currentUser: { name: string; role: string } | null }) {
  const [db, setDb] = useState(getDatabase());
  const [activeSubTab, setActiveSubTab] = useState<"ventas" | "gastos" | "caja" | "cobrar" | "pagar" | "utilidad" | "reportes">("ventas");

  // Filters
  const [branchFilter, setBranchFilter] = useState<string>("Todas");
  const [dateStartFilter, setDateStartFilter] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // Default to start of this month
    return d.toISOString().split("T")[0];
  });
  const [dateEndFilter, setDateEndFilter] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [userFilter, setUserFilter] = useState<string>("Todos");

  // Search Terms
  const [salesSearch, setSalesSearch] = useState("");
  const [expensesSearch, setExpensesSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  // Modals Toggle
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showOpenCajaModal, setShowOpenCajaModal] = useState(false);
  const [showCloseCajaModal, setShowCloseCajaModal] = useState(false);
  const [showAbonoClienteModal, setShowAbonoClienteModal] = useState(false);
  const [showAbonoProveedorModal, setShowAbonoProveedorModal] = useState(false);
  const [showPartialCajaModal, setShowPartialCajaModal] = useState(false);

  // Editing state
  const [editingExpense, setEditingExpense] = useState<CashExpense | null>(null);

  // Forms Input States
  const [expenseForm, setExpenseForm] = useState({
    category: "Gasolina",
    amount: "",
    description: "",
    sucursal: "MAZAL 1",
    observaciones: ""
  });

  const [openCajaForm, setOpenCajaForm] = useState({
    initialFund: "1000"
  });

  const [closeCajaForm, setCloseCajaForm] = useState({
    physicalCash: ""
  });

  const [abonoClienteForm, setAbonoClienteForm] = useState({
    customerId: "",
    amount: "",
    notes: ""
  });

  const [abonoProveedorForm, setAbonoProveedorForm] = useState({
    supplierId: "",
    amount: "",
    notes: ""
  });

  const [partialCajaForm, setPartialCajaForm] = useState({
    type: "Ingreso" as "Ingreso" | "Retiro",
    amount: "",
    description: ""
  });

  // Selected Report for the 'reportes' view
  const [selectedReport, setSelectedReport] = useState<"ventas" | "compras" | "inventario" | "clientes" | "proveedores" | "caja" | "gastos" | "utilidades" | "existencias">("ventas");

  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);

  // Helper arrays
  const sucursales = ["Todas", "MAZAL 1", "MAZAL 2"];
  const expenseCategories = [
    "Gasolina",
    "Casetas",
    "Papelería",
    "Internet",
    "Agua",
    "Luz",
    "Renta",
    "Sueldos",
    "Mantenimiento",
    "Publicidad",
    "Otros"
  ];

  const currentUserName = currentUser?.name || "Administrador";
  const currentUserRole = currentUser?.role || "Administrador";

  // Active Cash Session finder
  const activeSession = (db.cashSessions || []).find((s: CashSession) => s.status === "Abierta");

  // --- CORE DATABASE MUTATIONS ---
  
  const handleAddOrEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseForm.amount);
    if (!expenseForm.description || isNaN(amt) || amt <= 0) {
      alert("Por favor introduce una descripción y un monto válido.");
      return;
    }

    const nextDb = { ...db };
    const dateNow = new Date().toISOString().substring(0, 10);
    const timeNow = new Date().toLocaleTimeString("es-MX", { hour12: false });

    if (editingExpense) {
      // Edit mode
      nextDb.expenses = (db.expenses || []).map((exp: CashExpense) => {
        if (exp.id === editingExpense.id) {
          return {
            ...exp,
            category: expenseForm.category,
            amount: amt,
            description: expenseForm.description,
            sucursal: expenseForm.sucursal,
            observaciones: expenseForm.observaciones
          };
        }
        return exp;
      });
      await logAction(currentUserName, currentUserRole, "EDICION_GASTO", `Se modificó gasto ${editingExpense.id} por $${amt} MXN (${expenseForm.category})`);
    } else {
      // Create mode
      const expItem: CashExpense = {
        id: "EXP_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        description: expenseForm.description,
        amount: amt,
        category: expenseForm.category,
        date: dateNow,
        time: timeNow,
        user: currentUserName,
        sucursal: expenseForm.sucursal,
        observaciones: expenseForm.observaciones,
        status: "Aprobado"
      };
      nextDb.expenses = [expItem, ...(db.expenses || [])];
      await logAction(currentUserName, currentUserRole, "REGISTRO_GASTO", `Se registró gasto manual por $${amt} MXN (${expenseForm.category})`);
    }

    await saveDatabase(nextDb);
    setExpenseForm({ category: "Gasolina", amount: "", description: "", sucursal: "Sucursal Norte", observaciones: "" });
    setEditingExpense(null);
    setShowExpenseModal(false);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("¿Está seguro de eliminar este registro de gasto?")) return;
    const target = (db.expenses || []).find((e: CashExpense) => e.id === id);
    if (!target) return;

    const nextDb = { ...db };
    nextDb.expenses = (db.expenses || []).filter((e: CashExpense) => e.id !== id);
    await saveDatabase(nextDb);
    await logAction(currentUserName, currentUserRole, "ELIMINAR_GASTO", `Se eliminó gasto ${id} de $${target.amount} MXN`);
  };

  const handleOpenCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    const fund = parseFloat(openCajaForm.initialFund);
    if (isNaN(fund) || fund < 0) {
      alert("Introduce un fondo inicial de caja válido.");
      return;
    }

    const nextDb = { ...db };
    const dateStr = new Date().toISOString().replace("T", " ").substring(0, 19);

    const newSess: CashSession = {
      id: "SESS_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      startTime: dateStr,
      openedBy: currentUserName,
      initialCash: fund,
      status: "Abierta",
      salesTotal: 0,
      expensesTotal: 0
    };

    nextDb.cashSessions = [newSess, ...(db.cashSessions || [])];
    await saveDatabase(nextDb);
    await logAction(currentUserName, currentUserRole, "APERTURA_CAJA", `Apertura de caja con fondo inicial de $${fund} MXN`);
    setShowOpenCajaModal(false);
  };

  const handleCloseCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const realCash = parseFloat(closeCajaForm.physicalCash);
    if (isNaN(realCash) || realCash < 0) {
      alert("Por favor introduce el monto físico real de efectivo en caja.");
      return;
    }

    // Compute expected cash based on: initialFund + (cash sales) - (cash expenses/withdrawals) + (cash reinforcements)
    // Find sales during this session's window
    const sessionSales = (db.sales || []).filter((s: Sale) => s.date >= activeSession.startTime && s.paymentMethod === "Efectivo");
    const sessionSalesVal = sessionSales.reduce((acc: number, s: Sale) => acc + s.total, 0);

    const sessionExpenses = (db.expenses || []).filter((ex: CashExpense) => ex.date + " " + (ex.time || "00:00:00") >= activeSession.startTime);
    const sessionExpensesVal = sessionExpenses.reduce((acc: number, ex: CashExpense) => acc + ex.amount, 0);

    const expected = activeSession.initialCash + sessionSalesVal - sessionExpensesVal;

    const nextDb = { ...db };
    nextDb.cashSessions = (db.cashSessions || []).map((s: CashSession) => {
      if (s.id === activeSession.id) {
        return {
          ...s,
          status: "Cerrada" as const,
          endTime: new Date().toISOString().replace("T", " ").substring(0, 19),
          finalCash: realCash,
          salesTotal: sessionSalesVal,
          expensesTotal: sessionExpensesVal,
          expectedFinalCash: expected
        };
      }
      return s;
    });

    await saveDatabase(nextDb);
    await logAction(currentUserName, currentUserRole, "CIERRE_CAJA", `Cierre de caja. Real: $${realCash}. Esperado: $${expected}. Dif: $${realCash - expected}`);
    setCloseCajaForm({ physicalCash: "" });
    setShowCloseCajaModal(false);
  };

  const handleRegisterPartialMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(partialCajaForm.amount);
    if (isNaN(amt) || amt <= 0 || !partialCajaForm.description) {
      alert("Por favor introduce una cantidad y descripción válida.");
      return;
    }

    const nextDb = { ...db };
    const dateNow = new Date().toISOString().substring(0, 10);
    const timeNow = new Date().toLocaleTimeString("es-MX", { hour12: false });

    if (partialCajaForm.type === "Ingreso") {
      // Inflow modeled as inverse expense / positive log
      const ingressItem: CashExpense = {
        id: "ING_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        description: `[Ingreso de Caja] ${partialCajaForm.description}`,
        amount: -amt, // negative expenses = positive cash
        category: "Otros",
        date: dateNow,
        time: timeNow,
        user: currentUserName,
        sucursal: "MAZAL 1",
        observaciones: "Ingreso/Refuerzo parcial de caja"
      };
      nextDb.expenses = [ingressItem, ...(db.expenses || [])];
      await logAction(currentUserName, currentUserRole, "INGRESO_CAJA", `Refuerzo de caja de $${amt} MXN: ${partialCajaForm.description}`);
    } else {
      // Outflow
      const egressItem: CashExpense = {
        id: "RET_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        description: `[Retiro de Caja] ${partialCajaForm.description}`,
        amount: amt,
        category: "Otros",
        date: dateNow,
        time: timeNow,
        user: currentUserName,
        sucursal: "MAZAL 1",
        observaciones: "Retiro de efectivo / Pago rápido"
      };
      nextDb.expenses = [egressItem, ...(db.expenses || [])];
      await logAction(currentUserName, currentUserRole, "RETIRO_CAJA", `Retiro de efectivo de caja de $${amt} MXN: ${partialCajaForm.description}`);
    }

    await saveDatabase(nextDb);
    setPartialCajaForm({ type: "Ingreso", amount: "", description: "" });
    setShowPartialCajaModal(false);
  };

  const handleAbonoCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(abonoClienteForm.amount);
    if (!abonoClienteForm.customerId || isNaN(amt) || amt <= 0) {
      alert("Por favor selecciona un cliente y proporciona un monto válido.");
      return;
    }

    const nextDb = { ...db };
    nextDb.customers = (db.customers || []).map((c: Customer) => {
      if (c.id === abonoClienteForm.customerId) {
        const nextCreditUsed = Math.max(0, (c.creditUsed || 0) - amt);
        return {
          ...c,
          creditUsed: nextCreditUsed,
          notes: `${c.notes || ""}\n[${new Date().toLocaleDateString()}] Abono recibido por $${amt}.`
        };
      }
      return c;
    });

    // Record credit transaction
    const newCreditLog = {
      id: "CRH_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      customerId: abonoClienteForm.customerId,
      customerName: (db.customers || []).find((c: Customer) => c.id === abonoClienteForm.customerId)?.name || "Cliente",
      amount: amt,
      type: "Abono",
      date: new Date().toISOString().replace("T", " ").substring(0, 19),
      notes: abonoClienteForm.notes || "Abono a cuenta de crédito"
    };
    nextDb.creditHistory = [newCreditLog, ...(db.creditHistory || [])];

    await saveDatabase(nextDb);
    await logAction(currentUserName, currentUserRole, "ABONO_CLIENTE", `Abono de $${amt} MXN al cliente ID: ${abonoClienteForm.customerId}`);
    setAbonoClienteForm({ customerId: "", amount: "", notes: "" });
    setShowAbonoClienteModal(false);
  };

  const handleAbonoProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(abonoProveedorForm.amount);
    if (!abonoProveedorForm.supplierId || isNaN(amt) || amt <= 0) {
      alert("Por favor selecciona un proveedor y proporciona un monto de pago válido.");
      return;
    }

    const nextDb = { ...db };
    nextDb.suppliers = (db.suppliers || []).map((s: Supplier) => {
      if (s.id === abonoProveedorForm.supplierId) {
        const nextBalance = Math.max(0, (s.outstandingBalance || 0) - amt);
        return {
          ...s,
          outstandingBalance: nextBalance
        };
      }
      return s;
    });

    await saveDatabase(nextDb);
    await logAction(currentUserName, currentUserRole, "ABONO_PROVEEDOR", `Pago a proveedor de $${amt} MXN al ID: ${abonoProveedorForm.supplierId}`);
    setAbonoProveedorForm({ supplierId: "", amount: "", notes: "" });
    setShowAbonoProveedorModal(false);
  };

  // --- DATA FILTER LOGIC FOR SALES & EXPENSES ---
  const rawSalesList = db.sales || [];
  const rawExpensesList = db.expenses || [];

  const filterAndSearchSales = () => {
    return rawSalesList.filter((sale: Sale) => {
      const saleBranch = (sale as any).branch || "MAZAL 1";
      const matchBranch = branchFilter === "Todas" || saleBranch === branchFilter;
      const matchDate = sale.date.substring(0, 10) >= dateStartFilter && sale.date.substring(0, 10) <= dateEndFilter;
      const matchUser = userFilter === "Todos" || sale.userName === userFilter;
      const matchSearch = !salesSearch || 
        sale.id.toLowerCase().includes(salesSearch.toLowerCase()) || 
        (sale.customerName || "").toLowerCase().includes(salesSearch.toLowerCase()) ||
        sale.userName.toLowerCase().includes(salesSearch.toLowerCase());
      return matchBranch && matchDate && matchUser && matchSearch;
    });
  };

  const filterAndSearchExpenses = () => {
    return rawExpensesList.filter((e: CashExpense) => {
      const matchBranch = branchFilter === "Todas" || e.sucursal === branchFilter;
      const matchDate = e.date >= dateStartFilter && e.date <= dateEndFilter;
      const matchSearch = !expensesSearch || 
        e.description.toLowerCase().includes(expensesSearch.toLowerCase()) || 
        e.category.toLowerCase().includes(expensesSearch.toLowerCase()) ||
        e.user.toLowerCase().includes(expensesSearch.toLowerCase());
      return matchBranch && matchDate && matchSearch;
    });
  };

  const filteredSales = filterAndSearchSales();
  const filteredExpenses = filterAndSearchExpenses();

  // --- STATS COMPUTATION FOR MAIN METRICS ---
  const totalSalesAmount = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const totalSalesCost = filteredSales.reduce((acc, s) => acc + (s.costTotal || 0), 0);
  const totalSalesProfit = totalSalesAmount - totalSalesCost;
  const totalExpensesAmount = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  const totalNetProfit = totalSalesProfit - totalExpensesAmount;

  // --- BALANCE GENERAL & GRAPHIC METRICS COMPUTATION ---
  const inventoryTotalValuation = (db.products || []).reduce((acc: number, p: Product) => acc + ((p.stock || 0) * (p.cost || p.priceMin * 0.7)), 0);
  const totalReceivables = (db.customers || []).reduce((acc: number, c: Customer) => acc + (c.creditUsed || 0), 0);
  const totalPayables = (db.suppliers || []).reduce((acc: number, s: Supplier) => acc + (s.outstandingBalance || 0), 0);
  const cashInStore = (db.cashSessions || []).filter((cs: CashSession) => cs.status === "Abierta").reduce((acc: number, cs: CashSession) => acc + cs.initialCash, 0) + Math.max(0, totalNetProfit);

  const totalAssets = inventoryTotalValuation + totalReceivables + Math.max(0, cashInStore);
  const totalLiabilities = totalPayables;
  const netEquity = totalAssets - totalLiabilities;

  // Expense categories breakdown for donut/bar charts
  const expenseByCategoryMap = filteredExpenses.reduce((acc: Record<string, number>, exp: CashExpense) => {
    const cat = exp.category || "Otros";
    acc[cat] = (acc[cat] || 0) + exp.amount;
    return acc;
  }, {});

  const topExpenseCategories = (Object.entries(expenseByCategoryMap) as [string, number][])
    .sort((a, b) => b[1] - a[1]);

  // Sales trend computation for historical peaks/valleys chart
  const salesByDateMap = (filteredSales || []).reduce((acc: Record<string, number>, s: Sale) => {
    const dateKey = (s.date || "").substring(0, 10);
    if (dateKey) {
      acc[dateKey] = (acc[dateKey] || 0) + s.total;
    }
    return acc;
  }, {});

  const sortedSalesDates = Object.keys(salesByDateMap).sort();
  const salesTrendList = sortedSalesDates.map(date => ({
    date,
    shortDate: date.length >= 10 ? `${date.substring(8, 10)}/${date.substring(5, 7)}` : date,
    total: salesByDateMap[date]
  }));

  const maxSaleDay = salesTrendList.length > 0
    ? salesTrendList.reduce((max, d) => d.total > max.total ? d : max, salesTrendList[0])
    : null;

  const minSaleDay = salesTrendList.length > 0
    ? salesTrendList.reduce((min, d) => d.total < min.total ? d : min, salesTrendList[0])
    : null;

  const maxSaleValue = maxSaleDay ? maxSaleDay.total : 1;

  // Uniquely identify sellers/cashiers in database for filter dropdowns
  const uniqueSellers = Array.from(new Set(rawSalesList.map((s: Sale) => s.userName).filter(Boolean)));

  // --- SYSTEM REPORT COMPILING ---
  const compileReportData = () => {
    switch (selectedReport) {
      case "ventas":
        return filteredSales.map(s => ({
          ID: s.id,
          Fecha: s.date,
          Cliente: s.customerName || "Venta de Mostrador",
          Cajero: s.userName,
          Sucursal: (s as any).branch || "MAZAL 1",
          Metodo: s.paymentMethod,
          Total: `$${s.total.toFixed(2)}`
        }));
      case "compras":
        return (db.purchaseOrders || []).map((po: any) => ({
          ID: po.id,
          Fecha: po.date,
          Proveedor: po.supplierName,
          Estatus: po.status,
          Total: `$${(po.total || 0).toFixed(2)}`
        }));
      case "inventario":
      case "existencias":
        return (db.products || []).map((p: Product) => ({
          SKU: p.sku || "N/A",
          Producto: p.name,
          Marca: p.brand || "Generico",
          Categoria: p.category,
          Existencia: `${p.stock} ${p.unit}`,
          Costo: `$${formatPrice(p.cost)}`,
          Precio: `$${formatPrice(p.priceMin)}`,
          Valuacion: `$${formatPrice(p.stock * p.cost)}`
        }));
      case "clientes":
        return (db.customers || []).map((c: Customer) => ({
          Nombre: c.name,
          Telefono: c.phone || "N/A",
          RFC: c.rfc || "XAXX010101000",
          "Limite Credito": `$${c.creditLimit.toFixed(2)}`,
          "Saldo Deudor": `$${(c.creditUsed || 0).toFixed(2)}`,
          Estado: c.status
        }));
      case "proveedores":
        return (db.suppliers || []).map((s: Supplier) => ({
          Nombre: s.name,
          Contacto: s.contact,
          Telefono: s.phone || "N/A",
          "Saldo Pendiente": `$${(s.outstandingBalance || 0).toFixed(2)}`,
          Email: s.email || "N/A"
        }));
      case "caja":
        return (db.cashSessions || []).map((cs: CashSession) => ({
          ID: cs.id,
          Inicio: cs.startTime,
          Fin: cs.endTime || "Sesion Activa",
          Responsable: cs.openedBy,
          "Fondo Inicial": `$${cs.initialCash.toFixed(2)}`,
          "Efectivo Real": cs.finalCash ? `$${cs.finalCash.toFixed(2)}` : "Abierta",
          Diferencia: cs.finalCash && cs.expectedFinalCash ? `$${(cs.finalCash - cs.expectedFinalCash).toFixed(2)}` : "N/A"
        }));
      case "gastos":
        return filteredExpenses.map(e => ({
          ID: e.id,
          Fecha: `${e.date} ${e.time || ""}`,
          Categoria: e.category,
          Descripcion: e.description,
          Monto: `$${e.amount.toFixed(2)}`,
          Sucursal: e.sucursal || "MAZAL 1",
          Empleado: e.user
        }));
      case "utilidades":
        return [
          { Concepto: "Ventas Totales", Valor: `$${totalSalesAmount.toFixed(2)}` },
          { Concepto: "Costo de Mercancia (COGS)", Valor: `-$${totalSalesCost.toFixed(2)}` },
          { Concepto: "Utilidad Bruta", Valor: `$${totalSalesProfit.toFixed(2)}` },
          { Concepto: "Gastos Operativos Registrados", Valor: `-$${totalExpensesAmount.toFixed(2)}` },
          { Concepto: "Utilidad Neta del Periodo", Valor: `$${totalNetProfit.toFixed(2)}` }
        ];
      default:
        return [];
    }
  };

  const handlePrintReport = () => {
    const reportTitle = `Reporte de ${selectedReport.toUpperCase()} - Sistema Mazal`;
    const reportData = compileReportData();
    if (reportData.length === 0) {
      alert("No hay información para imprimir.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const headers = Object.keys(reportData[0]);
    const rowsHtml = reportData.map(row => {
      const cells = headers.map(header => `<td>${(row as any)[header]}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 8px; margin-bottom: 20px; color: #065f46; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background-color: #f3f4f6; color: #374151; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #e5e7eb; text-transform: uppercase; }
            td { padding: 8px; border: 1px solid #e5e7eb; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .footer { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; font-size: 10px; text-align: center; color: #999; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div class="meta">
            Generado el: ${new Date().toLocaleString()}<br/>
            Usuario: ${currentUserName} (${currentUserRole})<br/>
            Filtros: Periodo ${dateStartFilter} a ${dateEndFilter} | Sucursal: ${branchFilter}
          </div>
          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            Sistema Mazal ERP - Versión de Migración Web Modernizada. Sabor Tradicional Sin Alteración.
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const reportData = compileReportData();
    if (reportData.length === 0) {
      alert("No hay información para exportar.");
      return;
    }

    const headers = Object.keys(reportData[0]);
    const csvContent = [
      headers.join(","),
      ...reportData.map(row => headers.map(h => {
        let val = String((row as any)[h]).replace(/"/g, '""');
        if (val.includes(",") || val.includes("\n")) {
          val = `"${val}"`;
        }
        return val;
      }).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_${selectedReport}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-teal-950 dark:bg-slate-900 text-white shadow-md border border-emerald-900/30 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight font-sans">Módulo Financiero Mazal</h1>
            <p className="text-xs text-emerald-300/80 dark:text-slate-400 font-mono">Consolidación Contable, Caja Chica y Reportes sin Inteligencia Artificial</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-col">
            <span className="text-[10px] text-emerald-300/60 uppercase font-bold tracking-wider mb-1">Sucursal</span>
            <select 
              value={branchFilter} 
              onChange={e => setBranchFilter(e.target.value)} 
              className="px-2.5 py-1.5 rounded-lg text-xs bg-teal-900/50 text-white border border-teal-800/80 focus:ring-1 focus:ring-emerald-400 focus:outline-none animate-none"
            >
              {sucursales.map(s => <option key={s} value={s} className="bg-teal-950">{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-emerald-300/60 uppercase font-bold tracking-wider mb-1">Desde</span>
            <input 
              type="date" 
              value={dateStartFilter} 
              onChange={e => setDateStartFilter(e.target.value)} 
              className="px-2.5 py-1 rounded-lg text-xs bg-teal-900/50 text-white border border-teal-800/80 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-emerald-300/60 uppercase font-bold tracking-wider mb-1">Hasta</span>
            <input 
              type="date" 
              value={dateEndFilter} 
              onChange={e => setDateEndFilter(e.target.value)} 
              className="px-2.5 py-1 rounded-lg text-xs bg-teal-900/50 text-white border border-teal-800/80 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-col pt-4">
            <button 
              onClick={() => {
                const startM = new Date();
                startM.setDate(1);
                setDateStartFilter(startM.toISOString().split("T")[0]);
                setDateEndFilter(new Date().toISOString().split("T")[0]);
                setBranchFilter("Todas");
                setUserFilter("Todos");
              }} 
              className="p-1.5 bg-teal-900 hover:bg-teal-800 rounded-lg text-emerald-300 transition-colors"
              title="Restablecer Filtros"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Widgets Cards Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <div>
              <p className={titleClass}>Ventas del Periodo</p>
              <p className={valueClass}>${totalSalesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-xs font-mono text-gray-500 dark:text-slate-400">
            En base a <span className="font-bold text-gray-700 dark:text-gray-200">{filteredSales.length}</span> tickets emitidos
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <div>
              <p className={titleClass}>Gastos Generales</p>
              <p className={valueClass}>${totalExpensesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-xs font-mono text-gray-500 dark:text-slate-400">
            Suma de <span className="font-bold text-gray-700 dark:text-gray-200">{filteredExpenses.length}</span> egresos operativos
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <div>
              <p className={titleClass}>Utilidad Bruta</p>
              <p className={valueClass}>${totalSalesProfit.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-xs font-mono text-gray-500 dark:text-slate-400">
            Margen: <span className="font-bold text-gray-700 dark:text-gray-200">{totalSalesAmount > 0 ? ((totalSalesProfit / totalSalesAmount) * 100).toFixed(1) : 0}%</span> bruto
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex justify-between items-start">
            <div>
              <p className={titleClass}>Utilidad Neta (Pérdidas/G.)</p>
              <p className={`text-2xl font-black font-sans tracking-tight mt-1 ${totalNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                ${totalNetProfit.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`p-2 rounded-lg border ${totalNetProfit >= 0 ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 border-teal-100" : "bg-red-50 dark:bg-red-950/40 text-red-600 border-red-100"}`}>
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-xs font-mono text-gray-500 dark:text-slate-400">
            Utilidad real neta del periodo
          </div>
        </div>
      </div>

      {/* --- VISUAL CHARTS & BALANCE GENERAL GRAPHICS PANEL --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CHART 1: Balance General Structure (Activos vs Pasivos & Patrimonio) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-850 pb-3">
            <div>
              <h4 className="font-extrabold text-sm text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                Balance General Ilustrativo
              </h4>
              <p className="text-[10px] text-gray-400 font-mono">Estructura Patrimonial: Activos, Pasivos y Capital</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
              Patrimonio: ${netEquity.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Activos Stack Bar */}
            <div>
              <div className="flex justify-between text-[11px] font-bold mb-1">
                <span className="text-emerald-700 dark:text-emerald-400">Total Activos (Recursos)</span>
                <span className="font-mono text-gray-900 dark:text-white">${totalAssets.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 h-full transition-all" 
                  style={{ width: `${totalAssets > 0 ? Math.min(100, (inventoryTotalValuation / totalAssets) * 100) : 0}%` }}
                  title={`Inventarios: $${inventoryTotalValuation.toFixed(2)}`}
                />
                <div 
                  className="bg-blue-500 h-full transition-all" 
                  style={{ width: `${totalAssets > 0 ? Math.min(100, (totalReceivables / totalAssets) * 100) : 0}%` }}
                  title={`Cuentas por Cobrar: $${totalReceivables.toFixed(2)}`}
                />
                <div 
                  className="bg-teal-400 h-full transition-all" 
                  style={{ width: `${totalAssets > 0 ? Math.min(100, (cashInStore / totalAssets) * 100) : 0}%` }}
                  title={`Efectivo en Caja/Fluido: $${cashInStore.toFixed(2)}`}
                />
              </div>
            </div>

            {/* Pasivos Stack Bar */}
            <div>
              <div className="flex justify-between text-[11px] font-bold mb-1">
                <span className="text-rose-600 dark:text-rose-400">Total Pasivos (Deudas Proveedores)</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">${totalLiabilities.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full transition-all" 
                  style={{ width: `${totalAssets > 0 ? Math.min(100, (totalLiabilities / totalAssets) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Asset Item Breakdown Grid */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-slate-850 text-[10px]">
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-2 rounded-lg border border-emerald-100/40">
                <span className="text-emerald-700 dark:text-emerald-400 font-bold block">📦 Inventarios</span>
                <span className="font-mono font-bold text-gray-800 dark:text-slate-200">${inventoryTotalValuation.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="bg-blue-50/50 dark:bg-blue-950/20 p-2 rounded-lg border border-blue-100/40">
                <span className="text-blue-700 dark:text-blue-400 font-bold block">👥 CxC Clientes</span>
                <span className="font-mono font-bold text-gray-800 dark:text-slate-200">${totalReceivables.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg border border-rose-100/40">
                <span className="text-rose-700 dark:text-rose-400 font-bold block">🏭 CxP Proveed.</span>
                <span className="font-mono font-bold text-gray-800 dark:text-slate-200">${totalLiabilities.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 2: Performance Comparison (Ventas vs COGS vs Gastos vs Utilidad Neta) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-850 pb-3">
            <div>
              <h4 className="font-extrabold text-sm text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                Rendimiento y Flujo Monetario
              </h4>
              <p className="text-[10px] text-gray-400 font-mono">Comparativa de ingresos, costos y egresos del periodo</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Sales Bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-gray-600 dark:text-slate-400">Ventas Totales (Ingresos)</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${totalSalesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-full rounded-full" />
              </div>
            </div>

            {/* COGS Bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-gray-600 dark:text-slate-400">Costo de Ventas (COGS)</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">-${totalSalesCost.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full" 
                  style={{ width: `${totalSalesAmount > 0 ? Math.min(100, (totalSalesCost / totalSalesAmount) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Expenses Bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-gray-600 dark:text-slate-400">Gastos Operativos</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">-${totalExpensesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full rounded-full" 
                  style={{ width: `${totalSalesAmount > 0 ? Math.min(100, (totalExpensesAmount / totalSalesAmount) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Net Profit Bar */}
            <div className="pt-1">
              <div className="flex justify-between text-[11px] font-bold mb-1">
                <span className="text-gray-800 dark:text-slate-200">Utilidad Neta Residual</span>
                <span className={`font-mono ${totalNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                  ${totalNetProfit.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${totalNetProfit >= 0 ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-rose-600"}`} 
                  style={{ width: `${totalSalesAmount > 0 ? Math.max(0, Math.min(100, (totalNetProfit / totalSalesAmount) * 100)) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CHART 3: Expense Category Distribution */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-850 pb-3">
            <div>
              <h4 className="font-extrabold text-sm text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <DollarSign className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
                Egresos por Categoría
              </h4>
              <p className="text-[10px] text-gray-400 font-mono">Principales partidas de gasto operativo</p>
            </div>
            <span className="text-[10px] font-mono text-gray-500">
              Total: ${totalExpensesAmount.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {topExpenseCategories.length === 0 ? (
              <p className="text-gray-400 text-xs italic py-4 text-center">No hay gastos registrados en el periodo.</p>
            ) : (
              topExpenseCategories.slice(0, 4).map(([cat, amt]) => {
                const pct = totalExpensesAmount > 0 ? ((amt / totalExpensesAmount) * 100).toFixed(1) : "0";
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-gray-700 dark:text-slate-300">{cat}</span>
                      <span className="font-mono text-gray-900 dark:text-slate-100 font-bold">
                        ${amt.toLocaleString("es-MX", { minimumFractionDigits: 2 })} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-500 h-full rounded-full transition-all" 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* CHART 4: HISTORICAL SALES TREND & PEAKS/VALLEYS VISUALIZATION */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-850 pb-3">
          <div>
            <h4 className="font-extrabold text-base text-gray-800 dark:text-slate-100 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
              Tendencia Histórica de Ventas (Picos y Caídas)
            </h4>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Análisis dinámico de comportamiento de facturación diaria para identificar días con mayores ventas y oportunidades de mejora.
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {maxSaleDay && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 font-bold flex items-center gap-1">
                🚀 Pico: ${maxSaleDay.total.toLocaleString("es-MX", { maximumFractionDigits: 0 })} ({maxSaleDay.shortDate})
              </span>
            )}
            {minSaleDay && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 font-bold flex items-center gap-1">
                📉 Mínimo: ${minSaleDay.total.toLocaleString("es-MX", { maximumFractionDigits: 0 })} ({minSaleDay.shortDate})
              </span>
            )}
          </div>
        </div>

        {/* Visual Bar/Line Graph */}
        {salesTrendList.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-xs italic bg-gray-50/50 dark:bg-slate-950/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
            No se registraron ventas en el periodo seleccionado para graficar el histórico.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-44 w-full flex items-end gap-2 pt-6 pb-2 px-3 bg-gradient-to-b from-emerald-500/5 to-transparent dark:from-emerald-950/20 rounded-xl border border-gray-100 dark:border-slate-850/80 overflow-x-auto">
              {salesTrendList.map((item, idx) => {
                const isMax = maxSaleDay && item.date === maxSaleDay.date;
                const isMin = minSaleDay && item.date === minSaleDay.date;
                const barHeightPct = maxSaleValue > 0 ? Math.max(12, (item.total / maxSaleValue) * 100) : 10;

                return (
                  <div key={item.date || idx} className="flex-1 min-w-[36px] flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] py-1 px-2 rounded font-mono z-20 pointer-events-none whitespace-nowrap shadow-lg">
                      {item.date}: ${item.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </div>

                    {/* Peak / Valley Icon Badge */}
                    {isMax && (
                      <span className="text-[10px] text-emerald-600 font-extrabold animate-bounce mb-1">
                        🚀 Máx
                      </span>
                    )}
                    {isMin && !isMax && (
                      <span className="text-[10px] text-amber-600 font-extrabold mb-1">
                        📉 Mín
                      </span>
                    )}

                    {/* Bar */}
                    <div 
                      className={`w-full rounded-t-lg transition-all duration-300 group-hover:brightness-110 ${
                        isMax 
                          ? "bg-gradient-to-t from-emerald-600 to-teal-400 shadow-md shadow-emerald-500/20"
                          : isMin
                          ? "bg-amber-400 dark:bg-amber-500"
                          : "bg-emerald-500/70 dark:bg-emerald-600/70"
                      }`}
                      style={{ height: `${barHeightPct}%` }}
                    />

                    {/* X Axis Label */}
                    <span className="text-[9px] font-mono text-gray-400 mt-1">
                      {item.shortDate}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono pt-1">
              <span>📅 Período: {sortedSalesDates[0] || "N/A"} al {sortedSalesDates[sortedSalesDates.length - 1] || "N/A"}</span>
              <span>Promedio Diario: ${salesTrendList.length > 0 ? (totalSalesAmount / salesTrendList.length).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} MXN</span>
            </div>
          </div>
        )}
      </div>

      {/* Primary Sub-navigation Tabs */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-gray-100 dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800">
        {[
          { id: "ventas", label: "Historial Ventas", icon: TrendingUp },
          { id: "gastos", label: "Registro de Gastos", icon: FileText },
          { id: "caja", label: "Caja y Cortes", icon: Wallet },
          { id: "cobrar", label: "Cuentas por Cobrar", icon: Users },
          { id: "pagar", label: "Cuentas por Pagar", icon: Users },
          { id: "utilidad", label: "Utilidad Contable", icon: DollarSign },
          { id: "reportes", label: "Reportes Tradicionales", icon: Printer }
        ].map(tab => {
          const Icon = tab.icon;
          const isAct = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                isAct 
                  ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border-b-2 border-emerald-500" 
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-slate-900/30"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* --- PANEL RENDERERS --- */}

      {/* 1. HISTORIAL VENTAS TAB */}
      {activeSubTab === "ventas" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={salesSearch}
                onChange={e => setSalesSearch(e.target.value)}
                placeholder="Buscar por ID, cliente, cajero..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <select
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className={selectClass}
              >
                <option value="Todos">Todos los Cajeros</option>
                {uniqueSellers.map(seller => <option key={seller} value={seller}>{seller}</option>)}
              </select>
            </div>
          </div>

          {/* Gráfica de Tendencia de Ventas */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">Tendencias de Ingresos (Histórico y Actuales)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={[...filteredSales].reduce((acc, sale) => {
                    const d = sale.date.substring(0, 10);
                    const existing = acc.find(x => x.date === d);
                    if (existing) {
                      existing.ventas += sale.total;
                      existing.utilidad += sale.profit;
                    } else {
                      acc.push({ date: d, ventas: sale.total, utilidad: sale.profit });
                    }
                    return acc;
                  }, [] as { date: string, ventas: number, utilidad: number }[]).sort((a, b) => a.date.localeCompare(b.date))} 
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `$${val}`} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="ventas" name="Ventas" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="utilidad" name="Utilidad (Aprox)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={tableHeader}>Ticket ID</th>
                  <th className={tableHeader}>Fecha</th>
                  <th className={tableHeader}>Cliente</th>
                  <th className={tableHeader}>Cajero / Vendedor</th>
                  <th className={tableHeader}>Método Pago</th>
                  <th className={tableHeader}>Artículos</th>
                  <th className={tableHeader}>Total Venta</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      No se encontraron ventas para los criterios seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale: Sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                      <td className={`${tableCell} font-mono font-bold text-emerald-600 dark:text-emerald-400`}>{sale.id}</td>
                      <td className={tableCell}>{sale.date}</td>
                      <td className={tableCell}>{sale.customerName || "Venta de Mostrador"}</td>
                      <td className={tableCell}>{sale.userName}</td>
                      <td className={tableCell}>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className={tableCell}>{sale.items?.length || 0} pzas</td>
                      <td className={`${tableCell} font-bold text-gray-900 dark:text-white`}>
                        ${sale.total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. REGISTRO DE GASTOS TAB */}
      {activeSubTab === "gastos" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={expensesSearch}
                onChange={e => setExpensesSearch(e.target.value)}
                placeholder="Buscar gastos..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                setEditingExpense(null);
                setExpenseForm({ category: "Gasolina", amount: "", description: "", sucursal: "MAZAL 1", observaciones: "" });
                setShowExpenseModal(true);
              }}
              className={btnPrimary}
            >
              <Plus className="h-4 w-4" /> Registrar Gasto Manual
            </button>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={tableHeader}>Gasto ID</th>
                  <th className={tableHeader}>Fecha / Hora</th>
                  <th className={tableHeader}>Categoría</th>
                  <th className={tableHeader}>Descripción</th>
                  <th className={tableHeader}>Sucursal</th>
                  <th className={tableHeader}>Empleado</th>
                  <th className={tableHeader}>Monto</th>
                  <th className={`${tableHeader} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                      No se han registrado egresos o gastos en el periodo seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp: CashExpense) => (
                    <tr key={exp.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                      <td className={`${tableCell} font-mono font-bold text-rose-600 dark:text-rose-400`}>{exp.id}</td>
                      <td className={tableCell}>{exp.date} <span className="text-gray-400 text-xs font-mono">{exp.time || ""}</span></td>
                      <td className={tableCell}>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-extrabold bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100/40">
                          {exp.category}
                        </span>
                      </td>
                      <td className={tableCell}>{exp.description}</td>
                      <td className={tableCell}>{exp.sucursal || "MAZAL 1"}</td>
                      <td className={tableCell}>{exp.user}</td>
                      <td className={`${tableCell} font-bold text-rose-600 dark:text-rose-400`}>
                        ${exp.amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`${tableCell} text-center`}>
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingExpense(exp);
                              setExpenseForm({
                                category: exp.category,
                                amount: String(exp.amount),
                                description: exp.description,
                                sucursal: exp.sucursal || "MAZAL 1",
                                observaciones: exp.observaciones || ""
                              });
                              setShowExpenseModal(true);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. CAJA Y CORTES TAB */}
      {activeSubTab === "caja" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Active Caja Session Widget */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-[#e2e6dd] dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className={`h-5 w-5 ${activeSession ? "text-emerald-500 animate-pulse" : "text-amber-500"}`} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">Estado de la Caja</h3>
                </div>

                <div className="my-2">
                  <p className="text-3xl font-black text-gray-900 dark:text-white">
                    {activeSession ? "Caja Abierta" : "Caja Cerrada"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {activeSession 
                      ? `Abierta por: ${activeSession.openedBy} el ${activeSession.startTime}`
                      : "No hay una sesión activa de caja abierta. Las ventas del POS se registrarán con advertencia de caja cerrada."}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {activeSession ? (
                  <>
                    <button
                      onClick={() => setShowCloseCajaModal(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer animate-none"
                    >
                      <Lock className="h-4 w-4" /> Realizar Corte (Cerrar Caja)
                    </button>
                    <button
                      onClick={() => {
                        setPartialCajaForm({ type: "Ingreso", amount: "", description: "" });
                        setShowPartialCajaModal(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" /> Registrar Ingreso/Retiro Parcial
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setOpenCajaForm({ initialFund: "1000" });
                      setShowOpenCajaModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer"
                  >
                    <Unlock className="h-4 w-4" /> Abrir Caja del Turno
                  </button>
                )}
              </div>
            </div>

            {/* Quick overview metrics of live caja (Only if activeSession) */}
            <div className="md:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-4">Balance Estimado del Turno</h3>
              {activeSession ? (
                (() => {
                  const sSales = (db.sales || []).filter((s: Sale) => s.date >= activeSession.startTime && s.paymentMethod === "Efectivo");
                  const sSalesVal = sSales.reduce((acc: number, s: Sale) => acc + s.total, 0);

                  const sExpenses = (db.expenses || []).filter((ex: CashExpense) => ex.date + " " + (ex.time || "00:00:00") >= activeSession.startTime);
                  const sExpensesVal = sExpenses.reduce((acc: number, ex: CashExpense) => acc + ex.amount, 0);

                  const expectedTotal = activeSession.initialCash + sSalesVal - sExpensesVal;

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-950/40 border border-gray-100 dark:border-slate-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase font-mono">Fondo Inicial</span>
                        <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">${activeSession.initialCash.toFixed(2)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-950/40 border border-gray-100 dark:border-slate-800">
                        <span className="text-[10px] text-emerald-600 font-bold uppercase font-mono">Ventas Efectivo</span>
                        <p className="text-xl font-extrabold text-emerald-600 mt-1">+${sSalesVal.toFixed(2)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-950/40 border border-gray-100 dark:border-slate-800">
                        <span className="text-[10px] text-rose-600 font-bold uppercase font-mono">Gastos/Salidas</span>
                        <p className="text-xl font-extrabold text-rose-600 mt-1">-${sExpensesVal.toFixed(2)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase font-mono">Caja Esperada</span>
                        <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">${expectedTotal.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-center h-28 text-gray-400 text-sm italic">
                  Abre la caja para simular arqueos y cierres en tiempo real.
                </div>
              )}
            </div>
          </div>

          {/* Cuts History */}
          <div className="space-y-4">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Historial de Cortes de Caja</h3>
            <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={tableHeader}>Sesión ID</th>
                    <th className={tableHeader}>Responsable</th>
                    <th className={tableHeader}>Inicio</th>
                    <th className={tableHeader}>Término</th>
                    <th className={tableHeader}>Fondo Inicial</th>
                    <th className={tableHeader}>Ventas (Efe)</th>
                    <th className={tableHeader}>Gastos/Salidas</th>
                    <th className={tableHeader}>Físico Entregado</th>
                    <th className={tableHeader}>Diferencia</th>
                    <th className={tableHeader}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(db.cashSessions || []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                        Aún no hay cortes registrados en el historial de caja.
                      </td>
                    </tr>
                  ) : (
                    (db.cashSessions || []).map((cs: CashSession) => {
                      const diff = cs.finalCash !== undefined && cs.expectedFinalCash !== undefined 
                        ? cs.finalCash - cs.expectedFinalCash 
                        : 0;
                      return (
                        <tr key={cs.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                          <td className={`${tableCell} font-mono font-bold text-gray-500`}>{cs.id}</td>
                          <td className={tableCell}>{cs.openedBy}</td>
                          <td className={`${tableCell} text-xs font-mono`}>{cs.startTime}</td>
                          <td className={`${tableCell} text-xs font-mono`}>{cs.endTime || "-"}</td>
                          <td className={tableCell}>${cs.initialCash.toFixed(2)}</td>
                          <td className={tableCell}>${(cs.salesTotal || 0).toFixed(2)}</td>
                          <td className={tableCell}>${(cs.expensesTotal || 0).toFixed(2)}</td>
                          <td className={`${tableCell} font-semibold`}>
                            {cs.finalCash !== undefined ? `$${cs.finalCash.toFixed(2)}` : "En Operación"}
                          </td>
                          <td className={`${tableCell} font-mono font-semibold`}>
                            {cs.finalCash !== undefined ? (
                              <span className={diff >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                {diff >= 0 ? "+" : ""}${diff.toFixed(2)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className={tableCell}>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              cs.status === "Abierta" 
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : "bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400"
                            }`}>
                              {cs.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CUENTAS POR COBRAR TAB */}
      {activeSubTab === "cobrar" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Buscar clientes por nombre..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                setAbonoClienteForm({ customerId: "", amount: "", notes: "" });
                setShowAbonoClienteModal(true);
              }}
              className={btnPrimary}
            >
              <Plus className="h-4 w-4" /> Recibir Abono de Crédito
            </button>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={tableHeader}>Cliente ID</th>
                  <th className={tableHeader}>Nombre Completo</th>
                  <th className={tableHeader}>Límite Autorizado</th>
                  <th className={tableHeader}>Crédito Consumido (Deuda)</th>
                  <th className={tableHeader}>Saldo Disponible</th>
                  <th className={tableHeader}>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {(db.customers || [])
                  .filter((c: Customer) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                  .map((c: Customer) => {
                    const debt = c.creditUsed || 0;
                    const avail = Math.max(0, c.creditLimit - debt);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                        <td className={`${tableCell} font-mono text-gray-500`}>{c.id}</td>
                        <td className={`${tableCell} font-semibold`}>{c.name}</td>
                        <td className={tableCell}>${c.creditLimit.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                        <td className={`${tableCell} font-bold text-rose-600`}>
                          ${debt.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`${tableCell} font-bold text-emerald-600`}>
                          ${avail.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={tableCell}>
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                            c.status === "Activo" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {c.status}
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

      {/* 5. CUENTAS POR PAGAR TAB */}
      {activeSubTab === "pagar" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                placeholder="Buscar proveedores..."
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                setAbonoProveedorForm({ supplierId: "", amount: "", notes: "" });
                setShowAbonoProveedorModal(true);
              }}
              className={btnPrimary}
            >
              <Plus className="h-4 w-4" /> Registrar Pago a Proveedor
            </button>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={tableHeader}>Proveedor ID</th>
                  <th className={tableHeader}>Empresa / Razón Social</th>
                  <th className={tableHeader}>Contacto</th>
                  <th className={tableHeader}>Teléfono</th>
                  <th className={tableHeader}>Saldo por Pagar (Pasivo)</th>
                </tr>
              </thead>
              <tbody>
                {(db.suppliers || [])
                  .filter((s: Supplier) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .map((s: Supplier) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                      <td className={`${tableCell} font-mono text-gray-500`}>{s.id}</td>
                      <td className={`${tableCell} font-semibold`}>{s.name}</td>
                      <td className={tableCell}>{s.contact}</td>
                      <td className={tableCell}>{s.phone || "N/A"}</td>
                      <td className={`${tableCell} font-extrabold text-rose-600`}>
                        ${(s.outstandingBalance || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. UTILIDAD CONTABLE TAB */}
      {activeSubTab === "utilidad" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-6">
            <div className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Estado de Resultados Consolidado</h3>
              <p className="text-xs text-gray-500 mt-1 font-mono">Consolidación aritmética calculada a partir de los registros contables</p>
            </div>

            <div className="space-y-4 max-w-xl">
              <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Ingresos Totales por Ventas (+)</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">${totalSalesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-600 dark:text-slate-400 pl-4">Costo Total de Ventas (COGS) (-)</span>
                <span className="font-mono text-rose-600 text-rose-700">-${totalSalesCost.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-2 rounded-lg">
                <span className="font-bold text-emerald-800 dark:text-emerald-400">Utilidad Bruta de Operación</span>
                <span className="font-mono font-black text-emerald-700 dark:text-emerald-400">${totalSalesProfit.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center text-sm py-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-600 dark:text-slate-400 pl-4">Gastos Generales y Egresos Operativos (-)</span>
                <span className="font-mono text-rose-600 text-rose-700">-${totalExpensesAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between items-center text-base py-3 border-t-2 border-dashed border-gray-200 dark:border-slate-700 px-2">
                <span className="font-black text-gray-900 dark:text-white">Utilidad Neta (Pérdidas y Ganancias)</span>
                <span className={`font-mono font-black text-lg ${totalNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  ${totalNetProfit.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. REPORTES CONSOLIDADOS CON IMPRESIÓN Y EXPORTACIÓN */}
      {activeSubTab === "reportes" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Motor de Generación de Reportes</h3>
                <p className="text-xs text-gray-500 mt-1">Selecciona cualquier categoría de reporte de Mazal para visualizar, imprimir o exportar.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handlePrintReport}
                  className={btnSec}
                  title="Imprimir"
                >
                  <Printer className="h-4 w-4" /> Imprimir Reporte
                </button>
                <button
                  onClick={handleExportCSV}
                  className={btnPrimary}
                  title="Exportar"
                >
                  <Download className="h-4 w-4" /> Exportar a CSV
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: "ventas", label: "Ventas" },
                { id: "compras", label: "Compras" },
                { id: "existencias", label: "Existencias e Inv." },
                { id: "clientes", label: "Clientes" },
                { id: "proveedores", label: "Proveedores" },
                { id: "caja", label: "Caja" },
                { id: "gastos", label: "Gastos" },
                { id: "utilidades", label: "Utilidad" }
              ].map(rep => (
                <button
                  key={rep.id}
                  onClick={() => setSelectedReport(rep.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedReport === rep.id 
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                  }`}
                >
                  {rep.label}
                </button>
              ))}
            </div>

            <div className="border border-gray-100 dark:border-slate-800 rounded-xl overflow-hidden mt-4 bg-gray-50 dark:bg-slate-950/20 max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  {compileReportData().length > 0 && (
                    <tr>
                      {Object.keys(compileReportData()[0]).map(k => (
                        <th key={k} className="px-3 py-2 border-b border-gray-200 dark:border-slate-800 text-left font-bold text-gray-600 dark:text-slate-400 font-mono uppercase bg-gray-100 dark:bg-slate-900">{k}</th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {compileReportData().length === 0 ? (
                    <tr>
                      <td className="p-8 text-center text-gray-400">No hay datos que coincidan con los filtros actuales.</td>
                    </tr>
                  ) : (
                    compileReportData().map((row, idx) => (
                      <tr key={idx} className="hover:bg-white dark:hover:bg-slate-900/40 border-b border-gray-100 dark:border-slate-800">
                        {Object.keys(row).map(key => (
                          <td key={key} className="px-3 py-2 text-gray-700 dark:text-slate-300">{(row as any)[key]}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* --- FORM MODALS --- */}

      {/* 1. REGISTER EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                {editingExpense ? "Editar Gasto" : "Registrar Gasto Manual"}
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleAddOrEditExpense} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Categoría de Gasto</label>
                <select
                  value={expenseForm.category}
                  onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                >
                  {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monto ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Descripción / Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Especifica el concepto..."
                  value={expenseForm.description}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Sucursal que Eroga</label>
                <select
                  value={expenseForm.sucursal}
                  onChange={e => setExpenseForm({ ...expenseForm, sucursal: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                >
                  {sucursales.filter(s => s !== "Todas").map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Observaciones Opcionales</label>
                <textarea
                  placeholder="Comentarios adicionales..."
                  value={expenseForm.observaciones}
                  onChange={e => setExpenseForm({ ...expenseForm, observaciones: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200 h-20"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-150 dark:border-slate-800">
                <button type="button" onClick={() => setShowExpenseModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className={btnPrimary}>Guardar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. OPEN CAJA MODAL */}
      {showOpenCajaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Abrir Turno de Caja</h3>
              <button onClick={() => setShowOpenCajaModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleOpenCaja} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Fondo Inicial en Efectivo ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={openCajaForm.initialFund}
                  onChange={e => setOpenCajaForm({ initialFund: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowOpenCajaModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className={btnPrimary}>Abrir Caja</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. CLOSE CAJA MODAL */}
      {showCloseCajaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Cerrar Caja (Corte)</h3>
              <button onClick={() => setShowCloseCajaModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleCloseCaja} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Efectivo Físico Arqueado ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Introduce el monto físico contado"
                  value={closeCajaForm.physicalCash}
                  onChange={e => setCloseCajaForm({ physicalCash: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">La diferencia con el saldo estimado del sistema se registrará automáticamente en el corte.</span>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowCloseCajaModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-lg transition-all shadow-sm cursor-pointer">
                  Cerrar y Archivar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. REGISTER PARTIAL INGRESS/RETIRO MODAL */}
      {showPartialCajaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Movimiento Parcial de Caja</h3>
              <button onClick={() => setShowPartialCajaModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleRegisterPartialMovement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tipo de Movimiento</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setPartialCajaForm({ ...partialCajaForm, type: "Ingreso" })}
                    className={`py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition-colors ${
                      partialCajaForm.type === "Ingreso" 
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500" 
                        : "bg-gray-50 dark:bg-slate-800 text-gray-500 border-transparent"
                    }`}
                  >
                    Ingreso / Refuerzo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialCajaForm({ ...partialCajaForm, type: "Retiro" })}
                    className={`py-1.5 rounded-lg text-xs font-extrabold border cursor-pointer transition-colors ${
                      partialCajaForm.type === "Retiro" 
                        ? "bg-rose-500/10 text-rose-600 border-rose-500" 
                        : "bg-gray-50 dark:bg-slate-800 text-gray-500 border-transparent"
                    }`}
                  >
                    Retiro / Gasto de Caja
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Cantidad ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={partialCajaForm.amount}
                  onChange={e => setPartialCajaForm({ ...partialCajaForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Motivo / Descripción</label>
                <input
                  type="text"
                  required
                  placeholder="Detalle por qué se eroga/ingresa..."
                  value={partialCajaForm.description}
                  onChange={e => setPartialCajaForm({ ...partialCajaForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowPartialCajaModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className={btnPrimary}>Registrar Movimiento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ABONO CLIENTE MODAL */}
      {showAbonoClienteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Recibir Abono de Cliente</h3>
              <button onClick={() => setShowAbonoClienteModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleAbonoCliente} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Seleccionar Cliente</label>
                <select
                  required
                  value={abonoClienteForm.customerId}
                  onChange={e => setAbonoClienteForm({ ...abonoClienteForm, customerId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                >
                  <option value="">-- Elige un cliente deudor --</option>
                  {(db.customers || [])
                    .filter((c: Customer) => (c.creditUsed || 0) > 0)
                    .map((c: Customer) => (
                      <option key={c.id} value={c.id}>{c.name} (Debe: ${(c.creditUsed || 0).toFixed(2)})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monto a Abonar ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={abonoClienteForm.amount}
                  onChange={e => setAbonoClienteForm({ ...abonoClienteForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Comentarios / Notas</label>
                <input
                  type="text"
                  placeholder="Abono en efectivo, transferencia..."
                  value={abonoClienteForm.notes}
                  onChange={e => setAbonoClienteForm({ ...abonoClienteForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowAbonoClienteModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className={btnPrimary}>Registrar Abono</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. ABONO PROVEEDOR MODAL */}
      {showAbonoProveedorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleIn">
            <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Registrar Pago a Proveedor</h3>
              <button onClick={() => setShowAbonoProveedorModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <form onSubmit={handleAbonoProveedor} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Seleccionar Proveedor</label>
                <select
                  required
                  value={abonoProveedorForm.supplierId}
                  onChange={e => setAbonoProveedorForm({ ...abonoProveedorForm, supplierId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                >
                  <option value="">-- Elige un proveedor --</option>
                  {(db.suppliers || [])
                    .map((s: Supplier) => (
                      <option key={s.id} value={s.id}>{s.name} (Saldo: ${(s.outstandingBalance || 0).toFixed(2)})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Monto a Pagar ($ MXN)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={abonoProveedorForm.amount}
                  onChange={e => setAbonoProveedorForm({ ...abonoProveedorForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notas / Referencia</label>
                <input
                  type="text"
                  placeholder="Pago parcial, liquidación de factura..."
                  value={abonoProveedorForm.notes}
                  onChange={e => setAbonoProveedorForm({ ...abonoProveedorForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowAbonoProveedorModal(false)} className={btnSec}>Cancelar</button>
                <button type="submit" className={btnPrimary}>Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
