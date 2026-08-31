/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ProductUnit {
  PIECE = "Pza",
  KILO = "Kg",
  LITER = "L",
  PACK = "Paq",
  PACKAGE = "Paq",
  BOX = "Caja",
  GRAM = "g",
  ML = "ml",
  UNIT = "Ud"
}

export interface Product {
  // Existing fields for compatibility:
  id: string;
  code: string;
  barcode: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  unit: ProductUnit;
  cost: number;
  priceMin: number; // Menudeo
  priceMed: number; // Medio Mayoreo (e.g., >= 12 items)
  priceMax: number; // Mayoreo (e.g., >= 50 items)
  priceSpecial: number; // For special client roles
  stock: number;
  stockMin: number;
  stockMax: number;
  location: string; // Shelf, aisle, etc.
  expiryDate?: string; // YYYY-MM-DD
  isCompound: boolean;
  components?: { productId: string; quantity: number }[]; // For package/kit
  imageUrl: string;
  supplierId: string;

  // --- NEW IDENTIFICACIÓN ---
  codigo: string;
  codigoBarras: string;
  codigoInterno: string;
  activo: boolean;

  // --- CLASIFICACIÓN ---
  departamento: string;
  categoria: string;
  subcategoria: string;
  familia: string;
  linea: string;
  marca: string;
  tipoProducto: string;
  presentacion: string;

  // --- INVENTARIO ---
  unidadVenta: string;
  unidadCompra: string;
  permiteVentaFraccionada?: boolean;
  stockReservado: number;
  stockDisponible: number;
  stockMinimo: number;
  stockMaximo: number;
  puntoReorden: number;

  // --- PRECIOS ---
  costo: number;
  ultimoCosto: number;
  costoPromedio: number;
  precioMenudeo: number;
  precioMedioMayoreo: number;
  precioMayoreo: number;
  precioEspecial: number;
  utilidad: number;

  // --- IMPUESTOS ---
  aplicaIVA: boolean;
  porcentajeIVA: number;

  // --- PROVEEDOR ---
  proveedorId: string;
  proveedorNombre: string;

  // --- UBICACIÓN ---
  sucursal: string;
  almacen: string;
  pasillo: string;
  estante: string;
  ubicacion: string;

  // --- CADUCIDAD ---
  manejaCaducidad: boolean;
  lote: string;
  fechaCaducidad: string;

  // --- INFORMACIÓN ADICIONAL ---
  descripcion: string;
  imagen: string;
  observaciones: string;

  // --- ESTADÍSTICAS ---
  totalVentas: number;
  totalCompras: number;
  ultimaVenta: string;
  ultimaCompra: string;
  rotacion: number;

  // --- VENTA POR UNIDADES Y GRAMAJE ---
  tipoVenta: string; // 'peso' | 'pieza' | 'volumen'
  unidad: string;
  unidadMedida?: string;
  gramajeBase?: number; // Gramos o mililitros base por unidad/presentación
  precioPorGramo?: number; // Precio por gramo/ml informativo o calculado
}

export function formatPrice(price: number | string | null | undefined, isPerGramOrMl: boolean = false): string {
  if (price === undefined || price === null || price === "") return "0.00";
  const num = typeof price === "string" ? parseFloat(price) : Number(price);
  if (isNaN(num)) return "0.00";

  // Redondeo de decimales de los productos a 4 dígitos después del punto
  const rounded = Math.round((num + Number.EPSILON) * 10000) / 10000;
  const str = rounded.toFixed(4);

  if (str.endsWith("00")) {
    return rounded.toFixed(2);
  }
  if (str.endsWith("0")) {
    return rounded.toFixed(3);
  }
  return str;
}
