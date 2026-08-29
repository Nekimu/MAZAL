/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Product,
  ProductUnit,
  Customer,
  CustomerRole,
  Supplier,
  Sale,
  StockMovement,
  MovementType,
  PaymentMethod,
  AuditLog,
  CashSession,
  CashExpense,
  PurchaseOrder,
  User,
  UserRole,
  BankAccount,
  BankMovement,
  Budget,
  CostCenter,
  Vehicle,
  Branch,
  BranchInventoryItem,
  DistributionRecord,
  TransferRecord,
  ReplenishmentRequest
} from "./types";
import {
  REAL_MAZAL_PRODUCTS,
  REAL_MAZAL_SUPPLIERS,
  REAL_MAZAL_CUSTOMERS,
  REAL_MAZAL_USERS
} from "./data/realCatalog";
import { enqueueOperation, triggerAutoSync, setForcedOffline, isForcedOfflineMode, getOfflineState } from "./services/offlineSync";
import { 
  loadAllFromSupabase, 
  syncAllToSupabase, 
  initSupabaseRealtime, 
  saveSaleToSupabase, 
  deleteSaleFromSupabase,
  saveMovementToSupabase,
  saveProductToSupabase,
  deleteProductFromSupabase,
  saveCustomerToSupabase,
  deleteCustomerFromSupabase,
  saveSupplierToSupabase,
  deleteSupplierFromSupabase,
  savePurchaseOrderToSupabase,
  deletePurchaseOrderFromSupabase,
  saveCashSessionToSupabase,
  saveExpenseToSupabase,
  deleteExpenseFromSupabase,
  deleteEntityFromSupabase,
  mapDbProductToLocal,
  mapLocalProductToDb
} from "./services/supabaseSync";
import { supabase, isSupabaseConfigured, testSupabaseConnection, ensureSupabaseConfigured, getSupabaseClient } from "./supabase";

export {
  saveSaleToSupabase,
  deleteSaleFromSupabase,
  saveMovementToSupabase,
  saveProductToSupabase,
  deleteProductFromSupabase,
  saveCustomerToSupabase,
  deleteCustomerFromSupabase,
  saveSupplierToSupabase,
  deleteSupplierFromSupabase,
  savePurchaseOrderToSupabase,
  deletePurchaseOrderFromSupabase,
  saveCashSessionToSupabase,
  saveExpenseToSupabase,
  deleteExpenseFromSupabase,
  deleteEntityFromSupabase,
  ensureSupabaseConfigured,
  triggerAutoSync,
  setForcedOffline,
  isForcedOfflineMode,
  getOfflineState
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DbErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleDbError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: DbErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Database Error: ', JSON.stringify(errInfo));
}

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9).toUpperCase();

// Default seed data with live catalog from mazal_bd (E:\data)
const INITIAL_PRODUCTS: Product[] = [...REAL_MAZAL_PRODUCTS];

const INITIAL_CUSTOMERS: Customer[] = [...REAL_MAZAL_CUSTOMERS];

const INITIAL_SUPPLIERS: Supplier[] = [...REAL_MAZAL_SUPPLIERS];

const INITIAL_MOVEMENTS: StockMovement[] = [];

const INITIAL_SALES: Sale[] = [];

const INITIAL_EXPENSES: CashExpense[] = [];

const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];

const INITIAL_CASH_SESSIONS: CashSession[] = [];

const INITIAL_AUDIT_LOGS: AuditLog[] = [];

const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  { id: "B_01", bankName: "BBVA Bancomer", accountNumber: "• 4829", type: "Cheques", balance: 145000.0, initialBalance: 100000.0, currency: "MXN", status: "Activo" },
  { id: "B_02", bankName: "Santander Corporate", accountNumber: "• 1054", type: "Cheques", balance: 320000.0, initialBalance: 250000.0, currency: "MXN", status: "Activo" },
  { id: "B_03", bankName: "Banorte Caja Chica", accountNumber: "• 9032", type: "Cheques", balance: 15000.0, initialBalance: 15000.0, currency: "MXN", status: "Activo" }
];

const INITIAL_BANK_MOVEMENTS: BankMovement[] = [];

const INITIAL_COST_CENTERS: CostCenter[] = [
  { id: "CC_01", code: "ADM-100", name: "Administración General", description: "Gastos administrativos, software y oficina", department: "Administración", status: "Activo" },
  { id: "CC_02", code: "VEN-200", name: "Fuerza de Ventas", description: "Comisiones, marketing y viáticos de vendedores", department: "Ventas", status: "Activo" },
  { id: "CC_03", code: "LOG-300", name: "Logística y Distribución", description: "Combustible, mantenimiento y gastos de vehículos", department: "Logística", status: "Activo" },
  { id: "CC_04", code: "ALM-400", name: "Operaciones de Almacén", description: "Mantenimiento y servicios del almacén", department: "Almacén", status: "Activo" }
];

const INITIAL_VEHICLES: Vehicle[] = [
  { id: "V_01", plates: "MX-902-AA", model: "Nissan NP300 Cargo", brand: "Nissan", driver: "Juan Carlos Gómez", mileage: 45200, insuranceExpiry: "2027-02-15", verificationExpiry: "2026-11-30", teneciaPaid: true, maintenanceIntervalKm: 10000, lastMaintenanceMileage: 40000, monthlyCost: 4500, annualCost: 54000, costPerKm: 2.1, status: "Activo", history: [] },
  { id: "V_02", plates: "MX-115-BB", model: "Chevrolet Tornado PickUp", brand: "Chevrolet", driver: "Héctor Esparza", mileage: 78500, insuranceExpiry: "2026-12-01", verificationExpiry: "2026-08-15", teneciaPaid: true, maintenanceIntervalKm: 8000, lastMaintenanceMileage: 75000, monthlyCost: 3200, annualCost: 38400, costPerKm: 1.8, status: "Activo", history: [] }
];

const INITIAL_BUDGETS: Budget[] = [
  { id: "BUG_01", branch: "MAZAL 1", department: "Administración", category: "Servicios", amount: 15000, month: 7, year: 2026 },
  { id: "BUG_02", branch: "MAZAL 1", department: "Logística", category: "Combustible", amount: 25000, month: 7, year: 2026 },
  { id: "BUG_03", branch: "MAZAL 1", department: "Ventas", category: "Publicidad", amount: 30000, month: 7, year: 2026 }
];

const INITIAL_USERS: User[] = [...REAL_MAZAL_USERS];

const GLOBAL_COLLECTIONS = [
  "users",
  "almacen_general",
  "inventario_sucursal",
  "movimientos_inventario",
  "distribuciones",
  "transferencias",
  "solicitudes_reabastecimiento",
  "sucursales"
];

const INITIAL_BRANCHES: Branch[] = [
  { id: "SUC_CENTRO", name: "Centro", code: "SUC-01", address: "Av. Juárez #100, Centro", manager: "Carlos Mendoza", status: "Activo" },
  { id: "SUC_NORTE", name: "Norte", code: "SUC-02", address: "Blvd. Industrial #450, Norte", manager: "Mariana Rivas", status: "Activo" },
  { id: "SUC_SUR", name: "Sur", code: "SUC-03", address: "Calz. de las Luces #78, Sur", manager: "Roberto Gómez", status: "Activo" },
  { id: "SUC_BODEGA", name: "Bodega", code: "SUC-04", address: "Parque Logístico Nave 12", manager: "Esteban Cruz", status: "Activo" }
];

// Database state container helper backed by cloud memory and real-time listeners
export let activeBranch: "Norte" | "Sur" | string | null = (localStorage.getItem("mazal_active_branch") as string) || "Norte";

export const setActiveBranch = (branch: string | null) => {
  activeBranch = branch || "Norte";
  if (branch) {
    localStorage.setItem("mazal_active_branch", branch);
  } else {
    localStorage.removeItem("mazal_active_branch");
  }

  // Preserve core catalogs (products, users, customers, suppliers) with baseline fallbacks
  inMemoryDb.products = inMemoryDb.products || [];
  inMemoryDb.users = inMemoryDb.users && inMemoryDb.users.length > 0 ? inMemoryDb.users : [...INITIAL_USERS];
  inMemoryDb.suppliers = inMemoryDb.suppliers || [];
  inMemoryDb.customers = inMemoryDb.customers || [];

  // Clear transactional branch-specific arrays to refresh from active database
  ["sales", "movements", "expenses", "cashSessions", "purchaseOrders", "creditHistory"].forEach(key => {
    inMemoryDb[key] = [];
    dbCache[key] = [];
  });
  notifySubscribers();

  // Automatically trigger sync with branch-specific MySQL database
  syncWithLocalMySQL(activeBranch).catch(err => {
    console.warn("Error synchronizing with local MySQL on branch change:", err);
  });
};

