/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- ENUMS ---

export enum ProductUnit {
  PIECE = "Pza",
  KILO = "Kg",
  LITER = "L",
  PACK = "Paq",
  PACKAGE = "Paq",
  BOX = "Caja",
  GRAM = "g",
  ML = "ml",
  UNIT = "Ud"
}

export enum CustomerRole {
  NORMAL = "Cliente Normal",
  FREQUENT = "Cliente Frecuente",
  WHOLESALER = "Mayorista",
  WHOLESALE = "Mayorista",
  DISTRIBUTOR = "Distribuidor"
}

export enum PaymentMethod {
  CASH = "Efectivo",
  CARD = "Tarjeta",
  TRANSFER = "Transferencia",
  CREDIT = "Crédito (Fiado)"
}

export enum UserRole {
  ADMIN = "Administrador",
  MANAGER = "Gerente",
  CASHIER = "Cajero",
  WAREHOUSE = "Almacenista",
  PURCHASING = "Compras",
  ACCOUNTANT = "Contabilidad"
}

export enum MovementType {
  ENTRY_PURCHASE = "Entrada por Compra",
  ENTRY_ADJUSTMENT = "Entrada por Ajuste",
  EXIT_SALE = "Salida por Venta",
  EXIT_ADJUSTMENT = "Salida por Ajuste",
  EXIT_EXPIRED = "Salida por Caducidad"
}

// --- INTERFACES ---

export interface Product {
  // Existing fields for compatibility:
  id: string;
  code: string;
  barcode: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  unit: ProductUnit;
  cost: number;
  priceMin: number; // Menudeo
  priceMed: number; // Medio Mayoreo (e.g., >= 12 items)
  priceMax: number; // Mayoreo (e.g., >= 50 items)
  priceSpecial: number; // For special client roles
  stock: number;
  stockMin: number;
  stockMax: number;
  location: string; // Shelf, aisle, etc.
  expiryDate?: string; // YYYY-MM-DD
  isCompound: boolean;
  components?: { productId: string; quantity: number }[]; // For package/kit
  imageUrl: string;
  supplierId: string;

  // --- NEW IDENTIFICACIÓN ---
  codigo: string;
  codigoBarras: string;
  codigoInterno: string;
  activo: boolean;

  // --- CLASIFICACIÓN ---
  departamento: string;
  categoria: string;
  subcategoria: string;
  familia: string;
  linea: string;
  marca: string;
  tipoProducto: string;
  presentacion: string;

  // --- INVENTARIO ---
  unidadVenta: string;
  unidadCompra: string;
  permiteVentaFraccionada?: boolean;
  stockReservado: number;
  stockDisponible: number;
  stockMinimo: number;
  stockMaximo: number;
  puntoReorden: number;

  // --- PRECIOS ---
  costo: number;
  ultimoCosto: number;
  costoPromedio: number;
  precioMenudeo: number;
  precioMedioMayoreo: number;
  precioMayoreo: number;
  precioEspecial: number;
  utilidad: number;

  // --- IMPUESTOS ---
  aplicaIVA: boolean;
  porcentajeIVA: number;

  // --- PROVEEDOR ---
  proveedorId: string;
  proveedorNombre: string;

  // --- UBICACIÓN ---
  sucursal: string;
  almacen: string;
  pasillo: string;
  estante: string;
  ubicacion: string;

  // --- CADUCIDAD ---
  manejaCaducidad: boolean;
  lote: string;
  fechaCaducidad: string;

  // --- INFORMACIÓN ADICIONAL ---
  descripcion: string;
  imagen: string;
  observaciones: string;

  // --- ESTADÍSTICAS ---
  totalVentas: number;
  totalCompras: number;
  ultimaVenta: string;
  ultimaCompra: string;
  rotacion: number;

  // --- VENTA POR UNIDADES Y GRAMAJE ---
  tipoVenta: string; // 'peso' | 'pieza' | 'volumen'
  unidad: string;
  unidadMedida?: string;
  gramajeBase?: number; // Gramos o mililitros base por unidad/presentación (ej. 250, 500, 1000)
  precioPorGramo?: number; // Precio por gramo/ml informativo o calculado
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  date: string; // YYYY-MM-DD HH:mm:ss
  user: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  rfc: string;
  role: CustomerRole;
  creditLimit: number;
  creditUsed: number;
  creditDays: number;
  notes?: string;
  status?: "Activo" | "Inactivo";
}

export interface CreditPayment {
  id: string;
  customerId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  rfc: string;
  outstandingBalance: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  items: {
    productId: string;
    productName: string;
    cost: number;
    quantity: number;
    expiryDate?: string;
    received?: boolean;
    suggestedPrice?: number;
    aplicaIVA?: boolean;
    porcentajeIVA?: number;
    discount?: number;
    lote?: string;
    location?: string;
  }[];
  total: number;
  status: "Pendiente" | "Recibida" | "Cancelada";
  date: string;
  receivedDate?: string;
  paymentStatus: "Pagado" | "Abonado" | "Pendiente";
}

