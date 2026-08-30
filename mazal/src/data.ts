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
import { supabase, isSupabaseConfigured, testSupabaseConnection, ensureSupabaseConfigured, getSupabaseClient, PAUSE_ONLINE_SYNC } from "./supabase";

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
  const rawUnit = (p.unit || p.unidad || p.unidadVenta || "").toLowerCase();
  const rawDes = (p.des || p.subcategory || p.subcategoria || "").toLowerCase();
  
  let unit: ProductUnit = ProductUnit.PIECE;
  if (rawUnit === "kg" || rawUnit === "kilo" || rawUnit === "kilogramo" || rawDes === "mixto") {
    unit = ProductUnit.KILO;
  } else if (rawUnit === "lt" || rawUnit === "litro" || rawUnit === "l") {
    unit = ProductUnit.LITER;
  } else if (rawUnit === "paq" || rawUnit === "paquete") {
    unit = ProductUnit.PACKAGE;
  } else if (rawUnit === "caja") {
    unit = ProductUnit.BOX;
  } else if (p.unit) {
    unit = p.unit as ProductUnit;
  }

  const isBulk = unit === ProductUnit.KILO || unit === ProductUnit.LITER;
  const permiteVentaFraccionada = p.permiteVentaFraccionada ?? isBulk;
  const tipoVenta = p.tipoVenta || (unit === ProductUnit.KILO ? "peso" : unit === ProductUnit.LITER ? "volumen" : "pieza");
  const gramajeBase = Number(p.gramajeBase ?? (unit === ProductUnit.KILO ? 1000 : 0));

  let priceMin = parseFloat((Number(p.priceMin ?? p.precioMenudeo ?? p.menudeo ?? 0)).toFixed(4));
  let priceMed = parseFloat((Number(p.priceMed ?? p.precioMedioMayoreo ?? p.medio ?? priceMin)).toFixed(4));
  let priceMax = parseFloat((Number(p.priceMax ?? p.precioMayoreo ?? p.mayoreo ?? priceMin)).toFixed(4));
  let priceSpecial = parseFloat((Number(p.priceSpecial ?? p.precioEspecial ?? p.precio_especial ?? 0)).toFixed(4));
  let cost = parseFloat((Number(p.cost ?? p.costo ?? p.unitario ?? 0)).toFixed(4));
  let stock = Number(p.stock ?? p.stockDisponible ?? p.cant ?? 0);

  // Normalización automática para productos a granel / mixto con precio legacy por gramo (< 1.0)
  if (isBulk || unit === ProductUnit.KILO) {
    if (priceMin > 0 && priceMin < 1.0) {
      priceMin = parseFloat((priceMin * 1000).toFixed(2));
      priceMed = priceMed > 0 && priceMed < 1.0 ? parseFloat((priceMed * 1000).toFixed(2)) : (priceMed > 0 ? priceMed : priceMin);
      priceMax = priceMax > 0 && priceMax < 1.0 ? parseFloat((priceMax * 1000).toFixed(2)) : (priceMax > 0 ? priceMax : priceMin);
      priceSpecial = priceSpecial > 0 && priceSpecial < 1.0 ? parseFloat((priceSpecial * 1000).toFixed(2)) : priceSpecial;
      cost = cost > 0 && cost < 1.0 ? parseFloat((cost * 1000).toFixed(2)) : cost;
    }
    if (stock > 1000 && !p.isNormalizedStock) {
      stock = parseFloat((stock / 1000).toFixed(3));
    }
  }

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
    ultimoCosto: parseFloat(Number(p.ultimoCosto ?? cost).toFixed(4)),
    costoPromedio: parseFloat(Number(p.costoPromedio ?? cost).toFixed(4)),
    precioMenudeo: priceMin,
    precioMedioMayoreo: priceMed,
    precioMayoreo: priceMax,
    precioEspecial: priceSpecial,
    utilidad: parseFloat(Number(p.utilidad ?? 0).toFixed(4)),
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

export const subscribers = new Set<(db: any) => void>();
export const subscribeToDb = (cb: (db: any) => void) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
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
  const candidateUrls = [
    `api.php?${queryString}`,
    `/MAZAL/api.php?${queryString}`,
    `/mazal/api.php?${queryString}`,
    `/api.php?${queryString}`,
    `http://localhost/MAZAL/api.php?${queryString}`,
    `http://localhost/mazal/api.php?${queryString}`,
    `http://localhost/api.php?${queryString}`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: options?.signal || AbortSignal.timeout(3000)
      });
      if (res.ok) return res;
    } catch (e) {
      // Continue to next endpoint candidate
    }
  }
  throw new Error(`No se pudo contactar el backend PHP en localhost para: ${queryString}`);
};

