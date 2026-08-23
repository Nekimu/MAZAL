/**
 * MAZAL POS & ERP - Supabase Sync Engine
 * Sincronización en la nube bidireccional, tiempo real y contingencia offline.
 */
import { supabase, isSupabaseConfigured, ensureSupabaseConfigured, getSupabaseClient } from "../supabase";
import { 
  Product, 
  Customer, 
  Supplier, 
  Sale, 
  StockMovement, 
  CashSession, 
  CashExpense, 
  PurchaseOrder, 
  User, 
  Branch,
  BranchInventoryItem,
  BankAccount,
  BankMovement,
  Budget,
  CostCenter,
  Vehicle,
  AuditLog
} from "../types";

/**
 * Normaliza un producto obtenido de Supabase para asegurar compatibilidad con la UI.
 */
export function mapDbProductToLocal(row: any): Product {
  const raw = row.raw_data || {};
  return {
    id: row.id,
    code: row.code || raw.code || `PRD-${row.id}`,
    barcode: row.barcode || raw.barcode || `750000${String(row.id).replace(/\D/g, '').padStart(6, '0')}`,
    sku: row.sku || raw.sku || `SKU-${row.id}`,
    name: row.name || raw.name || "Sin Nombre",
    brand: row.brand || raw.brand || "MAZAL",
    category: row.category || raw.category || "Abarrotes Generales",
    subcategory: row.subcategory || raw.subcategory || "entero",
    unit: (row.unit || raw.unit || "pz") as any,
    cost: Number(row.cost ?? raw.cost ?? 0),
    priceMin: Number(row.price_min ?? raw.priceMin ?? 0),
    priceMed: Number(row.price_med ?? raw.priceMed ?? (row.price_min ? Number(row.price_min) * 1.1 : 0)),
    priceMax: Number(row.price_max ?? raw.priceMax ?? (row.price_min ? Number(row.price_min) * 1.18 : 0)),
    priceSpecial: Number(row.price_special ?? raw.priceSpecial ?? (row.price_min ? Number(row.price_min) * 0.95 : 0)),
    stock: Number(row.stock ?? raw.stock ?? 0),
    stockMin: Number(row.stock_min ?? raw.stockMin ?? 5),
    stockMax: Number(row.stock_max ?? raw.stockMax ?? 100),
    location: row.location || raw.location || "Bodega Principal",
    expiryDate: row.expiry_date || raw.expiryDate,
    isCompound: Boolean(row.is_compound ?? raw.isCompound ?? false),
    imageUrl: row.image_url || raw.imageUrl || "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300&auto=format&fit=crop&q=60",
    supplierId: row.supplier_id || raw.supplierId || "PROV_01",
    
    // Extended fields
    codigo: row.code || raw.codigo || "",
    codigoBarras: row.barcode || raw.codigoBarras || "",
    codigoInterno: row.sku || raw.codigoInterno || "",
    activo: raw.activo !== undefined ? raw.activo : true,
    departamento: raw.departamento || row.category || "General",
    categoria: row.category || raw.categoria || "Abarrotes",
    subcategoria: row.subcategory || raw.subcategoria || "entero",
    familia: raw.familia || "",
    linea: raw.linea || "",
    marca: row.brand || raw.marca || "MAZAL",
    tipoProducto: raw.tipoProducto || "estandar",
    presentacion: raw.presentacion || row.unit || "pz",
    unidadVenta: raw.unidadVenta || row.unit || "pz",
    unidadCompra: raw.unidadCompra || row.unit || "pz",
    permiteVentaFraccionada: raw.permiteVentaFraccionada ?? false,
    stockReservado: Number(raw.stockReservado || 0),
    stockDisponible: Number(row.stock ?? raw.stockDisponible ?? 0),
    stockMinimo: Number(row.stock_min ?? raw.stockMinimo ?? 5),
    stockMaximo: Number(row.stock_max ?? raw.stockMaximo ?? 100),
    puntoReorden: Number(raw.puntoReorden ?? 10),
    costo: Number(row.cost ?? raw.costo ?? 0),
    ultimoCosto: Number(raw.ultimoCosto ?? row.cost ?? 0),
    costoPromedio: Number(raw.costoPromedio ?? row.cost ?? 0),
    precioMenudeo: Number(row.price_min ?? raw.precioMenudeo ?? 0),
    precioMedioMayoreo: Number(row.price_med ?? raw.precioMedioMayoreo ?? 0),
    precioMayoreo: Number(row.price_max ?? raw.precioMayoreo ?? 0),
    precioEspecial: Number(row.price_special ?? raw.precioEspecial ?? 0),
    utilidad: Number(raw.utilidad || 0),
    aplicaIVA: Boolean(raw.aplicaIVA ?? false),
    porcentajeIVA: Number(raw.porcentajeIVA || 16),
    proveedorId: row.supplier_id || raw.proveedorId || "PROV_01",
    proveedorNombre: raw.proveedorNombre || "Distribuidora Mazal",
    sucursal: row.sucursal || raw.sucursal || "Norte",
    almacen: raw.almacen || "Almacén Principal",
    pasillo: raw.pasillo || "",
    estante: raw.estante || "",
    ubicacion: row.location || raw.ubicacion || "Bodega Principal",
    manejaCaducidad: Boolean(raw.manejaCaducidad ?? false),
    lote: raw.lote || "",
    fechaCaducidad: raw.fechaCaducidad || "",
    descripcion: raw.descripcion || row.name || "",
    imagen: row.image_url || raw.imagen || "",
    observaciones: raw.observaciones || "",
    totalVentas: Number(raw.totalVentas || 0),
    totalCompras: Number(raw.totalCompras || 0),
    ultimaVenta: raw.ultimaVenta || "",
    ultimaCompra: raw.ultimaCompra || "",
    rotacion: Number(raw.rotacion || 0),
    tipoVenta: raw.tipoVenta || (row.unit === 'kg' ? 'peso' : 'pieza'),
    unidad: row.unit || raw.unidad || 'pz',
    unidadMedida: raw.unidadMedida || row.unit || 'pz',
    gramajeBase: Number(raw.gramajeBase || 1000),
    precioPorGramo: Number(raw.precioPorGramo || 0)
  };
}

