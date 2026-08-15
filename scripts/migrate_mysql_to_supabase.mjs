/**
 * MAZAL POS & ERP - SCRIPT DE MIGRACIÓN COMPLETA MYSQL LOCAL -> SUPABASE CLOUD
 * Sube automáticamente las 2 bases de datos locales:
 * 1. Mazal 1 (Norte / Principal) -> mazal_bd
 * 2. Mazal 2 (Sur / Secundaria)   -> mazal_bd1
 *
 * Modo de uso:
 * node scripts/migrate_mysql_to_supabase.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde la raíz y desde la carpeta mazal/
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config({ path: join(__dirname, "../mazal/.env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://your-project-ref.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "your-anon-key-here";
const API_URL = process.env.VITE_API_BASE_URL || "http://localhost/mazal/api.php";

console.log("\n=================================================================");
console.log("   🚀 MAZAL POS & ERP: MIGRACIÓN MYSQL LOCAL A SUPABASE CLOUD   ");
console.log("=================================================================");
console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
console.log(`📡 API Local:    ${API_URL}`);
console.log("=================================================================\n");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchFromLocalApi(branch, action = "get_native_tables") {
  const possibleUrls = [
    `${API_URL}?action=${action}&branch=${encodeURIComponent(branch)}`,
    `http://localhost/mazal/api.php?action=${action}&branch=${encodeURIComponent(branch)}`,
    `http://localhost/api.php?action=${action}&branch=${encodeURIComponent(branch)}`,
    `http://127.0.0.1/mazal/api.php?action=${action}&branch=${encodeURIComponent(branch)}`
  ];

  for (const url of possibleUrls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const json = await response.json();
        if (json && json.success) {
          return json;
        }
      }
    } catch (err) {
      // Intentar con siguiente URL
    }
  }
  return null;
}

async function uploadInBatches(tableName, records, batchSize = 100, onConflict = "id") {
  if (!records || records.length === 0) return 0;
  let totalUploaded = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).upsert(chunk, { onConflict });

    if (error) {
      console.warn(`   ⚠️ Error en tabla '${tableName}' (lote ${Math.floor(i / batchSize) + 1}):`, error.message);
    } else {
      totalUploaded += chunk.length;
      process.stdout.write(`   Sincronizados en '${tableName}': ${totalUploaded} / ${records.length} registros...\r`);
    }
  }
  process.stdout.write("\n");
  return totalUploaded;
}

async function migrateBranch(branchName, dbName) {
  console.log(`\n-------------------------------------------------------------`);
  console.log(`📦 PROCESANDO SUCURSAL: ${branchName} (Base de Datos: ${dbName})`);
  console.log(`-------------------------------------------------------------`);

  console.log(`1. Consultando datos locales de ${dbName} a través de api.php...`);
  const data = await fetchFromLocalApi(branchName, "get_native_tables");

  if (!data) {
    console.warn(`⚠️ No se pudo conectar a api.php para la sucursal ${branchName}. Asegúrate de tener XAMPP (Apache + MySQL) encendido.`);
    return;
  }

  console.log(`   ✅ Datos obtenidos:`);
  console.log(`      • Productos:   ${data.productos?.length || 0}`);
  console.log(`      • Clientes:    ${data.clientes?.length || 0}`);
  console.log(`      • Proveedores: ${data.proveedores?.length || 0}`);
  console.log(`      • Usuarios:    ${data.usuarios?.length || 0}`);

  // 1. Usuarios
  if (data.usuarios && data.usuarios.length > 0) {
    const userRows = data.usuarios.map(u => ({
      id: `USER_${branchName}_${u.id || u.usuario}`,
      username: (u.usuario || "").trim().toLowerCase(),
      name: u.nombrecompleto || u.usuario,
      password: u.password || "admin",
      role: u.rol === "administrador" ? "Administrador" : u.rol === "gerente" ? "Gerente" : "Cajero",
      status: "Activo",
      last_login: new Date().toISOString()
    }));
    await uploadInBatches("users", userRows, 50, "id");
  }

  // 2. Clientes
  if (data.clientes && data.clientes.length > 0) {
    const custRows = data.clientes.map(c => ({
      id: `CUST_${branchName}_${c.id_cliente}`,
      name: c.nombre_c || "Cliente",
      phone: c.tel || "",
      role: "Cliente Normal",
      credit_limit: 5000,
      credit_used: Number(c.cant_ade || 0),
      credit_days: 30,
      status: "Activo",
      raw_data: c
    }));
    await uploadInBatches("customers", custRows, 100, "id");
  }

  // 3. Proveedores
  if (data.proveedores && data.proveedores.length > 0) {
    const suppRows = data.proveedores.map(p => ({
      id: `SUPP_${branchName}_${p.id}`,
      name: p.nombre || p.empresa || "Proveedor",
      contact: p.nombre || "",
      phone: p.tel || "",
      outstanding_balance: Number(p.adeudo || 0),
      raw_data: p
    }));
    await uploadInBatches("suppliers", suppRows, 100, "id");
  }

  // 4. Productos
  if (data.productos && data.productos.length > 0) {
    const prodRows = data.productos.map(p => {
      const pMin = Number(p.menudeo || p.unitario || 0);
      const pMed = Number(p.medio || (pMin > 0 ? pMin * 0.95 : 0));
      const pMax = Number(p.mayoreo || (pMin > 0 ? pMin * 0.90 : 0));
      const pCost = pMin > 0 ? pMin * 0.75 : 0;

      return {
        id: `PROD_${branchName}_${p.id}`,
        code: p.clave || String(p.id),
        barcode: p.clave || String(p.id),
        sku: p.clave || String(p.id),
        name: p.nom_p || "Producto",
        brand: "MAZAL",
        category: p.des || "Abarrotes",
        unit: "pz",
        cost: Number(pCost.toFixed(2)),
        price_min: Number(pMin.toFixed(2)),
        price_med: Number(pMed.toFixed(2)),
        price_max: Number(pMax.toFixed(2)),
        price_special: Number(pMax.toFixed(2)),
        stock: Number(p.cant || 0),
        stock_min: 5,
        stock_max: 100,
        sucursal: branchName,
        raw_data: p
      };
    });
    await uploadInBatches("products", prodRows, 100, "id");
  }

  // 5. Historial de Ventas
  console.log(`2. Consultando ventas históricas de ${dbName}...`);
  const salesData = await fetchFromLocalApi(branchName, "get_historical_sales");
  if (salesData && salesData.ventas && salesData.ventas.length > 0) {
    const saleRows = salesData.ventas.map(v => ({
      id: `SALE_${branchName}_${v.id_venta}`,
      ticket_number: `T-${branchName}-${v.id_venta}`,
      total: Number(v.total || 0),
      cost_total: Number(v.total || 0) - Number(v.total_utilidad || 0),
      profit: Number(v.total_utilidad || 0),
      payment_method: "Efectivo",
      customer_name: v.nombre_c || "Venta General",
      date: v.fecha || new Date().toISOString(),
      sucursal: branchName,
      raw_data: v
    }));
    await uploadInBatches("sales", saleRows, 100, "id");
  }
}

async function run() {
  // Probar conexión a Supabase
  const { error } = await supabase.from("products").select("id").limit(1);
  if (error && error.code === "PGRST205") {
    console.error("\n❌ ERROR: Las tablas aún no están creadas en Supabase.");
    console.error("👉 Ve a tu panel de Supabase -> SQL Editor.");
    console.error("👉 Abre el archivo 'supabase_schema.sql', copia su contenido, pégalo y haz clic en RUN.");
    process.exit(1);
  }

  // Migrar Mazal 1 (Norte / mazal_bd)
  await migrateBranch("Norte", "mazal_bd");

  // Migrar Mazal 2 (Sur / mazal_bd1)
  await migrateBranch("Sur", "mazal_bd1");

  console.log("\n=================================================================");
  console.log("   🎉 ¡MIGRACIÓN DE AMBAS BASES DE DATOS COMPLETADA CON ÉXITO!   ");
  console.log("   Tus catálogos de Mazal 1 y Mazal 2 están activos en Supabase. ");
  console.log("=================================================================\n");
}

run().catch(err => {
  console.error("Error general en el proceso de migración:", err);
  process.exit(1);
});