export const persistToLocalMySQL = async (db: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_state&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
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

export const saveCreditPaymentToMySQL = async (payment: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_credit_payment&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payment)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveBankAccountToMySQL = async (account: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_bank_account&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveBankMovementToMySQL = async (movement: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_bank_movement&branch=${encodeURIComponent(branch)}`, {
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

export const saveAuditLogToMySQL = async (log: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_audit_log&branch=${encodeURIComponent(branch)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log)
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (e) {
    return false;
  }
};

export const saveUserToMySQL = async (user: any, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=save_user&branch=${encodeURIComponent(branch)}`, {
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

export const deleteUserFromMySQL = async (username: string, branchParam?: string): Promise<boolean> => {
  try {
    const branch = branchParam || activeBranch || "Norte";
    const res = await callLocalApi(`action=delete_user&branch=${encodeURIComponent(branch)}`, {
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

export const loadDatabaseFromMySQL = async (branchParam?: string): Promise<typeof inMemoryDb> => {
  const branch = branchParam || activeBranch || "Norte";
  try {
    // 1. Primero intentar cargar el snapshot completo si existe en mazal_app_state
    try {
      const stateRes = await callLocalApi(`action=get_state&branch=${encodeURIComponent(branch)}`);
      if (stateRes && stateRes.ok) {
        const stateJson = await stateRes.json();
        if (stateJson.success && stateJson.data && typeof stateJson.data === "object") {
          const loaded = stateJson.data;
          Object.keys(loaded).forEach((key) => {
            if (Array.isArray(loaded[key])) {
              inMemoryDb[key] = loaded[key];
            }
          });
        }
      }
    } catch (e) {}

    // 2. Cargar y combinar tablas nativas de MySQL
    const res = await callLocalApi(`action=get_native_tables&branch=${encodeURIComponent(branch)}`);
    if (!res || !res.ok) {
      console.warn("MySQL Local no respondió adecuadamente en api.php.");
      return inMemoryDb;
    }
    const data = await res.json();
    if (data.success) {
      let stateChanged = false;

      // A. Mapear y asignar productos desde MySQL directamente
      if (Array.isArray(data.productos) && data.productos.length > 0) {
        const mySqlProducts: Product[] = data.productos.map((p: any) => {
          let raw: any = {};
          if (p.raw_data && typeof p.raw_data === "object") {
            raw = p.raw_data;
          } else if (p.raw_data && typeof p.raw_data === "string") {
            try { raw = JSON.parse(p.raw_data); } catch { raw = {}; }
          }
          const pId = String(p.id);
          const code = p.clave || String(p.id);
          const unit = p.unidad || raw.unit || (p.des === 'mixto' ? ProductUnit.KILO : ProductUnit.PIECE);
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
            barcode: p.clave || `750000${String(p.id).padStart(6, '0')}`,
            sku: `SKU-${p.id}`,
            name: p.nom_p || raw.name || raw.descripcion || "Producto",
            brand: p.marca || raw.brand || "MAZAL",
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
            location: p.ubicacion || raw.location || "Bodega Principal",
            imageUrl: p.imagen || raw.imageUrl || "",
            supplierId: p.proveedor_id || raw.supplierId || "SUPP1",
            sucursal: branch || "Norte"
          });
        });

        inMemoryDb.products = mySqlProducts;
        stateChanged = true;
      }

      // B. Mapear y combinar clientes
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

      // C. Mapear y combinar proveedores
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

      // D. Cuentas bancarias y finanzas
      if (Array.isArray(data.cuentas_bancarias) && data.cuentas_bancarias.length > 0) {
        inMemoryDb.bankAccounts = data.cuentas_bancarias.map((b: any) => ({
          id: b.id,
          bankName: b.bank_name || b.bankName || "Banco",
          accountNumber: b.account_number || b.accountNumber || "",
          type: b.type || "Cheques",
          balance: Number(b.balance || 0),
          initialBalance: Number(b.initial_balance || b.initialBalance || 0),
          currency: b.currency || "MXN",
          status: b.status || "Activo",
          branch: b.branch || branch
        }));
        stateChanged = true;
      }

      // E. Movimientos bancarios
      if (Array.isArray(data.movimientos_bancarios) && data.movimientos_bancarios.length > 0) {
        inMemoryDb.bankMovements = data.movimientos_bancarios.map((bm: any) => ({
          id: bm.id,
          bankAccountId: bm.bank_account_id || bm.bankAccountId,
          type: bm.type || "Depósito",
          amount: Number(bm.amount || 0),
          date: bm.date || "",
          description: bm.description || "",
          category: bm.category || "General",
          reference: bm.reference || "",
          user: bm.user_name || bm.user || "Admin"
        }));
        stateChanged = true;
      }

      // F. Gastos de caja
      if (Array.isArray(data.gastos) && data.gastos.length > 0) {
        inMemoryDb.expenses = data.gastos.map((g: any) => {
          let raw: any = {};
          if (g.raw_data) {
            try { raw = typeof g.raw_data === "string" ? JSON.parse(g.raw_data) : g.raw_data; } catch {}
          }
          return {
            ...raw,
            id: g.id,
            description: g.description || "Gasto",
            amount: Number(g.amount || 0),
            category: g.category || "General",
            date: g.date || "",
            user: g.user_name || g.user || "Admin",
            sucursal: g.sucursal || branch
          };
        });
        stateChanged = true;
      }

      // G. Sesiones de caja
      if (Array.isArray(data.sesiones_caja) && data.sesiones_caja.length > 0) {
        inMemoryDb.cashSessions = data.sesiones_caja.map((cs: any) => {
          let raw: any = {};
          if (cs.raw_data) {
            try { raw = typeof cs.raw_data === "string" ? JSON.parse(cs.raw_data) : cs.raw_data; } catch {}
          }
          return {
            ...raw,
            id: cs.id,
            startTime: cs.start_time || cs.startTime || "",
            endTime: cs.end_time || cs.endTime || undefined,
            openedBy: cs.opened_by || cs.openedBy || "Admin",
            initialCash: Number(cs.initial_cash ?? cs.initialCash ?? 0),
            finalCash: cs.final_cash !== null ? Number(cs.final_cash) : undefined,
            status: cs.status || "Abierta",
            salesTotal: Number(cs.sales_total ?? cs.salesTotal ?? 0),
            expensesTotal: Number(cs.expenses_total ?? cs.expensesTotal ?? 0),
            expectedFinalCash: Number(cs.expected_final_cash ?? cs.expectedFinalCash ?? 0)
          };
        });
        stateChanged = true;
      }

      // H. Órdenes de compra
      if (Array.isArray(data.ordenes_compra) && data.ordenes_compra.length > 0) {
        inMemoryDb.purchaseOrders = data.ordenes_compra.map((po: any) => {
          let raw: any = {};
          if (po.raw_data) {
            try { raw = typeof po.raw_data === "string" ? JSON.parse(po.raw_data) : po.raw_data; } catch {}
          }
          return {
            ...raw,
            id: po.id,
            supplierId: po.supplier_id || po.supplierId || "",
            supplierName: po.supplier_name || po.supplierName || "",
            total: Number(po.total || 0),
            status: po.status || "Pendiente",
            date: po.date || "",
            receivedDate: po.received_date || po.receivedDate || undefined,
            paymentStatus: po.payment_status || po.paymentStatus || "Pendiente",
            items: Array.isArray(raw.items) ? raw.items : []
          };
        });
        stateChanged = true;
      }

      // I. Movimientos de inventario (Kárdex)
      if (Array.isArray(data.movimientos) && data.movimientos.length > 0) {
        inMemoryDb.movements = data.movimientos.map((m: any) => ({
          id: m.id,
          productId: m.product_id || m.productId,
          productName: m.product_name || m.productName || "",
          type: m.type || MovementType.ENTRY_ADJUSTMENT,
          quantity: Number(m.quantity || 0),
          previousStock: Number(m.previous_stock ?? m.previousStock ?? 0),
          newStock: Number(m.new_stock ?? m.newStock ?? 0),
          date: m.date || "",
          user: m.user_name || m.user || "Admin",
          notes: m.notes || ""
        }));
        stateChanged = true;
      }

      // J. Sucursales
      if (Array.isArray(data.sucursales) && data.sucursales.length > 0) {
        inMemoryDb.sucursales = data.sucursales.map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          address: s.address || "",
          phone: s.phone || "",
          manager: s.manager || "Administrador",
          status: s.status || "Activo",
          isCentral: Boolean(s.is_central)
        }));
        stateChanged = true;
      }

      // K. Usuarios
      if (Array.isArray(data.usuarios) && data.usuarios.length > 0) {
        inMemoryDb.users = data.usuarios.map((u: any) => ({
          id: String(u.id),
          username: u.usuario || u.username,
          name: u.nombrecompleto || u.name || u.usuario,
          password: u.password || "",
          role: u.rol || u.role || UserRole.CASHIER,
          status: u.status || "Activo",
          lastLogin: u.last_login || u.lastLogin
        }));
        stateChanged = true;
      }

      // 3. Cargar ventas históricas nativas
      try {
        const salesRes = await callLocalApi(`action=get_historical_sales&branch=${encodeURIComponent(branch)}`);
        if (salesRes && salesRes.ok) {
          const salesData = await salesRes.json();
          if (salesData.success && Array.isArray(salesData.ventas) && salesData.ventas.length > 0) {
            const mySqlSales: Sale[] = salesData.ventas.map((v: any) => {
              let raw: any = {};
              if (v.raw_data) {
                try { raw = typeof v.raw_data === "string" ? JSON.parse(v.raw_data) : v.raw_data; } catch {}
              }
              return {
                id: raw.id || `SALE_${v.id_venta}`,
                ticketNumber: v.ticket_number || raw.ticketNumber || `TICK-${v.id_venta}`,
                items: Array.isArray(raw.items) ? raw.items : [{
                  productId: String(v.id_producto || ""),
                  productName: v.nom_p || v.descripcion || "Venta",
                  quantity: Number(v.cantidad || 1),
                  unitPrice: Number(v.total || 0),
                  totalPrice: Number(v.total || 0),
                  cost: 0
                }],
                total: Number(v.total || 0),
                costTotal: Number(raw.costTotal || 0),
                profit: Number(v.total_utilidad ?? raw.profit ?? 0),
                paymentMethod: (v.metodo_pago || raw.paymentMethod || PaymentMethod.CASH) as any,
                customerId: v.id_cliente ? `CUST_${v.id_cliente}` : (raw.customerId || undefined),
                customerName: v.nombre_c || raw.customerName || "Público General",
                userId: raw.userId || "USR_1",
                userName: raw.userName || "Admin",
                date: v.fecha || raw.date || "",
                amountPaid: Number(raw.amountPaid || v.total || 0),
                change: Number(raw.change || 0),
                sucursal: v.sucursal || branch
              };
            });

            const saleMap = new Map<string, Sale>();
            (inMemoryDb.sales || []).forEach((s: Sale) => saleMap.set(s.id, s));
            mySqlSales.forEach((s: Sale) => saleMap.set(s.id, s));
            inMemoryDb.sales = Array.from(saleMap.values());
            stateChanged = true;
          }
        }
      } catch (e) {}

      if (stateChanged) {
        saveToLocalStorage(inMemoryDb);
        dbCache = JSON.parse(JSON.stringify(inMemoryDb));
        notifySubscribers();
        console.log(`💾 Base de datos sincronizada 100% desde MySQL Localhost (${data.database}).`);
      }
    }
  } catch (e) {
    console.warn("Error cargando base de datos desde MySQL Localhost:", e);
  }
  return inMemoryDb;
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

  if (!PAUSE_ONLINE_SYNC && isOnline) {
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
    pendingOfflineSync = false;
    notifyNetworkSubscribers();
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

// Real-time Listeners Setup (Desactivado en modo 100% local MySQL)
export const initRealtimeListeners = () => {
  return () => {};
};

export const loadDatabaseFromCloud = async () => {
  await loadDatabaseFromMySQL(activeBranch);
  return inMemoryDb;
};

// Supabase Real-time Unsubscribe Handle
let supabaseRealtimeUnsub: (() => void) | null = null;

export const loadDatabaseFromSupabase = async (branchParam?: string): Promise<typeof inMemoryDb> => {
  const branch = branchParam || activeBranch || "Norte";
  await loadDatabaseFromMySQL(branch);
  return inMemoryDb;
};

export const syncDatabaseWithSupabase = async (branchParam?: string) => {
  return { success: true };
};



export const syncWithLocalMySQL = async (branchParam?: string): Promise<{ success: boolean; totalProducts: number; message: string }> => {
  const targetBranch = branchParam || activeBranch || "Norte";

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
          priceMin: menudeo,
          priceMed: medio,
          priceMax: mayoreo,
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
  try {
    const db = getDatabase();
    if (!db) return Promise.resolve();
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
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
  } catch (e) {
    return Promise.resolve();
  }
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
  try {
    const db = getDatabase();
    if (!db) return Promise.resolve();
    if (!Array.isArray(db.movements)) db.movements = [];
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
  } catch (e) {
    return Promise.resolve();
  }
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
