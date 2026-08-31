/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum CustomerRole {
  NORMAL = "Cliente Normal",
  FREQUENT = "Cliente Frecuente",
  WHOLESALER = "Mayorista",
  WHOLESALE = "Mayorista",
  DISTRIBUTOR = "Distribuidor"
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
