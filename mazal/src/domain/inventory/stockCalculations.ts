/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MovementType, StockMovement } from "../../types";

export interface StockValidationResult {
  hasSufficientStock: boolean;
  currentStock: number;
  requestedStock: number;
  difference: number;
}

/**
 * Valida la disponibilidad de inventario ante una venta o traspaso.
 */
export function validateProductStock(currentStock: number, requestedQuantity: number): StockValidationResult {
  const curr = Number(currentStock) || 0;
  const req = Number(requestedQuantity) || 0;
  const diff = curr - req;

  return {
    hasSufficientStock: diff >= 0,
    currentStock: curr,
    requestedStock: req,
    difference: diff
  };
}

/**
 * Calcula el nuevo stock y genera un movimiento de kárdex puro.
 */
export function calculateKardexDelta(
  productId: string,
  productName: string,
  currentStock: number,
  quantityDelta: number,
  type: MovementType,
  user: string,
  notes?: string
): { newStock: number; movement: StockMovement } {
  const prev = Number(currentStock) || 0;
  const delta = Number(quantityDelta) || 0;
  
  let newStock = prev;
  if (type === MovementType.ENTRY_PURCHASE || type === MovementType.ENTRY_ADJUSTMENT) {
    newStock = prev + delta;
  } else if (type === MovementType.EXIT_SALE || type === MovementType.EXIT_ADJUSTMENT || type === MovementType.EXIT_EXPIRED) {
    newStock = Math.max(0, prev - delta);
  }

  const movement: StockMovement = {
    id: `MOV_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    productId,
    productName,
    type,
    quantity: delta,
    previousStock: prev,
    newStock,
    date: new Date().toISOString().replace("T", " ").substring(0, 19),
    user,
    notes
  };

  return {
    newStock,
    movement
  };
}
