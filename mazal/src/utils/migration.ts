/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { firestore } from "../firebase";
import { Product, ProductUnit } from "../types";
import { getDatabase, saveDatabase } from "../data";

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
  // Check if string contains a decimal point that is already a valid float separator
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
 * Migrates a list of products (typically parsed from a zapatos/productos.json) into Firestore.
 * Performs barcode duplication checks to prevent inserting duplicates.
 */
export async function migrateProductsToFirestore(rawProducts: any[]): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    totalProcessed: rawProducts.length,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    skippedBarcodes: []
  };

  try {
    // 1. Fetch existing barcodes from Firestore to have a fast lookup map
    const existingBarcodes = new Set<string>();
    const productsColRef = collection(firestore, "products");
    const snapshot = await getDocs(productsColRef);
    snapshot.forEach((doc) => {
      const data = doc.data() as Product;
      if (data.barcode) {
        existingBarcodes.add(data.barcode.trim());
      }
    });

    // 2. Process each raw product and upload
    for (const raw of rawProducts) {
      try {
        const rawBarcode = raw.codigoBarras !== undefined ? raw.codigoBarras : (raw.barcode !== undefined ? raw.barcode : (raw.codigo !== undefined ? raw.codigo : (raw.code !== undefined ? raw.code : "")));
        const barcode = rawBarcode !== "" ? String(rawBarcode).trim() : "";
        
        // Skip products without a barcode or with empty barcode if we can't identify them
        if (!barcode) {
          result.errors.push(`Producto omitido por falta de código de barras/código: "${raw.nombre || raw.name || 'Sin nombre'}"`);
          result.skippedCount++;
          continue;
        }

        // Validate duplicates by barcode
        if (existingBarcodes.has(barcode)) {
          result.skippedBarcodes.push(barcode);
          result.skippedCount++;
          continue;
        }

        // Generate clean ID matching firestore.rules valid ID regex: ^[a-zA-Z0-9_\-]+$
        const safeId = barcode.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const id = raw.id || `PROD_${safeId || Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        // Name
        const name = String(raw.nombre || raw.name || "Producto sin nombre");
        const lowerName = name.toLowerCase();

        // Directly use custom classification from JSON if already provided
        const departamento = String(raw.departamento || raw.department || "Sin clasificar").trim();
        const rawCategoryValue = raw.categoria || raw.category || raw.linea || raw.sublinea || raw.subCategoria || raw.subcategoria || "";
        const categoria = rawCategoryValue ? String(rawCategoryValue).trim() : "Sin clasificar";
        const rawSubCategoryValue = raw.subcategoria || raw.subcategory || "";
        const subcategoria = rawSubCategoryValue ? String(rawSubCategoryValue).trim() : "Sin clasificar";

        // Auto Unit and Type of Sale Detection
        let tipoVenta = "pieza";
        let unit = ProductUnit.PIECE;
        let permiteVentaFraccionada = false;

        const rawUnitStr = String(raw.unidadVenta || raw.unit || raw.unidad || "").toLowerCase();
        const isGramInput = rawUnitStr === "g" || rawUnitStr === "gramo" || rawUnitStr === "gram" || rawUnitStr === "grams";
        const isMlInput = rawUnitStr === "ml" || rawUnitStr === "mililitro" || rawUnitStr === "mililitros";

        if (rawUnitStr.includes("kg") || rawUnitStr.includes("kilo") || rawUnitStr.includes("gramo") || rawUnitStr.includes("g") || lowerName.includes(" kg") || lowerName.includes(" kilo")) {
          tipoVenta = "peso";
          unit = ProductUnit.KILO; // Kg is the base unit in the DB!
          permiteVentaFraccionada = true;
        } else if (rawUnitStr.includes("l") || rawUnitStr.includes("litro") || rawUnitStr.includes("ml") || rawUnitStr.includes("mililitro") || lowerName.includes(" lt") || lowerName.includes(" litro") || lowerName.includes(" ml")) {
          tipoVenta = "volumen";
          unit = ProductUnit.LITER; // Liter is the base unit in the DB!
          permiteVentaFraccionada = true;
        } else if (rawUnitStr.includes("paq") || rawUnitStr.includes("paquete")) {
          tipoVenta = "pieza";
          unit = ProductUnit.PACK;
          permiteVentaFraccionada = false;
        }

        // Parse Stock fields
        const rawStock = raw.stock !== undefined ? raw.stock : (raw.cantidad !== undefined ? raw.cantidad : 0);
        let stock = typeof rawStock === "number" ? rawStock : (parseFloat(rawStock) || 0);
        let stockReservado = typeof raw.stockReservado === "number" ? raw.stockReservado : 0;
        let stockMinimo = typeof raw.stockMinimo === "number" ? raw.stockMinimo : (typeof raw.stockMin === "number" ? raw.stockMin : 1);
        let stockMaximo = typeof raw.stockMaximo === "number" ? raw.stockMaximo : (typeof raw.stockMax === "number" ? raw.stockMax : 100);

        if (isGramInput || isMlInput) {
          // If imported raw unit was grams/ml, convert raw stock to Kg/L
          stock = stock / 1000;
          stockReservado = stockReservado / 1000;
          stockMinimo = stockMinimo / 1000;
          stockMaximo = stockMaximo / 1000;
        }
        const stockDisponible = stock - stockReservado;
        const puntoReorden = typeof raw.puntoReorden === "number" ? raw.puntoReorden : (stockMinimo + 2);

        // Parse Price fields using normalizePrice helper
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
          // If imported raw pricing was per gram/ml, convert to price per Kg/L
          costo = costo * 1000;
          ultimoCosto = ultimoCosto * 1000;
          costoPromedio = costoPromedio * 1000;
          precioMenudeo = precioMenudeo * 1000;
          precioMedioMayoreo = precioMedioMayoreo * 1000;
          precioMayoreo = precioMayoreo * 1000;
          precioEspecial = precioEspecial * 1000;
        }

        const utilidad = precioMenudeo > 0 ? ((precioMenudeo - costo) / precioMenudeo) * 100 : 0;

        // Taxes
        const aplicaIVA = raw.aplicaIVA !== undefined ? !!raw.aplicaIVA : true;
        const porcentajeIVA = raw.porcentajeIVA !== undefined ? Number(raw.porcentajeIVA) : 16;

        // Supplier
        const proveedorId = raw.proveedorId || raw.supplierId || "PROV_DIRECTO";
        const proveedorNombre = raw.proveedorNombre || "Proveedor Directo";

        // Location
        const sucursal = raw.sucursal || "Sucursal Principal";
        const almacen = raw.almacen || "Almacén General";
        const pasillo = raw.pasillo || "Pasillo A";
        const estante = raw.estante || "Estante 1";
        const ubicacion = raw.location || raw.ubicacion || "Almacén";

        // Caducidad
        const manejaCaducidad = raw.manejaCaducidad !== undefined ? !!raw.manejaCaducidad : false;
        const lote = raw.lote || "L-001";
        const fechaCaducidad = raw.fechaCaducidad || raw.expiryDate || "";

        // Additional Info
        const descripcion = raw.descripcion || raw.name || "Sin descripción";
        const imagen = raw.imagen || raw.imageUrl || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400";
        const observaciones = raw.observaciones || "";

        // Stats
        const totalVentas = Number(raw.totalVentas || 0);
        const totalCompras = Number(raw.totalCompras || 0);
        const ultimaVenta = raw.ultimaVenta || "";
        const ultimaCompra = raw.ultimaCompra || "";
        const rotacion = Number(raw.rotacion || 0);

        // Construct standard product object combining old and new properties
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
          location: ubicacion,
          expiryDate: fechaCaducidad || undefined,
          isCompound: !!raw.isCompound,
          components: Array.isArray(raw.components) ? raw.components : undefined,
          imageUrl: imagen,
          supplierId: proveedorId,

          // New Fields
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

          proveedorId,
          proveedorNombre,

          sucursal,
          almacen,
          pasillo,
          estante,
          ubicacion,

          manejaCaducidad,
          lote,
          fechaCaducidad,

          descripcion,
          imagen,
          observaciones,

          totalVentas,
          totalCompras,
          ultimaVenta,
          ultimaCompra,
          rotacion,

          tipoVenta,
          unidad: String(unit)
        };

        // Write directly to Firestore
        const docRef = doc(firestore, "products", id);
        await setDoc(docRef, product);

        // Add to our lookup set in case the upload list contains internal duplicates
        existingBarcodes.add(barcode);
        result.migratedCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Error migrando producto "${raw.name || 'Sin nombre'}": ${errMsg}`);
        result.skippedCount++;
      }
    }

    // Trigger local memory database update if active
    const db = getDatabase();
    if (db) {
      saveDatabase(db);
    }

  } catch (error) {
    result.success = false;
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Error general de migración: ${errMsg}`);
  }

  return result;
}

// Alias for backwards-compatibility or GUI usage
export const migrateProducts = migrateProductsToFirestore;