export interface CartItem {
  product: Product;
  quantity: number;
  inputUnit?: string;
  priceType: "menudeo" | "medio" | "mayoreo" | "especial";
  selectedPrice: number;
  discount: number; // fixed amount or percentage
}

export interface Sale {
  id: string;
  ticketNumber: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    displayUnit?: string;
    unitPrice: number;
    totalPrice: number;
    cost: number;
  }[];
  total: number;
  costTotal: number;
  profit: number;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD HH:mm:ss
  amountPaid?: number;
  change?: number;
  sucursal?: string;
}

export interface CashSession {
  id: string;
  startTime: string;
  endTime?: string;
  openedBy: string;
  initialCash: number;
  finalCash?: number;
  status: "Abierta" | "Cerrada";
  salesTotal: number;
  expensesTotal: number;
  expectedFinalCash?: number;
}

export interface CashExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  user: string;
  // --- NEW ENTERPRISE FIELDS ---
  time?: string;
  sucursal?: string;
  empleado?: string;
  proveedor?: string;
  departamento?: string;
  centroCostos?: string;
  vehiculoId?: string;
  subcategoria?: string;
  iva?: number;
  subtotal?: number;
  total?: number;
  metodoPago?: string;
  bancoId?: string;
  numeroFactura?: string;
  numeroTicket?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  imageUrl?: string;
  observaciones?: string;
  status?: "Aprobado" | "Pendiente" | "Rechazado";
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  type: "Cheques" | "Ahorros" | "Crédito" | "Inversión";
  balance: number;
  initialBalance: number;
  currency: string;
  status: "Activo" | "Inactivo";
  branch?: string;
}

export interface BankMovement {
  id: string;
  bankAccountId: string;
  type: "Depósito" | "Retiro" | "Transferencia";
  amount: number;
  date: string; // YYYY-MM-DD HH:mm:ss
  description: string;
  category: string;
  reference: string;
  sourceAccount?: string;
  targetAccount?: string;
  user: string;
}

export interface Budget {
  id: string;
  branch: string;
  department: string;
  category: string;
  amount: number;
  month: number; // 1-12
  year: number;
  notes?: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string;
  department: string;
  status: "Activo" | "Inactivo";
}

export interface Vehicle {
  id: string;
  plates: string;
  model: string;
  brand: string;
  driver: string;
  mileage: number;
  insuranceExpiry: string; // YYYY-MM-DD
  verificationExpiry?: string; // YYYY-MM-DD
  teneciaPaid: boolean;
  maintenanceIntervalKm: number;
  lastMaintenanceMileage: number;
  monthlyCost?: number;
  annualCost?: number;
  costPerKm?: number;
  status: "Activo" | "Taller" | "Inactivo";
  history?: {
    id: string;
    date: string;
    type: string; // 'Gasolina' | 'Mantenimiento' | 'Tenencia' | 'Seguro' | 'Otros'
    cost: number;
    description: string;
    mileage?: number;
  }[];
}

export interface AuditLog {
  id: string;
  user: string;
  role: string;
  action: string;
  details: string;
  timestamp: string;
  ip: string;
  branch: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  password?: string;
  role: UserRole;
  status: "Activo" | "Inactivo";
  lastLogin?: string;
}

// --- CENTRAL WAREHOUSE & DISTRIBUTION INTERFACES ---

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  manager?: string;
  status: "Activo" | "Inactivo";
  isCentral?: boolean;
}

export interface BranchInventoryItem {
  id: string;
  productId: string;
  productName: string;
  code: string;
  barcode?: string;
  category?: string;
  unit?: string;
  sucursal: string; // Branch name e.g., "Centro", "Norte", "Sur", "Bodega"
  stock: number;
  stockMin: number;
  stockMax: number;
  location?: string;
  cost?: number;
  priceMin?: number;
  updatedAt: string;
}

export interface DistributionRecord {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD HH:mm:ss
  user: string;
  items: {
    productId: string;
    productName: string;
    code: string;
    quantity: number;
    destinationBranch: string;
  }[];
  totalItems: number;
  totalUnits: number;
  notes?: string;
  status: "Completada" | "Cancelada";
}

export interface TransferRecord {
  id: string;
  code: string;
  date: string; // YYYY-MM-DD HH:mm:ss
  user: string;
  sourceBranch: string;
  destinationBranch: string;
  items: {
    productId: string;
    productName: string;
    code: string;
    quantity: number;
  }[];
  notes?: string;
  status: "Completada" | "Pendiente" | "Rechazada";
}

