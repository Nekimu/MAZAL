/**
 * WeightService.ts
 * Enterprise-grade weight and unit conversion service.
 * Standardizes all weight, volume, and pricing logic according to ERP guidelines (SAP, NetSuite, Odoo).
 *
 * Rules:
 * 1. PRICES ARE NEVER CONVERTED OR DIVIDED FOR DATABASE STORAGE (saved exactly as entered, e.g., $41.00/Kg).
 * 2. STOCKS ARE ALWAYS STORED IN THE BASE MAIN UNIT (Kg or L), e.g., 25.500 Kg.
 * 3. QUANTITIES ARE STORED INTERNALLY IN DECIMALS OF BASE UNIT (e.g., 0.250 Kg for 250g, 0.005 Kg for 5g).
 * 4. SUBTOTALS ARE ALWAYS CALCULATED AS: Quantity in base unit (Kg/L) * Price per base unit (Kg/L).
 * 5. Price per gram/ml is ONLY informative.
 */

import { ProductUnit } from "../types";

export enum WeightUnit {
  GRAM = "g",
  KILOGRAM = "kg",
  LITER = "L",
  ML = "ml"
}

export interface WeighedProduct {
  unit?: string | ProductUnit;
  permiteVentaFraccionada?: boolean;
  tipoVenta?: string;
}

/**
 * Converts grams to kilograms.
 */
export function gramsToKg(grams: number): number {
  if (!grams || isNaN(grams)) return 0;
  return Number((grams / 1000).toFixed(6));
}

/**
 * Converts kilograms to grams.
 */
export function kgToGrams(kg: number): number {
  if (!kg || isNaN(kg)) return 0;
  return Number((kg * 1000).toFixed(3));
}

/**
 * Converts milliliters to liters.
 */
export function mlToLiter(ml: number): number {
  if (!ml || isNaN(ml)) return 0;
  return Number((ml / 1000).toFixed(6));
}

/**
 * Converts liters to milliliters.
 */
export function literToMl(liter: number): number {
  if (!liter || isNaN(liter)) return 0;
  return Number((liter * 1000).toFixed(3));
}

/**
 * General conversion function for weight/volume.
 */
export function convertWeight(
  amount: number,
  fromUnit: string,
  toUnit: string
): number {
  if (!amount || isNaN(amount)) return 0;
  const f = fromUnit.toLowerCase().trim();
  const t = toUnit.toLowerCase().trim();

  if (f === t) return amount;

  // Grams -> Kg
  if ((f === "g" || f === "gramo" || f === "gramos" || f === "gram") && (t === "kg" || t === "kilo" || t === "kilogramo" || t === "kilogramos")) {
    return gramsToKg(amount);
  }
  // Kg -> Grams
  if ((f === "kg" || f === "kilo" || f === "kilogramo" || f === "kilogramos") && (t === "g" || t === "gramo" || t === "gramos" || t === "gram")) {
    return kgToGrams(amount);
  }
  // Ml -> Liter
  if ((f === "ml" || f === "mililitro" || f === "mililitros") && (t === "l" || t === "liter" || t === "litro" || t === "litros")) {
    return mlToLiter(amount);
  }
  // Liter -> Ml
  if ((f === "l" || f === "liter" || f === "litro" || f === "litros") && (t === "ml" || t === "mililitro" || t === "mililitros")) {
    return literToMl(amount);
  }

  return amount;
}

/**
 * Checks if a product is a weighed or volume-based item sold in fractional quantities.
 */
export function isWeighed(product?: WeighedProduct): boolean {
  if (!product) return false;
  const unitStr = String(product.unit || "").toLowerCase();
  const tipoStr = String(product.tipoVenta || "").toLowerCase();
  
  return (
    unitStr === "kg" ||
    unitStr === "kilo" ||
    unitStr === "g" ||
    unitStr === "gramo" ||
    unitStr === "gram" ||
    unitStr === "grams" ||
    unitStr === "l" ||
    unitStr === "liter" ||
    unitStr === "litro" ||
    unitStr === "litros" ||
    unitStr === "ml" ||
    unitStr === "mililitro" ||
    unitStr === "mililitros" ||
    product.permiteVentaFraccionada === true ||
    tipoStr === "peso" ||
    tipoStr === "volumen"
  );
}

/**
 * Returns the standardized display unit label for the product (Kg, L, or original).
 */
export function getUnitLabel(product?: WeighedProduct): string {
  if (!product) return "Pza";
  const unitStr = String(product.unit || "").toLowerCase();
  const tipoStr = String(product.tipoVenta || "").toLowerCase();

  if (
    unitStr === "l" ||
    unitStr === "liter" ||
    unitStr === "litro" ||
    unitStr === "litros" ||
    unitStr === "ml" ||
    unitStr === "mililitro" ||
    unitStr === "mililitros" ||
    tipoStr === "volumen"
  ) {
    return "L";
  }

  if (
    unitStr === "kg" ||
    unitStr === "kilo" ||
    unitStr === "g" ||
    unitStr === "gramo" ||
    unitStr === "gram" ||
    unitStr === "grams" ||
    tipoStr === "peso"
  ) {
    return "Kg";
  }

  return product.unit || "Pza";
}

/**
 * Formats a quantity with high decimal precision for weighed products (3 decimals) or standard (no decimals) for pieces.
 */
export function formatQuantity(quantity: number | undefined | null, product?: WeighedProduct): string {
  if (quantity === undefined || quantity === null || isNaN(Number(quantity))) return "0";
  const num = Number(quantity);
  if (isWeighed(product)) {
    return num.toFixed(3);
  }
  return num.toFixed(0);
}

/**
 * Formats a quantity with its unit label.
 */
export function formatQuantityWithUnit(quantity: number | undefined | null, product?: WeighedProduct, selectedUnit?: string): string {
  if (quantity === undefined || quantity === null || isNaN(Number(quantity))) return `0 ${product?.unit || "Pza"}`;
  const num = Number(quantity);
  if (isWeighed(product)) {
    if (selectedUnit === "g") {
      const g = kgToGrams(num);
      return `${g} g`;
    }
    if (selectedUnit === "ml") {
      const ml = literToMl(num);
      return `${ml} ml`;
    }
    // Default: if selectedUnit is kg / L or not provided
    if (num < 1 && num > 0 && !selectedUnit) {
      const unitLabel = getUnitLabel(product);
      if (unitLabel === "L") {
        return `${literToMl(num)} ml`;
      } else {
        return `${kgToGrams(num)} g`;
      }
    }
    return `${num.toFixed(3)} ${getUnitLabel(product)}`;
  }
  return `${num.toFixed(0)} ${product?.unit || "Pza"}`;
}

/**
 * Calculates the monetary subtotal for a transaction item cleanly in base unit.
 */
export function calculateSubtotal(quantity: number, price: number): number {
  if (quantity === undefined || quantity === null || isNaN(quantity)) return 0;
  if (price === undefined || price === null || isNaN(price)) return 0;
  
  // Directly multiply Quantity * Price without any divisions.
  // Using high precision rounding to avoid JavaScript floating point errors.
  return Number((quantity * price).toFixed(2));
}

/**
 * Returns the informative price per gram/ml for display purposes only.
 */
export function getInformativePricePerGram(price: number): number {
  if (price === undefined || price === null || isNaN(price)) return 0;
  return Number((price / 1000).toFixed(6));
}