/**
 * Convierte un producto local al formato para guardar en Supabase.
 */
export function mapLocalProductToDb(p: Product, branch: string = "Norte") {
  return {
    id: String(p.id),
    code: p.code || p.codigo || "",
    barcode: p.barcode || p.codigoBarras || "",
    sku: p.sku || p.codigoInterno || "",
    name: p.name || p.descripcion || "Sin Nombre",
    brand: p.brand || p.marca || "MAZAL",
    category: p.category || p.categoria || "Abarrotes Generales",
    subcategory: p.subcategory || p.subcategoria || "entero",
    unit: p.unit || p.unidad || "pz",
    cost: p.cost ?? p.costo ?? 0,
    price_min: p.priceMin ?? p.precioMenudeo ?? 0,
    price_med: p.priceMed ?? p.precioMedioMayoreo ?? 0,
    price_max: p.priceMax ?? p.precioMayoreo ?? 0,
    price_special: p.priceSpecial ?? p.precioEspecial ?? 0,
    stock: p.stock ?? p.stockDisponible ?? 0,
    stock_min: p.stockMin ?? p.stockMinimo ?? 5,
    stock_max: p.stockMax ?? p.stockMaximo ?? 100,
    location: p.location || p.ubicacion || "Bodega Principal",
    is_compound: Boolean(p.isCompound),
    image_url: p.imageUrl || p.imagen || "",
    supplier_id: p.supplierId || p.proveedorId || "PROV_01",
    sucursal: branch || p.sucursal || "Norte",
    raw_data: p,
    updated_at: new Date().toISOString()
  };
}

/**
 * Carga todo el catálogo y datos desde Supabase.
 */
