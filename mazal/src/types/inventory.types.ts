/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MovementType {
  ENTRY_PURCHASE = "Entrada por Compra",
  ENTRY_ADJUSTMENT = "Entrada por Ajuste",
  EXIT_SALE = "Salida por Venta",
  EXIT_ADJUSTMENT = "Salida por Ajuste",
  EXIT_EXPIRED = "Salida por Caducidad"
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
