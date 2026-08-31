/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CartItem, PaymentMethod } from "../../types";

export interface SaleCalculationResult {
  subtotal: number;
  totalDiscount: number;
  tax: number;
  total: number;
  costTotal: number;
  profit: number;
  itemCount: number;
  totalUnits: number;
}

/**
 * Calcula de forma pura los totales, utilidades y costos de un conjunto de items en el carrito.
 */
export function calculateSaleTotals(items: CartItem[]): SaleCalculationResult {
  let subtotal = 0;
  let totalDiscount = 0;
  let costTotal = 0;
  let totalUnits = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.selectedPrice) || 0;
    const discount = Number(item.discount) || 0;
    const unitCost = Number(item.product?.cost) || 0;

    const itemGross = qty * unitPrice;
    const itemDiscount = discount; // Descuento directo aplicado
    const itemNet = Math.max(0, itemGross - itemDiscount);

    subtotal += itemGross;
    totalDiscount += itemDiscount;
    costTotal += (qty * unitCost);
    totalUnits += qty;
  }

  const total = Math.max(0, subtotal - totalDiscount);
  const profit = total - costTotal;

  return {
    subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
    totalDiscount: Math.round((totalDiscount + Number.EPSILON) * 100) / 100,
    tax: 0, // En MAZAL los precios ya integran IVA o son tasa 0 según configuración
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    costTotal: Math.round((costTotal + Number.EPSILON) * 100) / 100,
    profit: Math.round((profit + Number.EPSILON) * 100) / 100,
    itemCount: items.length,
    totalUnits: Math.round((totalUnits + Number.EPSILON) * 1000) / 1000
  };
}

/**
 * Determina el cambio a entregar en función del monto pagado y total de venta.
 */
export function calculateSaleChange(total: number, amountPaid: number, method: PaymentMethod): number {
  if (method !== PaymentMethod.CASH) return 0;
  const change = (Number(amountPaid) || 0) - (Number(total) || 0);
  return change > 0 ? Math.round((change + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * Valida si un carrito es elegible para procesar cobro.
 */
export function validateCartForSale(items: CartItem[]): { valid: boolean; error?: string } {
  if (!items || items.length === 0) {
    return { valid: false, error: "El carrito está vacío." };
  }

  for (const item of items) {
    if (!item.product || !item.product.id) {
      return { valid: false, error: "Existe un producto no válido en el carrito." };
    }
    if ((Number(item.quantity) || 0) <= 0) {
      return { valid: false, error: `La cantidad de '${item.product.name}' debe ser mayor a 0.` };
    }
    if ((Number(item.selectedPrice) || 0) < 0) {
      return { valid: false, error: `El precio de '${item.product.name}' no puede ser negativo.` };
    }
  }

  return { valid: true };
}