export async function loadAllFromSupabase(branch: string = "Norte"): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) {
    return { success: false, error: "Supabase no está configurado." };
  }

  const client = getSupabaseClient();

  try {
    const results: any = {};

    // 1. Cargar productos (todos o de la sucursal activa)
    const { data: prodData, error: prodErr } = await client
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (!prodErr && prodData && prodData.length > 0) {
      results.products = prodData.map(mapDbProductToLocal);
    }

    // 2. Cargar clientes
    const { data: custData, error: custErr } = await client
      .from("customers")
      .select("*");
    if (!custErr && custData) {
      results.customers = custData.map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        email: c.email || "",
        address: c.address || "",
        rfc: c.rfc || "",
        role: c.role || "Cliente Normal",
        creditLimit: Number(c.credit_limit || 0),
        creditUsed: Number(c.credit_used || 0),
        creditDays: Number(c.credit_days || 30),
        notes: c.notes || "",
        status: c.status || "Activo",
        ...(c.raw_data || {})
      }));
    }

    // 3. Cargar proveedores
    const { data: suppData, error: suppErr } = await client
      .from("suppliers")
      .select("*");
    if (!suppErr && suppData) {
      results.suppliers = suppData.map((s: any) => ({
        id: s.id,
        name: s.name,
        contact: s.contact || "",
        phone: s.phone || "",
        email: s.email || "",
        address: s.address || "",
        rfc: s.rfc || "",
        outstandingBalance: Number(s.outstanding_balance || 0),
        ...(s.raw_data || {})
      }));
    }

    // 4. Cargar ventas
    const { data: salesData, error: salesErr } = await client
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!salesErr && salesData) {
      results.sales = salesData.map((s: any) => ({
        id: s.id,
        ticketNumber: s.ticket_number,
        total: Number(s.total || 0),
        costTotal: Number(s.cost_total || 0),
        profit: Number(s.profit || 0),
        paymentMethod: s.payment_method,
        customerId: s.customer_id,
        customerName: s.customer_name,
        userId: s.user_id,
        userName: s.user_name,
        date: s.date,
        amountPaid: Number(s.amount_paid || 0),
        change: Number(s.change || 0),
        items: s.items || [],
        ...(s.raw_data || {})
      }));
    }

    // 5. Cargar movimientos de stock
    const { data: movData, error: movErr } = await client
      .from("stock_movements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (!movErr && movData) {
      results.movements = movData.map((m: any) => ({
        id: m.id,
        productId: m.product_id,
        productName: m.product_name,
        type: m.type,
        quantity: Number(m.quantity || 0),
        previousStock: Number(m.previous_stock || 0),
        newStock: Number(m.new_stock || 0),
        date: m.date,
        user: m.user_name,
        notes: m.notes,
        ...(m.raw_data || {})
      }));
    }

    // 6. Cargar sesiones de caja
    const { data: sessData, error: sessErr } = await client
      .from("cash_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!sessErr && sessData) {
      results.cashSessions = sessData.map((cs: any) => ({
        id: cs.id,
        startTime: cs.start_time,
        endTime: cs.end_time,
        openedBy: cs.opened_by,
        initialCash: Number(cs.initial_cash || 0),
        finalCash: cs.final_cash !== null ? Number(cs.final_cash) : undefined,
        status: cs.status,
        salesTotal: Number(cs.sales_total || 0),
        expensesTotal: Number(cs.expenses_total || 0),
        expectedFinalCash: Number(cs.expected_final_cash || 0),
        ...(cs.raw_data || {})
      }));
    }

    // 7. Cargar gastos
    const { data: expData, error: expErr } = await client
      .from("cash_expenses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!expErr && expData) {
      results.expenses = expData.map((e: any) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount || 0),
        category: e.category,
        date: e.date,
        user: e.user_name,
        ...(e.raw_data || {})
      }));
    }

    // 8. Cargar usuarios
    const { data: usersData, error: usersErr } = await client
      .from("users")
      .select("*");
    if (!usersErr && usersData && usersData.length > 0) {
      results.users = usersData.map((u: any) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        password: u.password,
        role: u.role,
        status: u.status,
        lastLogin: u.last_login
      }));
    }

    // 9. Cargar sucursales
    const { data: branchData, error: branchErr } = await client
      .from("branches")
      .select("*");
    if (!branchErr && branchData && branchData.length > 0) {
      results.sucursales = branchData.map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        manager: b.manager,
        status: b.status,
        isCentral: b.is_central
      }));
    }

    // 10. Cargar estado de respaldo (app_state)
    const { data: stateData } = await client
      .from("app_state")
      .select("data")
      .eq("id", `mazal_state_${branch.toLowerCase()}`)
      .maybeSingle();

    if (stateData && stateData.data) {
      const snap = stateData.data;
      if (!results.bankAccounts && snap.bankAccounts) results.bankAccounts = snap.bankAccounts;
      if (!results.costCenters && snap.costCenters) results.costCenters = snap.costCenters;
      if (!results.vehicles && snap.vehicles) results.vehicles = snap.vehicles;
      if (!results.budgets && snap.budgets) results.budgets = snap.budgets;
      if (!results.purchaseOrders && snap.purchaseOrders) results.purchaseOrders = snap.purchaseOrders;
    }

    return { success: true, data: results };
  } catch (err: any) {
    console.warn("Error cargando base de datos desde Supabase:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Sincroniza la base de datos completa hacia Supabase.
 */
export async function syncAllToSupabase(db: any, branch: string = "Norte"): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  syncedTables?: string[];
  totalRecords?: number;
}> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) {
    return { success: false, error: "Supabase no está configurado." };
  }

  const client = getSupabaseClient();
  const syncedTables: string[] = [];
  let totalRecords = 0;

  try {
    // 1. Subir productos en lotes (batch upsert de 100 en 100)
    if (db.products && Array.isArray(db.products) && db.products.length > 0) {
      const batchSize = 100;
      const formatted = db.products.map((p: Product) => mapLocalProductToDb(p, branch));
      for (let i = 0; i < formatted.length; i += batchSize) {
        const chunk = formatted.slice(i, i + batchSize);
        const { error } = await client.from("products").upsert(chunk, { onConflict: "id" });
        if (error) {
          console.warn("Error subiendo lote de productos a Supabase:", error);
        }
      }
      syncedTables.push(`Productos (${db.products.length})`);
      totalRecords += db.products.length;
    }

    // 2. Subir clientes
    if (db.customers && Array.isArray(db.customers) && db.customers.length > 0) {
      const custRows = db.customers.map((c: Customer) => ({
        id: String(c.id),
        name: c.name,
        phone: c.phone || "",
        email: c.email || "",
        address: c.address || "",
        rfc: c.rfc || "",
        role: c.role || "Cliente Normal",
        credit_limit: c.creditLimit || 0,
        credit_used: c.creditUsed || 0,
        credit_days: c.creditDays || 30,
        notes: c.notes || "",
        status: c.status || "Activo",
        raw_data: c,
        updated_at: new Date().toISOString()
      }));
      await client.from("customers").upsert(custRows, { onConflict: "id" });
      syncedTables.push(`Clientes (${db.customers.length})`);
      totalRecords += db.customers.length;
    }

    // 3. Subir proveedores
    if (db.suppliers && Array.isArray(db.suppliers) && db.suppliers.length > 0) {
      const suppRows = db.suppliers.map((s: Supplier) => ({
        id: String(s.id),
        name: s.name,
        contact: s.contact || "",
        phone: s.phone || "",
        email: s.email || "",
        address: s.address || "",
        rfc: s.rfc || "",
        outstanding_balance: s.outstandingBalance || 0,
        raw_data: s,
        updated_at: new Date().toISOString()
      }));
      await client.from("suppliers").upsert(suppRows, { onConflict: "id" });
      syncedTables.push(`Proveedores (${db.suppliers.length})`);
      totalRecords += db.suppliers.length;
    }

    // 4. Subir ventas recientes
    if (db.sales && Array.isArray(db.sales) && db.sales.length > 0) {
      const salesRows = db.sales.slice(-100).map((s: Sale) => ({
        id: String(s.id),
        ticket_number: s.ticketNumber || `TICK-${s.id}`,
        total: s.total || 0,
        cost_total: s.costTotal || 0,
        profit: s.profit || 0,
        payment_method: s.paymentMethod || "Efectivo",
        customer_id: s.customerId || null,
        customer_name: s.customerName || "Público General",
        user_id: s.userId || "USR_01",
        user_name: s.userName || "Cajero",
        date: s.date || new Date().toISOString(),
        amount_paid: s.amountPaid || 0,
        change: s.change || 0,
        sucursal: branch,
        items: s.items || [],
        raw_data: s
      }));
      await client.from("sales").upsert(salesRows, { onConflict: "id" });
      syncedTables.push(`Ventas (${db.sales.length})`);
      totalRecords += db.sales.length;
    }

    // 5. Subir sesiones de caja
    if (db.cashSessions && Array.isArray(db.cashSessions) && db.cashSessions.length > 0) {
      const sessRows = db.cashSessions.map((cs: CashSession) => ({
        id: String(cs.id),
        start_time: cs.startTime,
        end_time: cs.endTime || null,
        opened_by: cs.openedBy || "Admin",
        initial_cash: cs.initialCash || 0,
        final_cash: cs.finalCash !== undefined ? cs.finalCash : null,
        status: cs.status || "Abierta",
        sales_total: cs.salesTotal || 0,
        expenses_total: cs.expensesTotal || 0,
        expected_final_cash: cs.expectedFinalCash || 0,
        sucursal: branch,
        raw_data: cs
      }));
      await client.from("cash_sessions").upsert(sessRows, { onConflict: "id" });
      syncedTables.push(`Sesiones Caja (${db.cashSessions.length})`);
      totalRecords += db.cashSessions.length;
    }

    // 6. Subir movimientos de inventario (Kardex)
    if (db.movements && Array.isArray(db.movements) && db.movements.length > 0) {
      const movRows = db.movements.slice(-100).map((m: StockMovement) => ({
        id: String(m.id),
        product_id: String(m.productId),
        product_name: m.productName || "",
        type: m.type || "AJUSTE",
        quantity: Number(m.quantity || 0),
        previous_stock: Number(m.previousStock || 0),
        new_stock: Number(m.newStock || 0),
        date: m.date || new Date().toISOString(),
        user_name: m.userName || "Admin",
        notes: m.notes || "",
        sucursal: branch,
        raw_data: m
      }));
      await client.from("stock_movements").upsert(movRows, { onConflict: "id" });
      syncedTables.push(`Kardex (${db.movements.length})`);
      totalRecords += db.movements.length;
    }

    // 7. Subir gastos de caja
    if (db.expenses && Array.isArray(db.expenses) && db.expenses.length > 0) {
      const expRows = db.expenses.map((e: CashExpense) => ({
        id: String(e.id),
        description: e.description || "",
        amount: Number(e.amount || 0),
        category: e.category || "General",
        date: e.date || new Date().toISOString(),
        user_name: e.userName || "Admin",
        sucursal: branch,
        raw_data: e
      }));
      await client.from("cash_expenses").upsert(expRows, { onConflict: "id" });
      syncedTables.push(`Gastos (${db.expenses.length})`);
      totalRecords += db.expenses.length;
    }

    // 8. Subir usuarios
    if (db.users && Array.isArray(db.users) && db.users.length > 0) {
      const userRows = db.users.map((u: User) => ({
        id: String(u.id),
        username: (u.username || "").toLowerCase().trim(),
        name: u.name.trim(),
        role: u.role || "Cajero",
        status: u.status || "Activo",
        ...(u.password ? { password: u.password } : {})
      }));
      await client.from("users").upsert(userRows, { onConflict: "username" });
      syncedTables.push(`Usuarios (${db.users.length})`);
      totalRecords += db.users.length;
    }

    // 9. Subir snapshot completo a app_state
    await client.from("app_state").upsert({
      id: `mazal_state_${branch.toLowerCase()}`,
      data: db,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });

    return {
      success: true,
      message: `Sincronización exitosa: ${totalRecords} registros actualizados en Supabase Cloud.`,
      syncedTables,
      totalRecords
    };
  } catch (err: any) {
    console.error("Error sincronizando a Supabase:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Guarda o actualiza un producto directamente en Supabase Cloud.
 */
export async function saveProductToSupabase(product: Product, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = mapLocalProductToDb(product, branch);
    const { error } = await client.from("products").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando producto en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando producto individual en Supabase:", e);
    return false;
  }
}

/**
 * Elimina un producto permanentemente de Supabase Cloud.
 */
export async function deleteProductFromSupabase(productId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("products").delete().eq("id", String(productId));
    if (error) console.warn("Error eliminando producto de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando producto de Supabase:", e);
    return false;
  }
}

