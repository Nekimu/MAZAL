/**
 * MAZAL POS & ERP - SCRIPT DE SEMBRADO Y MIGRACIÓN A SUPABASE
 * Ejecución desde la raíz: node scripts/seed_supabase.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Cargar configuración desde variables de entorno (.env)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

console.log("=================================================");
console.log("   MAZAL POS & ERP - MIGRACIÓN A SUPABASE CLOUD  ");
console.log("=================================================");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ERROR: Debes configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env o entorno.");
  console.error("Ejemplo en .env:\nVITE_SUPABASE_URL=https://tu-proyecto.supabase.co\nVITE_SUPABASE_ANON_KEY=tu-anon-key");
  process.exit(1);
}

console.log(`URL: ${SUPABASE_URL}`);
console.log(`Key: ${SUPABASE_KEY.substring(0, 15)}...`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("\n[1/5] Verificando conexión a Supabase...");
  const { data: testData, error: testErr } = await supabase.from("users").select("count", { count: "exact" }).limit(1);
  
  if (testErr && testErr.code === "PGRST205") {
    console.error("\n❌ ERROR: Las tablas aún no han sido creadas en Supabase.");
    console.error("👉 Abre el SQL Editor en tu panel de Supabase.");
    console.error("👉 Pega el contenido de 'supabase_schema.sql' y presiona 'RUN'.");
    process.exit(1);
  } else if (testErr) {
    console.warn("⚠️ Aviso al conectar:", testErr.message);
  } else {
    console.log("✅ Conexión establecida con Supabase.");
  }

  // 2. Cargar catálogo de productos desde realCatalog
  console.log("\n[2/5] Cargando catálogo de productos...");
  const realCatalogPath = join(__dirname, "../mazal/src/data/realCatalog.ts");
  let products = [];
  let customers = [];
  let suppliers = [];
  let users = [];

  if (existsSync(realCatalogPath)) {
    const fileContent = readFileSync(realCatalogPath, "utf-8");
    
    // Extraer JSON de REAL_MAZAL_PRODUCTS
    const prodMatch = fileContent.match(/export const REAL_MAZAL_PRODUCTS: Product\[\] = (\[[\s\S]*?\]);/);
    if (prodMatch) {
      try {
        products = JSON.parse(prodMatch[1]);
        console.log(`📦 Se encontraron ${products.length} productos en el catálogo maestro.`);
      } catch (e) {
        console.warn("Error parseando productos:", e.message);
      }
    }

    // Extraer Clientes
    const custMatch = fileContent.match(/export const REAL_MAZAL_CUSTOMERS: Customer\[\] = (\[[\s\S]*?\]);/);
    if (custMatch) {
      try {
        customers = JSON.parse(custMatch[1]);
        console.log(`👥 Se encontraron ${customers.length} clientes.`);
      } catch (e) {}
    }

    // Extraer Proveedores
    const suppMatch = fileContent.match(/export const REAL_MAZAL_SUPPLIERS: Supplier\[\] = (\[[\s\S]*?\]);/);
    if (suppMatch) {
      try {
        suppliers = JSON.parse(suppMatch[1]);
        console.log(`🚚 Se encontraron ${suppliers.length} proveedores.`);
      } catch (e) {}
    }

    // Extraer Usuarios
    const userMatch = fileContent.match(/export const REAL_MAZAL_USERS: User\[\] = (\[[\s\S]*?\]);/);
    if (userMatch) {
      try {
        users = JSON.parse(userMatch[1]);
        console.log(`👤 Se encontraron ${users.length} usuarios.`);
      } catch (e) {}
    }
  }

  // 3. Subir Usuarios y Permisos
  console.log("\n[3/5] Subiendo Usuarios y Roles...");
  if (users.length > 0) {
    const userRows = users.map(u => ({
      id: String(u.id),
      username: u.username,
      name: u.name,
      password: "", // Sanitizado (migrado a password_hash en base de datos)
      password_hash: null, // Se asigna vía server.js al primer login
      role: u.role || "Cajero",
      status: u.status || "Activo",
      last_login: u.lastLogin || new Date().toISOString()
    }));
    const { error: uErr } = await supabase.from("users").upsert(userRows, { onConflict: "id" });
    if (uErr) console.warn("Error subiendo usuarios:", uErr.message);
    else console.log(`✅ ${users.length} usuarios sincronizados en Supabase.`);
  }

  // 4. Subir Clientes y Proveedores
  console.log("\n[4/5] Subiendo Clientes y Proveedores...");
  if (customers.length > 0) {
    const custRows = customers.map(c => ({
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
      raw_data: c
    }));
    const { error: cErr } = await supabase.from("customers").upsert(custRows, { onConflict: "id" });
    if (cErr) console.warn("Error subiendo clientes:", cErr.message);
    else console.log(`✅ ${customers.length} clientes sincronizados en Supabase.`);
  }

  if (suppliers.length > 0) {
    const suppRows = suppliers.map(s => ({
      id: String(s.id),
      name: s.name,
      contact: s.contact || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      rfc: s.rfc || "",
      outstanding_balance: s.outstandingBalance || 0,
      raw_data: s
    }));
    const { error: sErr } = await supabase.from("suppliers").upsert(suppRows, { onConflict: "id" });
    if (sErr) console.warn("Error subiendo proveedores:", sErr.message);
    else console.log(`✅ ${suppliers.length} proveedores sincronizados en Supabase.`);
  }

  // 5. Subir Productos por lotes
  console.log("\n[5/5] Subiendo Catálogo de Productos a Supabase en lotes...");
  if (products.length > 0) {
    const batchSize = 100;
    let uploaded = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const chunk = products.slice(i, i + batchSize).map(p => ({
        id: String(p.id),
        code: p.code || "",
        barcode: p.barcode || "",
        sku: p.sku || "",
        name: p.name || "Sin Nombre",
        brand: p.brand || "MAZAL",
        category: p.category || "Abarrotes Generales",
        subcategory: p.subcategory || "entero",
        unit: p.unit || "pz",
        cost: Number(p.cost || 0),
        price_min: Number(p.priceMin || 0),
        price_med: Number(p.priceMed || (p.priceMin ? p.priceMin * 1.1 : 0)),
        price_max: Number(p.priceMax || (p.priceMin ? p.priceMin * 1.18 : 0)),
        price_special: Number(p.priceSpecial || (p.priceMin ? p.priceMin * 0.95 : 0)),
        stock: Number(p.stock || 0),
        stock_min: Number(p.stockMin || 5),
        stock_max: Number(p.stockMax || 100),
        location: p.location || "Bodega Principal",
        is_compound: Boolean(p.isCompound),
        image_url: p.imageUrl || "",
        supplier_id: p.supplierId || "PROV_01",
        sucursal: "Norte",
        raw_data: p
      }));

      const { error: pErr } = await supabase.from("products").upsert(chunk, { onConflict: "id" });
      if (pErr) {
        console.error(`❌ Error en lote ${i / batchSize + 1}:`, pErr.message);
      } else {
        uploaded += chunk.length;
        process.stdout.write(`   Sincronizados: ${uploaded} / ${products.length} productos...\r`);
      }
    }
    console.log(`\n🎉 ¡Catálogo completo de ${uploaded} productos subido exitosamente a Supabase!`);
  }

  console.log("\n=================================================");
  console.log("      MIGRACIÓN A SUPABASE COMPLETADA CON ÉXITO   ");
  console.log("=================================================\n");
}

main().catch(err => {
  console.error("Error fatal en migración:", err);
  process.exit(1);
});