const getCollectionName = (colName: string) => {
  // Global collections are enterprise-wide across all branches
  if (GLOBAL_COLLECTIONS.includes(colName)) return colName;
  if (!activeBranch) return colName;
  return `${colName}_${activeBranch.toLowerCase()}`;
};

const LOCAL_STORAGE_KEY = "mazal_offline_database_v8_clean";

// Limpiar almacenamiento previo obsoleto de pruebas anteriores
if (typeof window !== "undefined") {
  try {
    const legacyKeys = [
      "mazal_offline_database_v7_enterprise",
      "mazal_offline_database_v6",
      "mazal_offline_database_v5",
      "mazal_offline_database_v4",
      "mazal_cloud_backups",
      "mazal_db_cache"
    ];
    legacyKeys.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

// Network status tracking
let isOnlineState = typeof navigator !== "undefined" ? navigator.onLine : true;
let isSyncingState = false;
let pendingOfflineSync = false;

const networkSubscribers = new Set<(status: { isOnline: boolean; isSyncing: boolean; pendingSync: boolean }) => void>();

export const getNetworkStatus = () => ({
  isOnline: isOnlineState,
  isSyncing: isSyncingState,
  pendingSync: pendingOfflineSync
});

export const subscribeNetworkStatus = (callback: (status: { isOnline: boolean; isSyncing: boolean; pendingSync: boolean }) => void) => {
  networkSubscribers.add(callback);
  callback(getNetworkStatus());
  return () => networkSubscribers.delete(callback);
};

const notifyNetworkSubscribers = () => {
  const status = getNetworkStatus();
  networkSubscribers.forEach((cb) => {
    try { cb(status); } catch (e) { console.error("Network status subscriber error:", e); }
  });
};

// Initial local storage load helper
const loadFromLocalStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        if (!parsed.products || !Array.isArray(parsed.products)) {
          parsed.products = [];
        }
        if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
          parsed.users = [...INITIAL_USERS];
        }
        if (!parsed.suppliers || !Array.isArray(parsed.suppliers)) {
          parsed.suppliers = [];
        }
        if (!parsed.customers || !Array.isArray(parsed.customers)) {
          parsed.customers = [];
        }
        if (!Array.isArray(parsed.sales)) parsed.sales = [];
        if (!Array.isArray(parsed.movements)) parsed.movements = [];
        if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
        if (!Array.isArray(parsed.cashSessions)) parsed.cashSessions = [];
        if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
        if (!Array.isArray(parsed.purchaseOrders)) parsed.purchaseOrders = [];
        if (!Array.isArray(parsed.creditHistory)) parsed.creditHistory = [];
        if (!Array.isArray(parsed.bankAccounts)) parsed.bankAccounts = [...INITIAL_BANK_ACCOUNTS];
        if (!Array.isArray(parsed.bankMovements)) parsed.bankMovements = [...INITIAL_BANK_MOVEMENTS];
        if (!Array.isArray(parsed.budgets)) parsed.budgets = [...INITIAL_BUDGETS];
        if (!Array.isArray(parsed.costCenters)) parsed.costCenters = [...INITIAL_COST_CENTERS];
        if (!Array.isArray(parsed.vehicles)) parsed.vehicles = [...INITIAL_VEHICLES];
        if (!Array.isArray(parsed.almacen_general)) parsed.almacen_general = [];
        if (!Array.isArray(parsed.inventario_sucursal)) parsed.inventario_sucursal = [];
        if (!Array.isArray(parsed.movimientos_inventario)) parsed.movimientos_inventario = [];
        if (!Array.isArray(parsed.distribuciones)) parsed.distribuciones = [];
        if (!Array.isArray(parsed.transferencias)) parsed.transferencias = [];
        if (!Array.isArray(parsed.solicitudes_reabastecimiento)) parsed.solicitudes_reabastecimiento = [];
        if (!Array.isArray(parsed.sucursales)) parsed.sucursales = [...INITIAL_BRANCHES];
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not parse local storage offline database:", e);
  }
  return null;
};

const saveToLocalStorage = (data: any) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Could not save database to localStorage:", e);
  }
};

export function normalizeProduct(p: any): Product {
  if (!p) return p;
  const unit = p.unit || p.unidadVenta || ProductUnit.PIECE;
  const isBulk = unit === ProductUnit.KILO || unit === ProductUnit.LITER;
  const permiteVentaFraccionada = p.permiteVentaFraccionada ?? isBulk;
  const tipoVenta = p.tipoVenta || (unit === ProductUnit.KILO ? "peso" : unit === ProductUnit.LITER ? "volumen" : "pieza");
  const gramajeBase = Number(p.gramajeBase ?? (unit === ProductUnit.KILO ? 1000 : 0));

  const priceMin = parseFloat((Number(p.priceMin ?? p.precioMenudeo ?? 0)).toFixed(2));
  const priceMed = parseFloat((Number(p.priceMed ?? p.precioMedioMayoreo ?? 0)).toFixed(2));
  const priceMax = parseFloat((Number(p.priceMax ?? p.precioMayoreo ?? 0)).toFixed(2));
  const priceSpecial = parseFloat((Number(p.priceSpecial ?? p.precioEspecial ?? 0)).toFixed(2));
  const cost = parseFloat((Number(p.cost ?? p.costo ?? 0)).toFixed(2));
  const stock = Number(p.stock ?? p.stockDisponible ?? 0);

  return {
    ...p,
    id: String(p.id || Math.random().toString(36).substring(2, 9).toUpperCase()),
    code: p.code || p.codigo || "",
    barcode: p.barcode || p.codigoBarras || "",
    sku: p.sku || p.codigoInterno || "",
    name: p.name || p.descripcion || "Producto sin nombre",
    brand: p.brand || p.marca || "",
    category: p.category || p.categoria || "General",
    subcategory: p.subcategory || p.subcategoria || "",
    unit: unit,
    cost: cost,
    priceMin: priceMin,
    priceMed: priceMed,
    priceMax: priceMax,
    priceSpecial: priceSpecial,
    stock: stock,
    stockMin: Number(p.stockMin ?? p.stockMinimo ?? 0),
    stockMax: Number(p.stockMax ?? p.stockMaximo ?? 1000),
    location: p.location || p.ubicacion || "",
    imageUrl: p.imageUrl || p.imagen || "",
    supplierId: p.supplierId || p.proveedorId || "",
    isCompound: Boolean(p.isCompound),

    // Spanish enterprise fields kept synced for dual compatibility
    codigo: p.codigo || p.code || "",
    codigoBarras: p.codigoBarras || p.barcode || "",
    codigoInterno: p.codigoInterno || p.sku || "",
    activo: p.activo ?? true,
    departamento: p.departamento || "General",
    categoria: p.categoria || p.category || "General",
    subcategoria: p.subcategoria || p.subcategory || "",
    familia: p.familia || "",
    linea: p.linea || "",
    marca: p.marca || p.brand || "",
    tipoProducto: p.tipoProducto || "General",
    presentacion: p.presentacion || "",
    unidadVenta: p.unidadVenta || unit,
    unidadCompra: p.unidadCompra || unit,
    permiteVentaFraccionada: permiteVentaFraccionada,
    stockReservado: Number(p.stockReservado ?? 0),
    stockDisponible: stock,
    stockMinimo: Number(p.stockMinimo ?? (p.stockMin ?? 0)),
    stockMaximo: Number(p.stockMaximo ?? (p.stockMax ?? 1000)),
    puntoReorden: Number(p.puntoReorden ?? 0),
    costo: cost,
    ultimoCosto: parseFloat(Number(p.ultimoCosto ?? cost).toFixed(2)),
    costoPromedio: parseFloat(Number(p.costoPromedio ?? cost).toFixed(2)),
    precioMenudeo: priceMin,
    precioMedioMayoreo: priceMed,
    precioMayoreo: priceMax,
    precioEspecial: priceSpecial,
    utilidad: parseFloat(Number(p.utilidad ?? 0).toFixed(2)),
    aplicaIVA: Boolean(p.aplicaIVA),
    porcentajeIVA: Number(p.porcentajeIVA ?? 0),
    proveedorId: p.proveedorId || p.supplierId || "",
    proveedorNombre: p.proveedorNombre || "",
    sucursal: p.sucursal || "",
    almacen: p.almacen || "",
    pasillo: p.pasillo || "",
    estante: p.estante || "",
    ubicacion: p.ubicacion || p.location || "",
    manejaCaducidad: Boolean(p.manejaCaducidad),
    lote: p.lote || "",
    fechaCaducidad: p.fechaCaducidad || p.expiryDate || "",
    descripcion: p.descripcion || p.name || "",
    imagen: p.imagen || p.imageUrl || "",
    observaciones: p.observaciones || "",
    totalVentas: Number(p.totalVentas ?? 0),
    totalCompras: Number(p.totalCompras ?? 0),
    ultimaVenta: p.ultimaVenta || "",
    ultimaCompra: p.ultimaCompra || "",
    rotacion: Number(p.rotacion ?? 0),

    tipoVenta: tipoVenta,
    unidad: p.unidad || unit,
    gramajeBase: gramajeBase,
    precioPorGramo: p.precioPorGramo ?? (gramajeBase > 0 ? parseFloat((priceMin / gramajeBase).toFixed(4)) : parseFloat((priceMin / 1000).toFixed(4)))
  };
}

