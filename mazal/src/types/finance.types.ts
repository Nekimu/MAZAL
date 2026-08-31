/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  // --- ENTERPRISE FIELDS ---
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
