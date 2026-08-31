/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from "./product.types";

export enum PaymentMethod {
  CASH = "Efectivo",
  CARD = "Tarjeta",
  TRANSFER = "Transferencia",
  CREDIT = "Crédito (Fiado)"
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