let inMemoryDb: any = (() => {
  const loaded = loadFromLocalStorage();
  if (loaded) {
    if (loaded.products && Array.isArray(loaded.products)) {
      loaded.products = loaded.products.map(normalizeProduct);
    }
    return loaded;
  }
  return {
    products: [...INITIAL_PRODUCTS],
    customers: [...INITIAL_CUSTOMERS],
    suppliers: [...INITIAL_SUPPLIERS],
    movements: [...INITIAL_MOVEMENTS],
    sales: [...INITIAL_SALES],
    expenses: [...INITIAL_EXPENSES],
    cashSessions: [...INITIAL_CASH_SESSIONS],
    auditLogs: [...INITIAL_AUDIT_LOGS],
    purchaseOrders: [...INITIAL_PURCHASE_ORDERS],
    users: [...INITIAL_USERS],
    creditHistory: [],
    bankAccounts: [...INITIAL_BANK_ACCOUNTS],
    bankMovements: [...INITIAL_BANK_MOVEMENTS],
    budgets: [...INITIAL_BUDGETS],
    costCenters: [...INITIAL_COST_CENTERS],
    vehicles: [...INITIAL_VEHICLES],
    almacen_general: [],
    inventario_sucursal: [],
    movimientos_inventario: [],
    distribuciones: [],
    transferencias: [],
    solicitudes_reabastecimiento: [],
    sucursales: [...INITIAL_BRANCHES]
  };
})();

let dbCache: any = JSON.parse(JSON.stringify(inMemoryDb));

const COLLECTIONS = [
  "products",
  "customers",
  "suppliers",
  "movements",
  "sales",
  "expenses",
  "cashSessions",
  "auditLogs",
  "purchaseOrders",
  "users",
  "creditHistory",
  "bankAccounts",
  "bankMovements",
  "budgets",
  "costCenters",
  "vehicles",
  "almacen_general",
  "inventario_sucursal",
  "movimientos_inventario",
  "distribuciones",
  "transferencias",
  "solicitudes_reabastecimiento",
  "sucursales"
];

export const getDatabase = () => {
  return inMemoryDb;
};

// Subscriptions for React components updates
const subscribers = new Set<(db: any) => void>();

export const subscribeToDb = (callback: (db: any) => void) => {
  subscribers.add(callback);
  // Call immediately with current in-memory values
  callback(inMemoryDb);
  return () => {
    subscribers.delete(callback);
  };
};

export const notifySubscribers = () => {
  const currentDb = getDatabase();
  subscribers.forEach((cb) => {
    try {
      cb(currentDb);
    } catch (e) {
      console.error("Subscriber notification error:", e);
    }
  });
};

// Helper for local API calls with fallback endpoints
export const callLocalApi = async (queryString: string, options?: RequestInit): Promise<Response> => {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    throw new Error("Local backend is only available on localhost");
  }

  const candidateUrls = [
    `http://localhost/MAZAL/api.php?${queryString}`,
    `http://localhost/mazal/api.php?${queryString}`,
    `http://localhost/api.php?${queryString}`,
    `/MAZAL/api.php?${queryString}`,
    `/mazal/api.php?${queryString}`,
    `/api.php?${queryString}`,
    `api.php?${queryString}`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: options?.signal || AbortSignal.timeout(2000)
      });
      if (res.ok) return res;
    } catch (e) {
      // Continue to next endpoint candidate
    }
  }
  throw new Error(`No se pudo contactar el backend PHP en localhost para: ${queryString}`);
};