export interface ReplenishmentRequest {
  id: string;
  code: string;
  branch: string;
  requestDate: string; // YYYY-MM-DD HH:mm:ss
  requestedBy: string;
  items: {
    productId: string;
    productName: string;
    code: string;
    currentStock: number;
    requestedQuantity: number;
    approvedQuantity?: number;
  }[];
  status: "Pendiente" | "Aprobado" | "Rechazado" | "Enviado";
  reviewDate?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

// --- HELPER FUNCTIONS ---

export function formatPrice(price: number | string | null | undefined, isPerGramOrMl: boolean = false): string {
  if (price === undefined || price === null || price === "") return "0.00";
  const num = typeof price === "string" ? parseFloat(price) : Number(price);
  if (isNaN(num)) return "0.00";

  // Redondeo de decimales de los productos a 4 dígitos después del punto
  const rounded = Math.round((num + Number.EPSILON) * 10000) / 10000;
  const str = rounded.toFixed(4);

  // Si termina en 00 (ej. 15.5000), mostrar con formato estándar de 2 decimales (15.50)
  if (str.endsWith("00")) {
    return rounded.toFixed(2);
  }
  // Si termina en un solo 0 (ej. 15.5450), mostrar los 3 decimales reales (15.545)
  if (str.endsWith("0")) {
    return rounded.toFixed(3);
  }
  // Si tiene 4 decimales significativos (ej. 15.5458, 9.3366), mostrar los 4 dígitos completos
  return str;
}

// --- OFFLINE SYNC TYPES ---

export type PendingOperationType =
  | "SALE"
  | "INVENTORY_MOVEMENT"
  | "CUSTOMER"
  | "SUPPLIER"
  | "EXPENSE"
  | "USER"
  | "PRODUCT"
  | "PURCHASE"
  | "CASH_SESSION"
  | "TRANSFER"
  | "BRANCH_INVENTORY";

export interface PendingOperation {
  id: string; // Unique UUID
  type: PendingOperationType;
  timestamp: number;
  isoDate: string;
  branch: string;
  user: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  collectionName: string;
  docId: string;
  payload: any;
  status: "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";
  retries: number;
  errorMessage?: string;
  conflictDetails?: {
    localData: any;
    cloudData: any;
    detectedAt: string;
  };
}

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  syncErrorsCount: number;
  pendingByType: {
    sales: number;
    products: number;
    movements: number;
    customers: number;
    other: number;
  };
  conflicts: PendingOperation[];
}

// --- ROLE PERMISSIONS TYPES & UTILS ---

export interface RolePermissions {
  pos: boolean;
  inventory: boolean;
  customers: boolean;
  purchases: boolean;
  reports: boolean;
  security: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  [UserRole.ADMIN]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true },
  [UserRole.MANAGER]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: false },
  [UserRole.CASHIER]: { pos: true, inventory: false, customers: true, purchases: false, reports: false, security: false },
  [UserRole.WAREHOUSE]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
  [UserRole.PURCHASING]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
  [UserRole.ACCOUNTANT]: { pos: false, inventory: false, customers: true, purchases: true, reports: true, security: false }
};

export function getSavedRolePermissions(): Record<string, RolePermissions> {
  try {
    const saved = localStorage.getItem("mazal_role_permissions");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Protect Admin to always retain all permissions
      parsed[UserRole.ADMIN] = { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
      return { ...DEFAULT_ROLE_PERMISSIONS, ...parsed };
    }
  } catch (e) {
    console.error("Error reading mazal_role_permissions:", e);
  }
  return DEFAULT_ROLE_PERMISSIONS;
}

export async function fetchRolePermissionsFromDB(): Promise<Record<string, RolePermissions>> {
  return getSavedRolePermissions();
}

export async function saveRolePermissionsToDB(permissions: Record<string, RolePermissions>): Promise<{ success: boolean; message?: string }> {
  permissions[UserRole.ADMIN] = { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
  localStorage.setItem("mazal_role_permissions", JSON.stringify(permissions));
  return { success: true, message: "Permisos guardados exitosamente en el sistema." };
}

export function normalizeUserRole(role: any): UserRole {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "administrador" || r === "administrator" || r.includes("admin")) return UserRole.ADMIN;
  if (r === "gerente" || r === "manager") return UserRole.MANAGER;
  if (r === "cajero" || r === "caja" || r === "cashier" || r === "vendedor") return UserRole.CASHIER;
  if (r === "almacenista" || r === "almacen" || r === "warehouse") return UserRole.WAREHOUSE;
  if (r === "compras" || r === "purchasing") return UserRole.PURCHASING;
  if (r === "contabilidad" || r === "contador" || r === "accountant") return UserRole.ACCOUNTANT;
  return UserRole.ADMIN;
}

export function getRolePermissionsForUser(role: any): RolePermissions {
  const normalized = normalizeUserRole(role);
  if (normalized === UserRole.ADMIN) {
    return { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
  }
  const allPerms = getSavedRolePermissions();
  return allPerms[normalized] || allPerms[role] || { pos: false, inventory: false, customers: false, purchases: false, reports: false, security: false };
}

// --- STOCK TRANSFER INTERFACE ---

export interface StockTransfer {
  id: string;
  transferCode: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  fromBranch: "Matriz" | "Norte" | "Sur";
  toBranch: "Matriz" | "Norte" | "Sur";
  requestedBy: string;
  requestDate: string;
  dispatchedBy?: string;
  dispatchDate?: string;
  receivedBy?: string;
  receiveDate?: string;
  status: "PENDIENTE_RECEPCION" | "COMPLETADO" | "CANCELADO" | "RECHAZADO";
  confirmedBySender: boolean;
  confirmedByReceiver: boolean;
  notes?: string;
}



