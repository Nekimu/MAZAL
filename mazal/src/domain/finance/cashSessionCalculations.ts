/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CashSession, CashExpense, Sale, PaymentMethod } from "../../types";

export interface CashSessionMetrics {
  initialCash: number;
  cashSalesTotal: number;
  cardSalesTotal: number;
  transferSalesTotal: number;
  creditSalesTotal: number;
  totalSales: number;
  salesCount: number;
  expensesTotal: number;
  expensesCount: number;
  expectedFinalCash: number;
  difference?: number;
  statusLabel?: "Cuadre Exacto" | "Sobrante" | "Faltante";
  diffFormatted?: string;
}

/**
 * Normaliza y combina fecha y hora de un gasto para comparación temporal consistente.
 */
export function getExpenseTimestamp(expense: Partial<CashExpense>): string {
  const date = (expense.date || "").trim();
  const time = (expense.time || "").trim();
  
  if (date.length > 10) {
    return date;
  }
  return `${date || "1970-01-01"} ${time || "00:00:00"}`;
}

/**
 * Calcula de forma pura y determinista las métricas de una sesión de caja y su arqueo.
 */
export function calculateCashSessionMetrics(
  session: CashSession | null | undefined,
  sales: Sale[] = [],
  expenses: CashExpense[] = [],
  physicalCashContado?: number
): CashSessionMetrics {
  if (!session) {
    return {
      initialCash: 0,
      cashSalesTotal: 0,
      cardSalesTotal: 0,
      transferSalesTotal: 0,
      creditSalesTotal: 0,
      totalSales: 0,
      salesCount: 0,
      expensesTotal: 0,
      expensesCount: 0,
      expectedFinalCash: 0
    };
  }

  const startTime = session.startTime || "";
  const endTime = session.endTime;

  // Filtrar ventas dentro del rango de la sesión
  const sessionSales = sales.filter((s: Sale) => {
    const sDate = s.date || "";
    if (!sDate) return false;
    if (endTime) {
      return sDate >= startTime && sDate <= endTime;
    }
    return sDate >= startTime;
  });

  let cashSalesTotal = 0;
  let cardSalesTotal = 0;
  let transferSalesTotal = 0;
  let creditSalesTotal = 0;

  for (const s of sessionSales) {
    const total = Number(s.total) || 0;
    const method = String(s.paymentMethod || "").toLowerCase();
    
    if (method.includes("efectivo") || method === "cash") {
      cashSalesTotal += total;
    } else if (method.includes("tarjeta") || method === "card") {
      cardSalesTotal += total;
    } else if (method.includes("transfer") || method === "transferencia") {
      transferSalesTotal += total;
    } else if (method.includes("crédito") || method.includes("credito") || method.includes("fiado")) {
      creditSalesTotal += total;
    } else {
      cashSalesTotal += total; // Por defecto efectivo si no está especificado
    }
  }

  // Filtrar gastos dentro del rango de la sesión
  const sessionExpenses = expenses.filter((ex: CashExpense) => {
    const expTs = getExpenseTimestamp(ex);
    if (endTime) {
      return expTs >= startTime && expTs <= endTime;
    }
    return expTs >= startTime;
  });

  const expensesTotal = sessionExpenses.reduce((sum, ex) => sum + (Number(ex.amount) || 0), 0);
  const initialCash = Number(session.initialCash) || 0;
  const expectedFinalCash = Math.round((initialCash + cashSalesTotal - expensesTotal + Number.EPSILON) * 100) / 100;

  const result: CashSessionMetrics = {
    initialCash,
    cashSalesTotal: Math.round((cashSalesTotal + Number.EPSILON) * 100) / 100,
    cardSalesTotal: Math.round((cardSalesTotal + Number.EPSILON) * 100) / 100,
    transferSalesTotal: Math.round((transferSalesTotal + Number.EPSILON) * 100) / 100,
    creditSalesTotal: Math.round((creditSalesTotal + Number.EPSILON) * 100) / 100,
    totalSales: Math.round((cashSalesTotal + cardSalesTotal + transferSalesTotal + creditSalesTotal + Number.EPSILON) * 100) / 100,
    salesCount: sessionSales.length,
    expensesTotal: Math.round((expensesTotal + Number.EPSILON) * 100) / 100,
    expensesCount: sessionExpenses.length,
    expectedFinalCash
  };

  if (physicalCashContado !== undefined && physicalCashContado !== null && !isNaN(physicalCashContado)) {
    const diff = Math.round((physicalCashContado - expectedFinalCash + Number.EPSILON) * 100) / 100;
    result.difference = diff;
    if (Math.abs(diff) < 0.01) {
      result.statusLabel = "Cuadre Exacto";
      result.diffFormatted = "Cuadre Exacto ($0.00)";
    } else if (diff > 0) {
      result.statusLabel = "Sobrante";
      result.diffFormatted = `Sobrante (+${diff.toFixed(2)} MXN)`;
    } else {
      result.statusLabel = "Faltante";
      result.diffFormatted = `Faltante (-${Math.abs(diff).toFixed(2)} MXN)`;
    }
  }

  return result;
}