export const saveProductToMySQL = async (product: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_product&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteProductFromMySQL = async (productId: string | number, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_product&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const updateStockInMySQL = async (productId: string | number, stock: number, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=update_stock&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId, stock })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveCustomerToMySQL = async (customer: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_customer&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customer)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteCustomerFromMySQL = async (customerId: string | number, name?: string, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_customer&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: customerId, name })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveSupplierToMySQL = async (supplier: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_supplier&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supplier)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteSupplierFromMySQL = async (supplierId: string | number, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_supplier&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: supplierId })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveSaleToMySQL = async (sale: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_sale&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sale)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteSaleFromMySQL = async (saleId: string | number, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_sale&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saleId })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveMovementToMySQL = async (movement: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_movement&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movement)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveCashSessionToMySQL = async (session: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_cash_session&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveExpenseToMySQL = async (expense: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_expense&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteExpenseFromMySQL = async (expenseId: string, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_expense&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expenseId })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const savePurchaseOrderToMySQL = async (order: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_purchase_order&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deletePurchaseOrderFromMySQL = async (orderId: string, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_purchase_order&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const persistToLocalMySQL = async (dbToSave: any, branchParam?: string) => {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return;
  }
  const branch = branchParam || activeBranch || "Norte";
  try {
    const payload = JSON.stringify(dbToSave);
    await callLocalApi(`action=save_state&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });
  } catch (e) {
    // Non-blocking local notice
  }
};

export const saveDatabase = (db: any): Promise<void> => {
  const updatedDb = { ...db };
  if (updatedDb.products && Array.isArray(updatedDb.products)) {
    updatedDb.products = updatedDb.products.map(normalizeProduct);
  }

  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  const opTypeMap: Record<string, any> = {
    sales: "SALE",
    movements: "INVENTORY_MOVEMENT",
    movimientos_inventario: "INVENTORY_MOVEMENT",
    customers: "CUSTOMER",
    products: "PRODUCT",
    purchaseOrders: "PURCHASE",
    cashSessions: "CASH_SESSION",
    expenses: "CASH_SESSION",
    transferencias: "TRANSFER",
    distribuciones: "TRANSFER",
    inventario_sucursal: "BRANCH_INVENTORY",
    suppliers: "CUSTOMER",
    users: "CUSTOMER"
  };

  const tableMap: Record<string, string> = {
    products: "products",
    customers: "customers",
    suppliers: "suppliers",
    sales: "sales",
    movements: "stock_movements",
    movimientos_inventario: "stock_movements",
    cashSessions: "cash_sessions",
    expenses: "cash_expenses",
    purchaseOrders: "purchase_orders",
    users: "users",
    bankAccounts: "bank_accounts",
    bankMovements: "bank_movements",
    budgets: "budgets",
    costCenters: "cost_centers",
    vehicles: "vehicles"
  };

  // Compare with dbCache to detect deletions and additions
  for (const key of COLLECTIONS) {
    const oldList = dbCache[key] || [];
    const newList = updatedDb[key] || [];

    if (!Array.isArray(oldList) || !Array.isArray(newList)) continue;

    const oldMap = new Map(oldList.map((item: any) => [String(item?.id), item]));
    const newMap = new Map(newList.map((item: any) => [String(item?.id), item]));
    const opType = opTypeMap[key] || "PRODUCT";
    const supabaseTable = tableMap[key] || key;

    // Detect and process DELETIONS
    for (const [id] of oldMap.entries()) {
      if (id && !newMap.has(id)) {
        if (isOnline) {
          // Immediately delete from Supabase Cloud
          deleteEntityFromSupabase(supabaseTable, id).catch((err) => {
            console.warn(`[Supabase Delete] Aviso al eliminar ${id} de ${supabaseTable}:`, err);
          });
        } else {
          // Enqueue offline deletion
          enqueueOperation({
            type: opType,
            isoDate: new Date().toISOString(),
            branch: activeBranch || "Norte",
            user: "Usuario Local",
            action: "DELETE",
            collectionName: getCollectionName(key),
            docId: id,
            payload: { id }
          });
        }
      }
    }

    // Detect and process offline additions / modifications
    if (!isOnline) {
      for (const [id, newItem] of newMap.entries()) {
        const oldItem = oldMap.get(id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          enqueueOperation({
            type: opType,
            isoDate: new Date().toISOString(),
            branch: activeBranch || "Norte",
            user: "Usuario Local",
            action: !oldItem ? "CREATE" : "UPDATE",
            collectionName: getCollectionName(key),
            docId: id,
            payload: newItem
          });
        }
      }
    }
  }

  inMemoryDb = updatedDb;
  dbCache = JSON.parse(JSON.stringify(updatedDb));
  saveToLocalStorage(inMemoryDb);
  notifySubscribers();

  // Persistir en base de datos local MySQL (mazal_bd para Norte, mazal_bd1 para Sur)
  persistToLocalMySQL(updatedDb, activeBranch || "Norte").catch(() => {});

  if (isOnline) {
    triggerAutoSync();
    
    // Sync with Supabase Cloud in background with guaranteed config check
    ensureSupabaseConfigured().then((configured) => {
      if (configured) {
        syncAllToSupabase(updatedDb, activeBranch || "Norte").then((res) => {
          if (res.success) {
            console.log("☁️ [Supabase Sync] Base de datos sincronizada con éxito en la nube.");
          } else {
            console.warn("⚠️ [Supabase Sync] Aviso al sincronizar:", res.error);
          }
        }).catch((err) => {
          console.warn("⚠️ [Supabase Sync Error]:", err);
        });
      }
    }).catch(() => {});

    return Promise.resolve();
  } else {
    pendingOfflineSync = true;
    notifyNetworkSubscribers();
    console.log("🔴 Modo Sin Conexión: Cambios e inventario guardados en Base Local y encolados en Pending Operations Queue.");
    return Promise.resolve();
  }
};

// Automatic Network Event Listeners
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    isOnlineState = true;
    notifyNetworkSubscribers();
    console.log("🌐 Conexión a Internet restablecida. Sincronizando con Supabase Cloud...");
    if (isSupabaseConfigured) {
      syncAllToSupabase(getDatabase(), activeBranch || "Norte");
    }
  });

  window.addEventListener("offline", () => {
    isOnlineState = false;
    pendingOfflineSync = true;
    notifyNetworkSubscribers();
    console.warn("⚠️ Conexión perdida. Activando modo local de contingencia.");
  });
}

// Real-time Listeners Setup (Supabase Realtime Cloud)
export const initRealtimeListeners = () => {
  if (typeof window === "undefined" || !isSupabaseConfigured) return () => {};
  return initSupabaseRealtime((table, payload) => {
    console.log(`[Supabase Realtime] Evento recibido en tabla ${table}:`, payload.eventType);
    loadDatabaseFromSupabase(activeBranch);
  });
};

export const loadDatabaseFromMySQL = async (branchParam?: string): Promise<typeof inMemoryDb> => {
  const branch = branchParam || activeBranch || "Norte";
  try {
    const res = await callLocalApi(`action=get_native_tables&branch=${encodeURIComponent(branch)}`);
    if (!res || !res.ok) {
      console.warn("MySQL Local no respondió adecuadamente en api.php.");
      return inMemoryDb;
    }
    const data = await res.json();
    if (data.success) {
      let stateChanged = false;

      // 1. Mapear y combinar productos desde MySQL
      if (Array.isArray(data.productos) && data.productos.length > 0) {
        const mySqlProducts: Product[] = data.productos.map((p: any) => {
          let raw: any = {};
          if (p.raw_data && typeof p.raw_data === "object") {
            raw = p.raw_data;
          } else if (p.raw_data && typeof p.raw_data === "string") {
            try { raw = JSON.parse(p.raw_data); } catch { raw = {}; }
          }
          const pId = raw.id || `PROD_${p.id || p.clave}`;
          const code = p.clave || raw.code || raw.codigo || String(p.id);
          const unit = p.unidad || raw.unit || ProductUnit.PIECE;
          const cost = Number(p.unitario ?? raw.cost ?? 0);
          const priceMin = Number(p.menudeo ?? raw.priceMin ?? 0);
          const priceMed = Number(p.medio ?? raw.priceMed ?? priceMin);
          const priceMax = Number(p.mayoreo ?? raw.priceMax ?? priceMin);
          const priceSpecial = Number(p.precio_especial ?? raw.priceSpecial ?? 0);
          const stock = Number(p.cant !== undefined ? p.cant : (raw.stock ?? 0));

          return normalizeProduct({
            ...raw,
            id: pId,
            code: code,
            barcode: p.clave || raw.barcode || code,
            sku: raw.sku || `SKU-${code}`,
            name: p.nom_p || raw.name || raw.descripcion || "Producto",
            brand: p.marca || raw.brand || "",
            category: p.categoria || raw.category || "General",
            subcategory: p.des || raw.subcategory || "",
            unit: unit,
            cost: cost,
            priceMin: priceMin,
            priceMed: priceMed,
            priceMax: priceMax,
            priceSpecial: priceSpecial,
            stock: stock,
            stockMin: Number(p.stock_min ?? raw.stockMin ?? 5),
            stockMax: Number(p.stock_max ?? raw.stockMax ?? 100),
            location: p.ubicacion || raw.location || "",
            imageUrl: p.imagen || raw.imageUrl || "",
            supplierId: p.proveedor_id || raw.supplierId || "SUPP1",
            sucursal: branch
          });
        });

        const prodMap = new Map<string, Product>();
        (inMemoryDb.products || []).forEach((p: Product) => {
          const key = (p.code || p.barcode || p.id).trim();
          if (key) prodMap.set(key, p);
        });
        mySqlProducts.forEach((p: Product) => {
          const key = (p.code || p.barcode || p.id).trim();
          if (key) prodMap.set(key, p);
        });

        inMemoryDb.products = Array.from(prodMap.values());
        stateChanged = true;
      }

      // 2. Mapear y combinar clientes
      if (Array.isArray(data.clientes) && data.clientes.length > 0) {
        const mySqlCustomers = data.clientes.map((c: any) => {
          let raw: any = {};
          if (c.raw_data && typeof c.raw_data === "object") {
            raw = c.raw_data;
          } else if (c.raw_data && typeof c.raw_data === "string") {
            try { raw = JSON.parse(c.raw_data); } catch { raw = {}; }
          }
          return {
            id: raw.id || `CUST_${c.id_cliente}`,
            name: c.nombre_c || raw.name || "",
            phone: c.tel || raw.phone || "",
            email: c.email || raw.email || "",
            address: c.direccion || raw.address || "",
            rfc: c.rfc || raw.rfc || "",
            role: raw.role || "Cliente Normal",
            creditLimit: Number(c.limite_credito ?? raw.creditLimit ?? 0),
            creditUsed: Number(c.cant_ade ?? raw.creditUsed ?? 0),
            creditDays: Number(c.dias_credito ?? raw.creditDays ?? 30),
            notes: c.notas || raw.notes || "",
            status: c.status || raw.status || "Activo"
          };
        });

        const custMap = new Map<string, Customer>();
        (inMemoryDb.customers || []).forEach((c: Customer) => custMap.set(c.id, c));
        mySqlCustomers.forEach((c: Customer) => custMap.set(c.id, c));
        inMemoryDb.customers = Array.from(custMap.values());
        stateChanged = true;
      }

      // 3. Mapear y combinar proveedores
      if (Array.isArray(data.proveedores) && data.proveedores.length > 0) {
        const mySqlSuppliers = data.proveedores.map((s: any) => {
          let raw: any = {};
          if (s.raw_data && typeof s.raw_data === "object") {
            raw = s.raw_data;
          } else if (s.raw_data && typeof s.raw_data === "string") {
            try { raw = JSON.parse(s.raw_data); } catch { raw = {}; }
          }
          return {
            id: raw.id || `SUPP_${s.id}`,
            name: s.nombre || raw.name || "",
            contact: s.contacto || raw.contact || "",
            phone: s.tel || raw.phone || "",
            email: s.email || raw.email || "",
            address: s.direccion || raw.address || "",
            rfc: s.rfc || raw.rfc || "",
            outstandingBalance: Number(s.adeudo ?? raw.outstandingBalance ?? 0)
          };
        });

        const suppMap = new Map<string, Supplier>();
        (inMemoryDb.suppliers || []).forEach((s: Supplier) => suppMap.set(s.id, s));
        mySqlSuppliers.forEach((s: Supplier) => suppMap.set(s.id, s));
        inMemoryDb.suppliers = Array.from(suppMap.values());
        stateChanged = true;
      }

      if (stateChanged) {
        saveToLocalStorage(inMemoryDb);
        dbCache = JSON.parse(JSON.stringify(inMemoryDb));
        notifySubscribers();
        console.log(`💾 Registros sincronizados desde MySQL Localhost (${data.database}) hacia la memoria de la aplicación.`);
      }
    }
  } catch (e) {
    console.warn("Error cargando base de datos desde MySQL Localhost:", e);
  }
  return inMemoryDb;
};

export const loadDatabaseFromCloud = async () => {
  if (isSupabaseConfigured) {
    await loadDatabaseFromSupabase(activeBranch);
  }
  await loadDatabaseFromMySQL(activeBranch);
  return inMemoryDb;
};

// Supabase Real-time Unsubscribe Handle
let supabaseRealtimeUnsub: (() => void) | null = null;

export const loadDatabaseFromSupabase = async (branchParam?: string): Promise<typeof inMemoryDb> => {
  const branch = branchParam || activeBranch || "Norte";
  try {
    const isConfigured = await ensureSupabaseConfigured();
    if (!isConfigured) {
      console.warn("Supabase no está configurado. Omitiendo carga desde la nube.");
      await loadDatabaseFromMySQL(branch);
      return inMemoryDb;
    }

    const res = await loadAllFromSupabase(branch);
    if (res.success && res.data) {
      const data = res.data;
      if (Array.isArray(data.products)) {
        inMemoryDb.products = data.products.map(normalizeProduct);
      }
      if (Array.isArray(data.customers)) {
        inMemoryDb.customers = data.customers;
      }
      if (Array.isArray(data.suppliers)) {
        inMemoryDb.suppliers = data.suppliers;
      }
      if (Array.isArray(data.sales)) {
        inMemoryDb.sales = data.sales;
      }
      if (Array.isArray(data.movements)) {
        inMemoryDb.movements = data.movements;
      }
      if (Array.isArray(data.cashSessions)) {
        inMemoryDb.cashSessions = data.cashSessions;
      }
      if (Array.isArray(data.expenses)) {
        inMemoryDb.expenses = data.expenses;
      }
      if (Array.isArray(data.users)) {
        inMemoryDb.users = data.users;
      }
      if (Array.isArray(data.sucursales)) {
        inMemoryDb.sucursales = data.sucursales;
      }
      if (Array.isArray(data.purchaseOrders)) {
        inMemoryDb.purchaseOrders = data.purchaseOrders;
      }
      if (Array.isArray(data.stockTransfers)) {
        inMemoryDb.stockTransfers = data.stockTransfers;
      }

      saveToLocalStorage(inMemoryDb);
      dbCache = JSON.parse(JSON.stringify(inMemoryDb));
      notifySubscribers();
      console.log("🟢 Datos cargados exitosamente desde Supabase Cloud.");
    }

    // Initialize or refresh Supabase real-time channel
    if (supabaseRealtimeUnsub) {
      supabaseRealtimeUnsub();
    }

    let debounceRefreshTimer: any = null;

    supabaseRealtimeUnsub = initSupabaseRealtime((table, payload) => {
      console.log(`[Supabase Realtime] Cambio en ${table}:`, payload.eventType);

      const eventType = payload.eventType;
      let stateChanged = false;

      // 1. PRODUCTOS: Eliminación, Adición, Edición, Precios y Stock instantáneos
      if (table === "products") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || payload.old?.code || "");
          if (delId) {
            inMemoryDb.products = (inMemoryDb.products || []).filter(
              (p: Product) => p.id !== delId && p.code !== delId
            );
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming = mapDbProductToLocal(payload.new);
          const idx = (inMemoryDb.products || []).findIndex(
            (p: Product) => p.id === incoming.id || p.code === incoming.code
          );
          if (idx >= 0) {
            inMemoryDb.products[idx] = normalizeProduct({ ...inMemoryDb.products[idx], ...incoming });
          } else {
            inMemoryDb.products.unshift(normalizeProduct(incoming));
          }
          stateChanged = true;
        }
      }

      // 2. CLIENTES
      else if (table === "customers") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || "");
          if (delId) {
            inMemoryDb.customers = (inMemoryDb.customers || []).filter((c: Customer) => c.id !== delId);
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming: Customer = {
            id: payload.new.id,
            name: payload.new.name,
            phone: payload.new.phone || "",
            email: payload.new.email || "",
            address: payload.new.address || "",
            rfc: payload.new.rfc || "",
            role: payload.new.role || "Cliente Normal",
            creditLimit: Number(payload.new.credit_limit || 0),
            creditUsed: Number(payload.new.credit_used || 0),
            creditDays: Number(payload.new.credit_days || 30),
            notes: payload.new.notes || "",
            status: payload.new.status || "Activo",
            ...(payload.new.raw_data || {})
          };
          const idx = (inMemoryDb.customers || []).findIndex((c: Customer) => c.id === incoming.id);
          if (idx >= 0) inMemoryDb.customers[idx] = incoming;
          else inMemoryDb.customers.unshift(incoming);
          stateChanged = true;
        }
      }

      // 3. PROVEEDORES
      else if (table === "suppliers") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || "");
          if (delId) {
            inMemoryDb.suppliers = (inMemoryDb.suppliers || []).filter((s: Supplier) => s.id !== delId);
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming: Supplier = {
            id: payload.new.id,
            name: payload.new.name,
            contact: payload.new.contact || "",
            phone: payload.new.phone || "",
            email: payload.new.email || "",
            address: payload.new.address || "",
            rfc: payload.new.rfc || "",
            outstandingBalance: Number(payload.new.outstanding_balance || 0),
            ...(payload.new.raw_data || {})
          };
          const idx = (inMemoryDb.suppliers || []).findIndex((s: Supplier) => s.id === incoming.id);
          if (idx >= 0) inMemoryDb.suppliers[idx] = incoming;
          else inMemoryDb.suppliers.unshift(incoming);
          stateChanged = true;
        }
      }

      // 4. ÓRDENES DE SUMINISTRO / COMPRA
      else if (table === "purchase_orders") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || "");
          if (delId) {
            inMemoryDb.purchaseOrders = (inMemoryDb.purchaseOrders || []).filter((po: PurchaseOrder) => po.id !== delId);
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming: PurchaseOrder = {
            id: payload.new.id,
            supplierId: payload.new.supplier_id,
            supplierName: payload.new.supplier_name,
            total: Number(payload.new.total || 0),
            status: payload.new.status || "Pendiente",
            date: payload.new.date || new Date().toISOString().split("T")[0],
            receivedDate: payload.new.received_date,
            paymentStatus: payload.new.payment_status || "Pendiente",
            items: payload.new.items || [],
            ...(payload.new.raw_data || {})
          };
          const idx = (inMemoryDb.purchaseOrders || []).findIndex((po: PurchaseOrder) => po.id === incoming.id);
          if (idx >= 0) inMemoryDb.purchaseOrders[idx] = incoming;
          else inMemoryDb.purchaseOrders.unshift(incoming);
          stateChanged = true;
        }
      }

      // 5. VENTAS
      else if (table === "sales") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || "");
          if (delId) {
            inMemoryDb.sales = (inMemoryDb.sales || []).filter((s: Sale) => s.id !== delId);
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming: Sale = {
            id: payload.new.id,
            ticketNumber: payload.new.ticket_number,
            total: Number(payload.new.total || 0),
            costTotal: Number(payload.new.cost_total || 0),
            profit: Number(payload.new.profit || 0),
            paymentMethod: payload.new.payment_method,
            customerId: payload.new.customer_id,
            customerName: payload.new.customer_name,
            userId: payload.new.user_id,
            userName: payload.new.user_name,
            date: payload.new.date,
            amountPaid: Number(payload.new.amount_paid || 0),
            change: Number(payload.new.change || 0),
            items: payload.new.items || [],
            ...(payload.new.raw_data || {})
          };
          const idx = (inMemoryDb.sales || []).findIndex((s: Sale) => s.id === incoming.id);
          if (idx >= 0) inMemoryDb.sales[idx] = incoming;
          else inMemoryDb.sales.unshift(incoming);
          stateChanged = true;
        }
      }

      // 6. USUARIOS
      else if (table === "users") {
        if (eventType === "DELETE") {
          const delId = String(payload.old?.id || payload.old?.username || "");
          if (delId) {
            inMemoryDb.users = (inMemoryDb.users || []).filter((u: User) => u.id !== delId && u.username !== delId);
            stateChanged = true;
          }
        } else if (payload.new) {
          const incoming: User = {
            id: payload.new.id,
            username: payload.new.username,
            name: payload.new.name,
            password: payload.new.password,
            role: payload.new.role,
            status: payload.new.status,
            lastLogin: payload.new.last_login
          };
          const idx = (inMemoryDb.users || []).findIndex((u: User) => u.id === incoming.id || u.username === incoming.username);
          if (idx >= 0) inMemoryDb.users[idx] = incoming;
          else inMemoryDb.users.unshift(incoming);
          stateChanged = true;
        }
      }

      // Si hubo un cambio de datos inmediato, notificar a todas las pantallas de inmediato
      if (stateChanged) {
        saveToLocalStorage(inMemoryDb);
        dbCache = JSON.parse(JSON.stringify(inMemoryDb));
        notifySubscribers();
      }

      // Sincronización completa de respaldo con debounce
      clearTimeout(debounceRefreshTimer);
      debounceRefreshTimer = setTimeout(() => {
        loadAllFromSupabase(branch).then((refreshRes) => {
          if (refreshRes.success && refreshRes.data) {
            if (Array.isArray(refreshRes.data.products)) inMemoryDb.products = refreshRes.data.products.map(normalizeProduct);
            if (Array.isArray(refreshRes.data.sales)) inMemoryDb.sales = refreshRes.data.sales;
            if (Array.isArray(refreshRes.data.customers)) inMemoryDb.customers = refreshRes.data.customers;
            if (Array.isArray(refreshRes.data.suppliers)) inMemoryDb.suppliers = refreshRes.data.suppliers;
            if (Array.isArray(refreshRes.data.cashSessions)) inMemoryDb.cashSessions = refreshRes.data.cashSessions;
            if (Array.isArray(refreshRes.data.users)) inMemoryDb.users = refreshRes.data.users;
            if (Array.isArray(refreshRes.data.movements)) inMemoryDb.movements = refreshRes.data.movements;
            if (Array.isArray(refreshRes.data.expenses)) inMemoryDb.expenses = refreshRes.data.expenses;
            if (Array.isArray(refreshRes.data.purchaseOrders)) inMemoryDb.purchaseOrders = refreshRes.data.purchaseOrders;
            if (Array.isArray(refreshRes.data.stockTransfers)) inMemoryDb.stockTransfers = refreshRes.data.stockTransfers;
            saveToLocalStorage(inMemoryDb);
            dbCache = JSON.parse(JSON.stringify(inMemoryDb));
            notifySubscribers();
          }
        }).catch(() => {});
      }, 400);
    });
  } catch (err) {
    console.warn("Aviso al cargar desde Supabase:", err);
  }

  return inMemoryDb;
};

export const syncDatabaseWithSupabase = async (branchParam?: string) => {
  const branch = branchParam || activeBranch || "Norte";
  return syncAllToSupabase(getDatabase(), branch);
};



export const syncWithLocalMySQL = async (branchParam?: string): Promise<{ success: boolean; totalProducts: number; message: string }> => {
  const targetBranch = branchParam || activeBranch || "Norte";

  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return { success: false, totalProducts: 0, message: "Modo nube activo (Supabase)" };
  }

  try {
    // 1. Intentar cargar estado completo previamente guardado en mazal_app_state
    try {
      const resState = await callLocalApi(`action=get_state&branch=${encodeURIComponent(targetBranch)}`);
      const stateData = await resState.json();
      if (stateData.success && stateData.data) {
        const saved = stateData.data;
        if (saved.customers && Array.isArray(saved.customers)) {
          inMemoryDb.customers = saved.customers;
        }
        if (saved.suppliers && Array.isArray(saved.suppliers)) {
          inMemoryDb.suppliers = saved.suppliers;
        }
        if (saved.sales && Array.isArray(saved.sales)) {
          inMemoryDb.sales = saved.sales;
        }
        if (saved.cashSessions && Array.isArray(saved.cashSessions)) {
          inMemoryDb.cashSessions = saved.cashSessions;
        }
      }
    } catch (e) {
      // Continuar con tablas nativas
    }

    const res = await callLocalApi(`action=get_native_tables&branch=${encodeURIComponent(targetBranch)}`);
    const data = await res.json();

    if (data.success && data.productos && Array.isArray(data.productos) && data.productos.length > 0) {
      const mysqlProducts: Product[] = data.productos.map((p: any) => {
        const id = String(p.id);
        const clave = p.clave || "";
        const nom_p = p.nom_p || "Sin Nombre";
        const des = p.des || "entero";
        const cant = parseFloat(p.cant) || 0;
        const mayoreo = parseFloat(p.mayoreo) || 0;
        const medio = parseFloat(p.medio) || 0;
        const menudeo = parseFloat(p.menudeo) || 0;
        let unitario = parseFloat(p.unitario) || 0;
        if (isNaN(unitario) || unitario <= 0) {
          unitario = mayoreo > 0 ? parseFloat((mayoreo * 0.85).toFixed(2)) : 0;
        }

        let unit = 'pz';
        const lowerDes = des.toLowerCase();
        const lowerNom = nom_p.toLowerCase();
        if (lowerDes.includes('kilo') || lowerDes.includes('kg') || lowerNom.includes('kg') || lowerNom.includes('kilo')) unit = 'kg';
        else if (lowerDes.includes('paq') || lowerNom.includes('paq') || lowerNom.includes('caja') || lowerNom.includes('pzs')) unit = 'paq';
        else if (lowerDes.includes('litro') || lowerDes.includes('lt') || lowerNom.includes('lts')) unit = 'lt';

        let category = 'Abarrotes Generales';
        if (lowerNom.includes('aceite') || lowerNom.includes('arroz') || lowerNom.includes('frijol') || lowerNom.includes('harina') || lowerNom.includes('pasta')) category = 'Abarrotes y Granos';
        else if (lowerNom.includes('vaso') || lowerNom.includes('plato') || lowerNom.includes('domo') || lowerNom.includes('bolsa') || lowerNom.includes('rollo') || lowerNom.includes('celofan')) category = 'Desechables y Empaques';
        else if (lowerNom.includes('chocolate') || lowerNom.includes('crema') || lowerNom.includes('vainilla') || lowerNom.includes('topping') || lowerNom.includes('bettercreme') || lowerNom.includes('esponja') || lowerNom.includes('nutella')) category = 'Repostería y Panadería';
        else if (lowerNom.includes('jabon') || lowerNom.includes('cloralex') || lowerNom.includes('cloro') || lowerNom.includes('pinol') || lowerNom.includes('suavitel')) category = 'Limpieza y Jarcería';
        else if (lowerNom.includes('dulce') || lowerNom.includes('paleta') || lowerNom.includes('chicle') || lowerNom.includes('caramelo') || lowerNom.includes('chicharr')) category = 'Dulcería y Botanas';

        return normalizeProduct({
          id: `PROD_${id}`,
          code: clave ? `${clave.toUpperCase().replace(/\s+/g, '')}-${id}` : `PRD-${id}`,
          barcode: `750000${id.padStart(6, '0')}`,
          sku: `SKU-${id}`,
          name: nom_p,
          brand: clave ? clave.trim().toUpperCase() : 'MAZAL',
          category,
          subcategory: des,
          unit,
          cost: unitario,
          priceMin: mayoreo,
          priceMed: medio,
          priceMax: menudeo,
          priceSpecial: mayoreo > 0 ? parseFloat((mayoreo * 0.95).toFixed(2)) : 0,
          stock: cant,
          stockMin: 5,
          stockMax: Math.max(100, Math.ceil(cant * 2)),
          location: `Sucursal ${targetBranch}`,
          isCompound: false,
          imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300&auto=format&fit=crop&q=60',
          supplierId: 'PROV_01'
        });
      });

      inMemoryDb.products = mysqlProducts;

      if (data.usuarios && Array.isArray(data.usuarios) && data.usuarios.length > 0) {
        inMemoryDb.users = data.usuarios.map((u: any) => ({
          id: `USER_${u.id}`,
          username: u.usuario || `user_${u.id}`,
          name: u.nombrecompleto || u.usuario,
          role: (u.rol || '').toLowerCase().includes('admin') ? UserRole.ADMIN : UserRole.CASHIER,
          status: 'Activo'
        }));
      }

      if (data.proveedores && Array.isArray(data.proveedores) && data.proveedores.length > 0 && (!inMemoryDb.suppliers || inMemoryDb.suppliers.length === 0)) {
        inMemoryDb.suppliers = data.proveedores.map((p: any) => ({
          id: `PROV_${p.id}`,
          code: `PRV-${String(p.id).padStart(3, '0')}`,
          name: p.nombre || 'Proveedor ' + p.id,
          companyName: p.empresa || p.nombre || 'Empresa ' + p.id,
          rfc: 'XAXX010101000',
          phone: p.tel || '7220000000',
          email: `contacto.prov${p.id}@mazal.com`,
          address: 'Toluca, Estado de México',
          contactPerson: p.nombre || 'Ejecutivo de Ventas',
          category: 'Distribuidor Mayorista',
          paymentTerms: 'Crédito 15 días',
          debt: parseFloat(p.adeudo) || 0
        }));
      }

      if (data.clientes && Array.isArray(data.clientes) && (!inMemoryDb.customers || inMemoryDb.customers.length === 0)) {
        inMemoryDb.customers = data.clientes.map((c: any) => ({
          id: `CLI_${c.id_cliente}`,
          name: c.nombre_c || `Cliente ${c.id_cliente}`,
          phone: c.tel || "",
          email: `cliente${c.id_cliente}@mazal.com`,
          address: "Toluca, Estado de México",
          rfc: "XAXX010101000",
          role: CustomerRole.WHOLESALE,
          creditLimit: 50000,
          creditUsed: parseFloat(c.cant_ade) || 0,
          creditDays: 15,
          notes: "Cliente registrado en base de datos MySQL",
          status: "Activo"
        }));
      }

      try {
        const resSales = await callLocalApi(`action=get_historical_sales&branch=${encodeURIComponent(targetBranch)}`);
        const salesData = await resSales.json();
        if (salesData.success && salesData.ventas && Array.isArray(salesData.ventas)) {
          const ticketsMap: Record<string, Sale> = {};
          
          salesData.ventas.forEach((v: any) => {
            const dateStr = v.fecha ? String(v.fecha).substring(0, 10) : '2026-01-01';
            const ticketKey = `${dateStr}_${v.id_cliente || '0'}`;
            
            if (!ticketsMap[ticketKey]) {
              ticketsMap[ticketKey] = {
                id: `SALE_HIST_${v.id_venta}`,
                ticketNumber: `TICKET-HIST-${v.id_venta}`,
                items: [],
                total: 0,
                costTotal: 0,
                profit: 0,
                paymentMethod: PaymentMethod.CASH,
                userId: 'USR_HIST',
                userName: 'Histórico',
                customerId: v.id_cliente ? String(v.id_cliente) : undefined,
                customerName: v.nombre_c || 'Cliente Histórico',
                sucursal: targetBranch,
                date: v.fecha || dateStr + " 12:00:00"
              };
            }
            
            const qty = parseFloat(v.cantidad) || 1;
            const tot = parseFloat(v.total) || 0;
            const uti = parseFloat(v.total_utilidad) || 0;
            const unitPrice = tot / qty;
            
            ticketsMap[ticketKey].items.push({
              productId: `PROD_${v.id_producto}`,
              productName: v.nom_p || v.descripcion || 'Producto histórico',
              quantity: qty,
              unitPrice: unitPrice || 0,
              totalPrice: tot,
              cost: tot - uti
            });
            
            ticketsMap[ticketKey].total += tot;
            ticketsMap[ticketKey].profit += uti;
            ticketsMap[ticketKey].costTotal += (tot - uti);
          });
          
          inMemoryDb.sales = Object.values(ticketsMap).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      } catch (e) {
        console.warn("No se pudieron cargar ventas históricas:", e);
      }

      saveToLocalStorage(inMemoryDb);
      dbCache = JSON.parse(JSON.stringify(inMemoryDb));
      notifySubscribers();
      return { success: true, totalProducts: mysqlProducts.length, message: `Sincronización exitosa (${data.database}): ${mysqlProducts.length} productos cargados.` };
    }
  } catch (err) {
    console.warn(`Aviso: MySQL local (${targetBranch}) offline:`, err);
    if (!inMemoryDb.products) {
      inMemoryDb.products = [];
      saveToLocalStorage(inMemoryDb);
      notifySubscribers();
    }
  }
  return { success: false, totalProducts: inMemoryDb.products?.length || 0, message: "Usando base local." };
};

export const saveUserToMySQL = async (user: { name: string; username: string; password?: string; role: string }): Promise<boolean> => {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return false;
  }
  try {
    const res = await callLocalApi(`action=save_user&branch=${encodeURIComponent(activeBranch || "Norte")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const deleteUserFromMySQL = async (username: string): Promise<boolean> => {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return false;
  }
  try {
    const res = await callLocalApi(`action=delete_user&branch=${encodeURIComponent(activeBranch || "Norte")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const resetDatabaseToFactory = async () => {
  // Clear/reset in-memory and local collections
  COLLECTIONS.forEach(key => {
    const seedData = key === "users" ? INITIAL_USERS :
                     key === "bankAccounts" ? INITIAL_BANK_ACCOUNTS :
                     key === "costCenters" ? INITIAL_COST_CENTERS :
                     key === "vehicles" ? INITIAL_VEHICLES :
                     key === "budgets" ? INITIAL_BUDGETS :
                     key === "sucursales" ? INITIAL_BRANCHES : [];
    inMemoryDb[key] = [...seedData];
  });
  dbCache = JSON.parse(JSON.stringify(inMemoryDb));
  saveToLocalStorage(inMemoryDb);
  notifySubscribers();

  // Sincronizar estado limpio con Supabase Cloud si está configurado
  if (isSupabaseConfigured) {
    try {
      await syncAllToSupabase(inMemoryDb, activeBranch || "Norte");
    } catch (e) {
      console.warn("Error sincronizando estado limpio con Supabase:", e);
    }
  }
};

export const logAction = (user: string, role: string, action: string, details: string): Promise<void> => {
  const db = getDatabase();
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const newLog: AuditLog = {
    id: "AUD" + generateId(),
    user,
    role,
    action,
    details,
    timestamp,
    ip: "192.168.1." + Math.floor(100 + Math.random() * 50),
    branch: activeBranch === "Sur" ? "MAZAL 2" : "MAZAL 1"
  };
  db.auditLogs.unshift(newLog);

  return saveDatabase(db);
};

export const registerMovement = (
  productId: string,
  productName: string,
  type: MovementType,
  quantity: number,
  previousStock: number,
  newStock: number,
  user: string,
  notes?: string
): Promise<void> => {
  const db = getDatabase();
  const movement: StockMovement = {
    id: "MOV" + generateId(),
    productId,
    productName,
    type,
    quantity,
    previousStock,
    newStock,
    date: new Date().toISOString().replace("T", " ").substring(0, 19),
    user,
    notes
  };
  db.movements.unshift(movement);
  return saveDatabase(db);
};

// --- CENTRAL WAREHOUSE & DISTRIBUTION ENGINE HELPERS ---

export const recordInventoryMovement = (
  productId: string,
  productName: string,
  sourceBranch: string,
  destinationBranch: string,
  quantity: number,
  reason: string,
  user: string,
  notes?: string
): void => {
  const db = getDatabase();
  if (!db.movimientos_inventario) db.movimientos_inventario = [];

  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);

  const movementRecord = {
    id: "MOV_" + generateId(),
    productId,
    productName,
    sourceBranch, // "Almacén General" or Branch name
    destinationBranch,
    quantity,
    reason, // "Distribución", "Transferencia", "Venta", "Merma", "Devolución", "Reabastecimiento"
    date: dateStr,
    timestamp: now.getTime(),
    user,
    notes: notes || ""
  };

  db.movimientos_inventario.unshift(movementRecord);
};

export const distributeCentralStock = async (
  distributionItems: { productId: string; destinationBranch: string; quantity: number }[],
  userName: string,
  notes?: string
): Promise<{ success: boolean; message: string }> => {
  const db = getDatabase();
  if (!db.almacen_general) db.almacen_general = [];
  if (!db.products) db.products = [];
  if (!db.inventario_sucursal) db.inventario_sucursal = [];
  if (!db.distribuciones) db.distribuciones = [];

  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);
  const distCode = "DIST-" + Math.floor(100000 + Math.random() * 900000);

  const recordItems: any[] = [];
  let totalUnits = 0;

  for (const item of distributionItems) {
    if (item.quantity <= 0) continue;

    // Find master product in almacen_general or products
    let masterProduct = db.almacen_general.find((p: any) => p.id === item.productId);
    if (!masterProduct) {
      masterProduct = db.products.find((p: any) => p.id === item.productId);
    }

    if (!masterProduct) continue;

    // Available central stock
    const currentCentralStock = Number(masterProduct.stock ?? masterProduct.stockDisponible ?? 0);
    if (item.quantity > currentCentralStock) {
      return {
        success: false,
        message: `Stock insuficiente en Almacén General para ${masterProduct.name}. Disponible: ${currentCentralStock}, Solicitado: ${item.quantity}`
      };
    }

    // Deduct from Central Warehouse stock
    const newCentralStock = currentCentralStock - item.quantity;
    masterProduct.stock = newCentralStock;
    masterProduct.stockDisponible = newCentralStock;

    // Sync in products if present
    const mainProd = db.products.find((p: any) => p.id === item.productId);
    if (mainProd) {
      mainProd.stock = newCentralStock;
      mainProd.stockDisponible = newCentralStock;
    }

    // Add to Branch inventory (inventario_sucursal)
    let branchStockItem = db.inventario_sucursal.find(
      (inv: any) => inv.productId === item.productId && inv.sucursal === item.destinationBranch
    );

    if (branchStockItem) {
      branchStockItem.stock = Number(branchStockItem.stock || 0) + item.quantity;
      branchStockItem.updatedAt = dateStr;
    } else {
      branchStockItem = {
        id: "INV_" + generateId(),
        productId: item.productId,
        productName: masterProduct.name,
        code: masterProduct.code || masterProduct.codigo || "",
        barcode: masterProduct.barcode || masterProduct.codigoBarras || "",
        category: masterProduct.category || "General",
        unit: masterProduct.unit || "Pza",
        sucursal: item.destinationBranch,
        stock: item.quantity,
        stockMin: masterProduct.stockMin || 5,
        stockMax: masterProduct.stockMax || 100,
        cost: masterProduct.cost || 0,
        priceMin: masterProduct.priceMin || 0,
        location: masterProduct.location || "Piso de venta",
        updatedAt: dateStr
      };
      db.inventario_sucursal.push(branchStockItem);
    }

    // Record movement audit
    recordInventoryMovement(
      item.productId,
      masterProduct.name,
      "Almacén General",
      item.destinationBranch,
      item.quantity,
      "Distribución",
      userName,
      notes
    );

    recordItems.push({
      productId: item.productId,
      productName: masterProduct.name,
      code: masterProduct.code || masterProduct.codigo || "",
      quantity: item.quantity,
      destinationBranch: item.destinationBranch
    });

    totalUnits += item.quantity;
  }

  if (recordItems.length === 0) {
    return { success: false, message: "No se seleccionaron cantidades válidas para distribuir." };
  }

  const distRecord: DistributionRecord = {
    id: "DIST_" + generateId(),
    code: distCode,
    date: dateStr,
    user: userName,
    items: recordItems,
    totalItems: recordItems.length,
    totalUnits: totalUnits,
    notes: notes || "Distribución de mercancía desde Almacén General",
    status: "Completada"
  };

  db.distribuciones.unshift(distRecord);
  await saveDatabase(db);

  return {
    success: true,
    message: `Distribución ${distCode} completada exitosamente. Se enviaron ${totalUnits} unidades a sucursales.`
  };
};

export const transferBetweenBranches = async (
  sourceBranch: string,
  destinationBranch: string,
  transferItems: { productId: string; quantity: number }[],
  userName: string,
  notes?: string
): Promise<{ success: boolean; message: string }> => {
  if (sourceBranch === destinationBranch) {
    return { success: false, message: "La sucursal origen y destino deben ser distintas." };
  }

  const db = getDatabase();
  if (!db.inventario_sucursal) db.inventario_sucursal = [];
  if (!db.transferencias) db.transferencias = [];

  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);
  const transferCode = "TRF-" + Math.floor(100000 + Math.random() * 900000);

  const recordItems: any[] = [];

  for (const item of transferItems) {
    if (item.quantity <= 0) continue;

    // Find source inventory
    const sourceInv = db.inventario_sucursal.find(
      (inv: any) => inv.productId === item.productId && inv.sucursal === sourceBranch
    );

    if (!sourceInv || Number(sourceInv.stock || 0) < item.quantity) {
      const pName = sourceInv ? sourceInv.productName : "Producto";
      const available = sourceInv ? Number(sourceInv.stock || 0) : 0;
      return {
        success: false,
        message: `Stock insuficiente en ${sourceBranch} para ${pName}. Disponible: ${available}, Requerido: ${item.quantity}`
      };
    }
  }

  // Execute transfer
  for (const item of transferItems) {
    if (item.quantity <= 0) continue;

    const sourceInv = db.inventario_sucursal.find(
      (inv: any) => inv.productId === item.productId && inv.sucursal === sourceBranch
    );

    // Deduct from Source Branch
    sourceInv.stock = Number(sourceInv.stock) - item.quantity;
    sourceInv.updatedAt = dateStr;

    // Add to Destination Branch
    let destInv = db.inventario_sucursal.find(
      (inv: any) => inv.productId === item.productId && inv.sucursal === destinationBranch
    );

    if (destInv) {
      destInv.stock = Number(destInv.stock || 0) + item.quantity;
      destInv.updatedAt = dateStr;
    } else {
      destInv = {
        id: "INV_" + generateId(),
        productId: item.productId,
        productName: sourceInv.productName,
        code: sourceInv.code,
        barcode: sourceInv.barcode || "",
        category: sourceInv.category || "General",
        unit: sourceInv.unit || "Pza",
        sucursal: destinationBranch,
        stock: item.quantity,
        stockMin: sourceInv.stockMin || 5,
        stockMax: sourceInv.stockMax || 100,
        cost: sourceInv.cost || 0,
        priceMin: sourceInv.priceMin || 0,
        location: sourceInv.location || "Piso de venta",
        updatedAt: dateStr
      };
      db.inventario_sucursal.push(destInv);
    }

    // Log audit movement
    recordInventoryMovement(
      item.productId,
      sourceInv.productName,
      sourceBranch,
      destinationBranch,
      item.quantity,
      "Transferencia",
      userName,
      notes
    );

    recordItems.push({
      productId: item.productId,
      productName: sourceInv.productName,
      code: sourceInv.code,
      quantity: item.quantity
    });
  }

  const transferRecord: TransferRecord = {
    id: "TRF_" + generateId(),
    code: transferCode,
    date: dateStr,
    user: userName,
    sourceBranch,
    destinationBranch,
    items: recordItems,
    notes: notes || `Transferencia entre ${sourceBranch} y ${destinationBranch}`,
    status: "Completada"
  };

  db.transferencias.unshift(transferRecord);
  await saveDatabase(db);

  return {
    success: true,
    message: `Transferencia ${transferCode} realizada exitosamente de ${sourceBranch} a ${destinationBranch}.`
  };
};

export const createReplenishmentRequest = async (
  branch: string,
  items: { productId: string; requestedQuantity: number }[],
  requestedBy: string,
  notes?: string
): Promise<{ success: boolean; message: string }> => {
  const db = getDatabase();
  if (!db.solicitudes_reabastecimiento) db.solicitudes_reabastecimiento = [];

  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);
  const requestCode = "REQ-" + Math.floor(100000 + Math.random() * 900000);

  const requestItems: any[] = [];

  for (const it of items) {
    if (it.requestedQuantity <= 0) continue;

    let pName = "Producto";
    let pCode = "";
    let currentBranchStock = 0;

    const branchInv = (db.inventario_sucursal || []).find(
      (inv: any) => inv.productId === it.productId && inv.sucursal === branch
    );

    if (branchInv) {
      pName = branchInv.productName;
      pCode = branchInv.code;
      currentBranchStock = Number(branchInv.stock || 0);
    } else {
      const prod = (db.products || []).find((p: any) => p.id === it.productId);
      if (prod) {
        pName = prod.name;
        pCode = prod.code;
      }
    }

    requestItems.push({
      productId: it.productId,
      productName: pName,
      code: pCode,
      currentStock: currentBranchStock,
      requestedQuantity: it.requestedQuantity
    });
  }

  if (requestItems.length === 0) {
    return { success: false, message: "Selecciona al menos un producto para solicitar." };
  }

  const reqRecord: ReplenishmentRequest = {
    id: "REQ_" + generateId(),
    code: requestCode,
    branch,
    requestDate: dateStr,
    requestedBy,
    items: requestItems,
    status: "Pendiente",
    notes: notes || ""
  };

  db.solicitudes_reabastecimiento.unshift(reqRecord);
  await saveDatabase(db);

  return {
    success: true,
    message: `Solicitud de reabastecimiento ${requestCode} enviada correctamente a Almacén General.`
  };
};

export const processReplenishmentRequest = async (
  requestId: string,
  approve: boolean,
  reviewedBy: string,
  rejectionReason?: string,
  customApprovedQuantities?: Record<string, number>
): Promise<{ success: boolean; message: string }> => {
  const db = getDatabase();
  if (!db.solicitudes_reabastecimiento) return { success: false, message: "No hay solicitudes registradas." };

  const req = db.solicitudes_reabastecimiento.find((r: any) => r.id === requestId);
  if (!req) return { success: false, message: "Solicitud no encontrada." };

  if (req.status !== "Pendiente") {
    return { success: false, message: `La solicitud ya fue procesada anteriormente (${req.status}).` };
  }

  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);

  if (!approve) {
    req.status = "Rechazado";
    req.reviewDate = dateStr;
    req.reviewedBy = reviewedBy;
    req.rejectionReason = rejectionReason || "Rechazada por la administración de Almacén General";
    await saveDatabase(db);
    return { success: true, message: `Solicitud ${req.code} ha sido RECHAZADA.` };
  }

  // Handle Approval: deduct from Almacén General and add to Branch
  const distItems: { productId: string; destinationBranch: string; quantity: number }[] = [];

  for (const item of req.items) {
    const qtyToApprove = customApprovedQuantities && customApprovedQuantities[item.productId] !== undefined
      ? customApprovedQuantities[item.productId]
      : item.requestedQuantity;

    item.approvedQuantity = qtyToApprove;

    if (qtyToApprove > 0) {
      distItems.push({
        productId: item.productId,
        destinationBranch: req.branch,
        quantity: qtyToApprove
      });
    }
  }

  const distRes = await distributeCentralStock(distItems, reviewedBy, `Aprobación de Solicitud ${req.code}`);

  if (!distRes.success) {
    return distRes;
  }

  req.status = "Aprobado";
  req.reviewDate = dateStr;
  req.reviewedBy = reviewedBy;

  await saveDatabase(db);

  return {
    success: true,
    message: `Solicitud ${req.code} APROBADA y mercancía distribuida exitosamente a ${req.branch}.`
  };
};