/**
 * Guarda o actualiza un cliente directamente en Supabase Cloud.
 */
export async function saveCustomerToSupabase(customer: Customer): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(customer.id),
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      rfc: customer.rfc || "",
      role: customer.role || "Cliente Normal",
      credit_limit: Number(customer.creditLimit || 0),
      credit_used: Number(customer.creditUsed || 0),
      credit_days: Number(customer.creditDays || 30),
      notes: customer.notes || "",
      status: customer.status || "Activo",
      raw_data: customer,
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from("customers").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando cliente en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando cliente en Supabase:", e);
    return false;
  }
}

/**
 * Elimina un cliente permanentemente de Supabase Cloud.
 */
export async function deleteCustomerFromSupabase(customerId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("customers").delete().eq("id", String(customerId));
    if (error) console.warn("Error eliminando cliente de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando cliente de Supabase:", e);
    return false;
  }
}

/**
 * Guarda o actualiza un proveedor directamente en Supabase Cloud.
 */
export async function saveSupplierToSupabase(supplier: Supplier): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(supplier.id),
      name: supplier.name,
      contact: supplier.contact || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      rfc: supplier.rfc || "",
      outstanding_balance: Number(supplier.outstandingBalance || 0),
      raw_data: supplier,
      updated_at: new Date().toISOString()
    };
    const { error } = await client.from("suppliers").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando proveedor en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando proveedor en Supabase:", e);
    return false;
  }
}

