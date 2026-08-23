/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, ProductUnit } from "../types";
import { getDatabase, saveDatabase } from "../data";
import { supabase, isSupabaseConfigured } from "../supabase";

export interface MigrationResult {
  success: boolean;
  totalProcessed: number;
  migratedCount: number;
  skippedCount: number;
  errors: string[];
  skippedBarcodes: string[];
}

/**
 * Normalizes price values from JSON, fixing issues with dots or thousands separators (e.g. 120000 -> 120.00).
 */
export function normalizePrice(rawVal: any): number {
  if (rawVal === undefined || rawVal === null) return 0;
  const strVal = String(rawVal).trim();
  const hasDecimalDot = strVal.includes(".") && !strVal.endsWith(".");
  let val = parseFloat(strVal.replace(/[^\d.]/g, "")) || 0;

  if (!hasDecimalDot) {
    if (val >= 100000) {
      val = val / 1000;
    } else if (val >= 10000) {
      val = val / 100;
    }
  }
  return Number(val.toFixed(4));
}

/**
 * Migrates a list of products into local database and Supabase Cloud.
 */
export async function migrateProductsToDatabase(rawProducts: any[]): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    totalProcessed: rawProducts.length,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    skippedBarcodes: []
  };

  try {
    const db = getDatabase();
    const existingProducts: Product[] = db.products || [];
    const existingBarcodes = new Set<string>(existingProducts.map(p => (p.barcode || p.code || "").trim()).filter(Boolean));
    const newProductsList: Product[] = [...existingProducts];

    for (const raw of rawProducts) {
      try {
        const rawBarcode = raw.codigoBarras !== undefined ? raw.codigoBarras : (raw.barcode !== undefined ? raw.barcode : (raw.codigo !== undefined ? raw.codigo : (raw.code !== undefined ? raw.code : "")));
        const barcode = rawBarcode !== "" ? String(rawBarcode).trim() : "";
        
        if (!barcode) {
          result.errors.push(`Producto omitido por falta de código de barras/código: "${raw.nombre || raw.name || 'Sin nombre'}"`);
          result.skippedCount++;
          continue;
        }

        if (existingBarcodes.has(barcode)) {
          result.skippedBarcodes.push(barcode);
          result.skippedCount++;
          continue;
        }

        const safeId = barcode.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const id = raw.id || `PROD_${safeId || Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const name = String(raw.nombre || raw.name || "Producto sin nombre");
        const lowerName = name.toLowerCase();

        const departamento = String(raw.departamento || raw.department || "Sin clasificar").trim();
        const rawCategoryValue = raw.categoria || raw.category || raw.linea || raw.sublinea || raw.subCategoria || raw.subcategoria || "";
        const categoria = rawCategoryValue ? String(rawCategoryValue).trim() : "Sin clasificar";
        const rawSubCategoryValue = raw.subcategoria || raw.subcategory || "";
        const subcategoria = rawSubCategoryValue ? String(rawSubCategoryValue).trim() : "Sin clasificar";

        let tipoVenta = "pieza";
        let unit = ProductUnit.PIECE;
        let permiteVentaFraccionada = false;

        const rawUnitStr = String(raw.unidadVenta || raw.unit || raw.unidad || "").toLowerCase();
        const isGramInput = rawUnitStr === "g" || rawUnitStr === "gramo" || rawUnitStr === "gram" || rawUnitStr === "grams";
        const isMlInput = rawUnitStr === "ml" || rawUnitStr === "mililitro" || rawUnitStr === "mililitros";

        if (rawUnitStr.includes("kg") || rawUnitStr.includes("kilo") || rawUnitStr.includes("gramo") || rawUnitStr.includes("g") || lowerName.includes(" kg") || lowerName.includes(" kilo")) {
          tipoVenta = "peso";
          unit = ProductUnit.KILO;
          permiteVentaFraccionada = true;
        } else if (rawUnitStr.includes("l") || rawUnitStr.includes("litro") || rawUnitStr.includes("ml") || rawUnitStr.includes("mililitro") || lowerName.includes(" lt") || lowerName.includes(" litro") || lowerName.includes(" ml")) {
          tipoVenta = "volumen";
          unit = ProductUnit.LITER;
          permiteVentaFraccionada = true;
        } else if (rawUnitStr.includes("paq") || rawUnitStr.includes("paquete")) {
          tipoVenta = "pieza";
          unit = ProductUnit.PACK;
          permiteVentaFraccionada = false;
        }

        const rawStock = raw.stock !== undefined ? raw.stock : (raw.cantidad !== undefined ? raw.cantidad : 0);
        let stock = typeof rawStock === "number" ? rawStock : (parseFloat(rawStock) || 0);
        let stockReservado = typeof raw.stockReservado === "number" ? raw.stockReservado : 0;
        let stockMinimo = typeof raw.stockMinimo === "number" ? raw.stockMinimo : (typeof raw.stockMin === "number" ? raw.stockMin : 1);
        let stockMaximo = typeof raw.stockMaximo === "number" ? raw.stockMaximo : (typeof raw.stockMax === "number" ? raw.stockMax : 100);

        if (isGramInput || isMlInput) {
          stock = stock / 1000;
          stockReservado = stockReservado / 1000;
          stockMinimo = stockMinimo / 1000;
          stockMaximo = stockMaximo / 1000;
        }
        const stockDisponible = stock - stockReservado;
        const puntoReorden = typeof raw.puntoReorden === "number" ? raw.puntoReorden : (stockMinimo + 2);

        const rawCostoVal = raw.costo !== undefined ? raw.costo : (raw.cost !== undefined ? raw.cost : (raw.precioUtilidad !== undefined ? raw.precioUtilidad : 0));
        let costo = normalizePrice(rawCostoVal);
        let ultimoCosto = raw.ultimoCosto !== undefined ? normalizePrice(raw.ultimoCosto) : costo;
        let costoPromedio = raw.costoPromedio !== undefined ? normalizePrice(raw.costoPromedio) : costo;
        
        const rawMinVal = raw.precioMenudeo !== undefined ? raw.precioMenudeo : (raw.priceMin !== undefined ? raw.priceMin : (raw.price !== undefined ? raw.price : 0));
        let precioMenudeo = normalizePrice(rawMinVal);
        let precioMedioMayoreo = raw.precioMedioMayoreo !== undefined ? normalizePrice(raw.precioMedioMayoreo) : (raw.priceMed !== undefined ? normalizePrice(raw.priceMed) : precioMenudeo);
        let precioMayoreo = raw.precioMayoreo !== undefined ? normalizePrice(raw.precioMayoreo) : (raw.priceMax !== undefined ? normalizePrice(raw.priceMax) : precioMenudeo);
        let precioEspecial = raw.precioEspecial !== undefined ? normalizePrice(raw.precioEspecial) : (raw.priceSpecial !== undefined ? normalizePrice(raw.priceSpecial) : precioMenudeo);

        if (isGramInput || isMlInput) {
          costo = costo * 1000;
          ultimoCosto = ultimoCosto * 1000;
          costoPromedio = costoPromedio * 1000;
          precioMenudeo = precioMenudeo * 1000;
          precioMedioMayoreo = precioMedioMayoreo * 1000;
          precioMayoreo = precioMayoreo * 1000;
          precioEspecial = precioEspecial * 1000;
        }

        const utilidad = precioMenudeo > 0 ? ((precioMenudeo - costo) / precioMenudeo) * 100 : 0;
        const aplicaIVA = raw.aplicaIVA !== undefined ? !!raw.aplicaIVA : true;
        const porcentajeIVA = raw.porcentajeIVA !== undefined ? Number(raw.porcentajeIVA) : 16;

        const product: Product = {
          id,
          code: String(raw.codigo || raw.code || barcode),
          barcode,
          sku: String(raw.sku || raw.codigo || raw.code || barcode),
          name,
          brand: raw.brand || raw.marca || "Genérico",
          category: categoria,
          subcategory: subcategoria,
          unit,
          cost: costo,
          priceMin: precioMenudeo,
          priceMed: precioMedioMayoreo,
          priceMax: precioMayoreo,
          priceSpecial: precioEspecial,
          stock,
          stockMin: stockMinimo,
          stockMax: stockMaximo,
          location: raw.location || raw.ubicacion || "Almacén",
          isCompound: false,
          imageUrl: raw.imagen || raw.imageUrl || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400",
          supplierId: raw.proveedorId || raw.supplierId || "PROV_DIRECTO",
          codigo: String(raw.codigo || raw.code || barcode),
          codigoBarras: barcode,
          codigoInterno: String(raw.codigoInterno || raw.codigo || raw.code || barcode),
          activo: raw.activo !== undefined ? !!raw.activo : true,
          departamento,
          categoria,
          subcategoria,
          familia: raw.familia || "General",
          linea: raw.linea || "General",
          marca: raw.brand || raw.marca || "Genérico",
          tipoProducto: raw.tipoProducto || "Estándar",
          presentacion: raw.presentacion || "Individual",
          unidadVenta: String(unit),
          unidadCompra: String(unit),
          permiteVentaFraccionada,
          stockReservado,
          stockDisponible,
          stockMinimo,
          stockMaximo,
          puntoReorden,
          costo,
          ultimoCosto,
          costoPromedio,
          precioMenudeo,
          precioMedioMayoreo,
          precioMayoreo,
          precioEspecial,
          utilidad,
          aplicaIVA,
          porcentajeIVA,
          proveedorId: raw.proveedorId || raw.supplierId || "PROV_DIRECTO",
          proveedorNombre: raw.proveedorNombre || "Proveedor Directo",
          sucursal: raw.sucursal || "Norte",
          almacen: raw.almacen || "Almacén General",
          pasillo: raw.pasillo || "Pasillo A",
          estante: raw.estante || "Estante 1",
          ubicacion: raw.location || raw.ubicacion || "Almacén",
          manejaCaducidad: raw.manejaCaducidad !== undefined ? !!raw.manejaCaducidad : false,
          lote: raw.lote || "L-001",
          fechaCaducidad: raw.fechaCaducidad || raw.expiryDate || "",
          descripcion: raw.descripcion || raw.name || "Sin descripción",
          imagen: raw.imagen || raw.imageUrl || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400",
          observaciones: raw.observaciones || "",
          totalVentas: Number(raw.totalVentas || 0),
          totalCompras: Number(raw.totalCompras || 0),
          ultimaVenta: raw.ultimaVenta || "",
          ultimaCompra: raw.ultimaCompra || "",
          rotacion: Number(raw.rotacion || 0),
          tipoVenta,
          unidad: String(unit)
        };

        newProductsList.push(product);
        existingBarcodes.add(barcode);
        result.migratedCount++;

        // Save to Supabase Cloud if configured
        if (isSupabaseConfigured) {
          Promise.resolve(supabase.from("products").upsert({
            id: product.id,
            code: product.code,
            barcode: product.barcode,
            sku: product.sku,
            name: product.name,
            brand: product.brand,
            category: product.category,
            unit: product.unit,
            cost: product.cost,
            price_min: product.priceMin,
            price_med: product.priceMed,
            price_max: product.priceMax,
            price_special: product.priceSpecial,
            stock: product.stock,
            stock_min: product.stockMin,
            stock_max: product.stockMax,
            sucursal: product.sucursal,
            raw_data: product
          }, { onConflict: "id" })).catch(e => console.warn("Supabase upsert warning:", e));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Error migrando producto "${raw.name || 'Sin nombre'}": ${errMsg}`);
        result.skippedCount++;
      }
    }

    db.products = newProductsList;
    saveDatabase(db);
  } catch (error) {
    result.success = false;
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Error general de migración: ${errMsg}`);
  }

  return result;
}

export const migrateProducts = migrateProductsToDatabase;
