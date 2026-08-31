/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