/**
 * Elimina un proveedor permanentemente de Supabase Cloud.
 */
export async function deleteSupplierFromSupabase(supplierId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("suppliers").delete().eq("id", String(supplierId));
    if (error) console.warn("Error eliminando proveedor de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando proveedor de Supabase:", e);
    return false;
  }
}

/**
 * Guarda una venta directamente en Supabase.
 */
export async function saveSaleToSupabase(sale: Sale, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(sale.id),
      ticket_number: sale.ticketNumber || `TICK-${sale.id}`,
      total: Number(sale.total || 0),
      cost_total: Number(sale.costTotal || 0),
      profit: Number(sale.profit || 0),
      payment_method: sale.paymentMethod || "Efectivo",
      customer_id: sale.customerId || null,
      customer_name: sale.customerName || "Público General",
      user_id: sale.userId || "USR_01",
      user_name: sale.userName || "Cajero",
      date: sale.date || new Date().toISOString(),
      amount_paid: Number(sale.amountPaid || 0),
      change: Number(sale.change || 0),
      sucursal: branch,
      items: sale.items || [],
      raw_data: sale
    };
    const { error } = await client.from("sales").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando venta en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando venta en Supabase:", e);
    return false;
  }
}

/**
 * Elimina una venta permanentemente de Supabase Cloud.
 */
export async function deleteSaleFromSupabase(saleId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("sales").delete().eq("id", String(saleId));
    if (error) console.warn("Error eliminando venta de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando venta de Supabase:", e);
    return false;
  }
}

/**
 * Registra un movimiento de stock en Supabase.
 */
export async function saveMovementToSupabase(movement: StockMovement, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(movement.id),
      product_id: String(movement.productId),
      product_name: movement.productName || "",
      type: movement.type,
      quantity: Number(movement.quantity || 0),
      previous_stock: Number(movement.previousStock || 0),
      new_stock: Number(movement.newStock || 0),
      date: movement.date || new Date().toISOString(),
      user_name: movement.user || "Admin",
      notes: movement.notes || "",
      sucursal: branch,
      raw_data: movement
    };
    const { error } = await client.from("stock_movements").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando movimiento en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando movimiento en Supabase:", e);
    return false;
  }
}

/**
 * Guarda o actualiza una orden de compra en Supabase.
 */
export async function savePurchaseOrderToSupabase(order: PurchaseOrder, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(order.id),
      supplier_id: order.supplierId || null,
      supplier_name: order.supplierName || "",
      total: Number(order.total || 0),
      status: order.status || "Pendiente",
      date: order.date || new Date().toISOString().split("T")[0],
      received_date: order.receivedDate || null,
      payment_status: order.paymentStatus || "Pendiente",
      sucursal: branch,
      items: order.items || [],
      raw_data: order
    };
    const { error } = await client.from("purchase_orders").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando orden de compra en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando orden de compra en Supabase:", e);
    return false;
  }
}

/**
 * Elimina una orden de compra permanentemente de Supabase.
 */
export async function deletePurchaseOrderFromSupabase(orderId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("purchase_orders").delete().eq("id", String(orderId));
    if (error) console.warn("Error eliminando orden de compra de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando orden de compra de Supabase:", e);
    return false;
  }
}

/**
 * Guarda o actualiza una sesión de caja en Supabase.
 */
export async function saveCashSessionToSupabase(session: CashSession, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(session.id),
      start_time: session.startTime,
      end_time: session.endTime || null,
      opened_by: session.openedBy || "Admin",
      initial_cash: Number(session.initialCash || 0),
      final_cash: session.finalCash !== undefined ? Number(session.finalCash) : null,
      status: session.status || "Abierta",
      sales_total: Number(session.salesTotal || 0),
      expenses_total: Number(session.expensesTotal || 0),
      expected_final_cash: Number(session.expectedFinalCash || 0),
      sucursal: branch,
      raw_data: session
    };
    const { error } = await client.from("cash_sessions").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando sesión de caja en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando sesión de caja en Supabase:", e);
    return false;
  }
}

/**
 * Guarda un gasto en Supabase.
 */
export async function saveExpenseToSupabase(expense: CashExpense, branch: string = "Norte"): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const row = {
      id: String(expense.id),
      description: expense.description || "",
      amount: Number(expense.amount || 0),
      category: expense.category || "General",
      date: expense.date || new Date().toISOString(),
      user_name: expense.user || "Admin",
      sucursal: branch,
      raw_data: expense
    };
    const { error } = await client.from("cash_expenses").upsert(row, { onConflict: "id" });
    if (error) console.warn("Error guardando gasto en Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error guardando gasto en Supabase:", e);
    return false;
  }
}

/**
 * Elimina un gasto permanentemente de Supabase Cloud.
 */
export async function deleteExpenseFromSupabase(expenseId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("cash_expenses").delete().eq("id", String(expenseId));
    if (error) console.warn("Error eliminando gasto de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando gasto de Supabase:", e);
    return false;
  }
}

/**
 * Elimina un movimiento de stock de Supabase Cloud.
 */
export async function deleteMovementFromSupabase(movementId: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from("stock_movements").delete().eq("id", String(movementId));
    if (error) console.warn("Error eliminando movimiento de Supabase:", error);
    return !error;
  } catch (e) {
    console.warn("Error eliminando movimiento de Supabase:", e);
    return false;
  }
}

/**
 * Elimina un registro genérico de cualquier tabla en Supabase.
 */
export async function deleteEntityFromSupabase(table: string, id: string): Promise<boolean> {
  const isConfigured = await ensureSupabaseConfigured();
  if (!isConfigured) return false;

  try {
    const client = getSupabaseClient();
    const { error } = await client.from(table).delete().eq("id", String(id));
    if (error) console.warn(`Error eliminando de ${table} en Supabase:`, error);
    return !error;
  } catch (e) {
    console.warn(`Error eliminando de ${table} en Supabase:`, e);
    return false;
  }
}

/**
 * Escucha cambios en tiempo real desde Supabase mediante canales Realtime.
 */
let realtimeChannel: any = null;

export function initSupabaseRealtime(onTableChange: (table: string, payload: any) => void) {
  if (typeof window === "undefined") return () => {};

  const client = getSupabaseClient();
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel("mazal-db-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public" },
      (payload: any) => {
        console.log("⚡ Supabase Realtime evento recibido:", payload.table, payload.eventType);
        onTableChange(payload.table, payload);
      }
    )
    .subscribe((status: string) => {
      console.log("Supabase Realtime status:", status);
    });

  return () => {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
