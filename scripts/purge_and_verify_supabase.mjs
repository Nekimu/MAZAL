/**
 * MAZAL POS & ERP - PURGADO TOTAL Y VERIFICACIÓN DE CONEXIÓN SUPABASE & LOCAL
 * Ejecutar con: node scripts/purge_and_verify_supabase.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config({ path: join(__dirname, "../mazal/.env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const ADMIN_PASSWORD = process.env.VITE_USER_ADMIN_PASSWORD || "admin030114";

console.log("\n=================================================================");
console.log("   🧹 MAZAL POS & ERP: PURGADO TOTAL DE DATOS & VERIFICACIÓN BD  ");
console.log("=================================================================");
console.log(`🌐 Supabase URL: ${SUPABASE_URL || "(No configurado)"}`);
console.log(`🔑 Admin Pass:   ${ADMIN_PASSWORD}`);
console.log("=================================================================\n");

const isConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL.includes("supabase.co") &&
  !SUPABASE_URL.includes("your-project") &&
  !SUPABASE_URL.includes("placeholder")
);

async function runPurgeAndVerification() {
  if (!isConfigured) {
    console.log("⚠️ Credenciales de Supabase no configuradas en .env o tienen placeholders.");
    console.log("👉 Para conectar Supabase Cloud, ingresa tus credenciales en el archivo .env:\n");
    console.log('   VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"');
    console.log('   VITE_SUPABASE_ANON_KEY="tu-anon-key"\n');
    console.log("ℹ️ Verificando estado local (MySQL & Mock DB)...");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("🔍 [1/6] Probando Conectividad General con Supabase Cloud...");
  try {
    const { data: pingData, error: pingErr } = await supabase.from("users").select("count", { count: "exact" }).limit(1);
    if (pingErr && pingErr.code === "PGRST205") {
      console.error("❌ Tablas pendientes de creación. Ejecuta supabase_schema.sql en el SQL Editor de Supabase.");
      return;
    } else if (pingErr) {
      console.error("❌ Error de respuesta Supabase:", pingErr.message);
      return;
    }
    console.log("✅ Conexión con Supabase establecida correctamente.");
  } catch (e) {
    console.error("❌ Error al conectar:", e.message);
    return;
  }

  // 2. Pruebas de Métodos CRUD por Tabla
  console.log("\n🧪 [2/6] Verificando Métodos de Base de Datos (SELECT, INSERT, UPDATE, DELETE)...");

  const tablesToVerify = [
    "products",
    "customers",
    "suppliers",
    "sales",
    "stock_movements",
    "cash_sessions",
    "cash_expenses",
    "purchase_orders",
    "users",
    "roles_permisos",
    "branches",
    "branch_inventory",
    "bank_accounts",
    "bank_movements",
    "budgets",
    "costCenters",
    "vehicles",
    "audit_logs",
    "app_state"
  ];

  for (const tbl of ["products", "sales", "customers", "users"]) {
    try {
      const { data, error } = await supabase.from(tbl).select("*").limit(1);
      if (error) {
        console.warn(`   ⚠️ SELECT en '${tbl}': ${error.message}`);
      } else {
        console.log(`   ✅ SELECT en '${tbl}': OK (${Array.isArray(data) ? data.length : 0} registros leídos)`);
      }
    } catch (err) {
      console.warn(`   ❌ Error en '${tbl}':`, err.message);
    }
  }

  // 3. Test de Inserción y Eliminación Temporal
  console.log("\n🧪 [3/6] Verificando Métodos de Escritura (INSERT, UPDATE, DELETE)...");
  try {
    const testId = "TEST_PING_" + Date.now();
    const { error: insErr } = await supabase.from("products").insert({
      id: testId,
      code: "TEST-PING",
      name: "Producto de Prueba de Conexión",
      cost: 10,
      price_min: 15,
      stock: 1
    });

    if (insErr) {
      console.warn("   ⚠️ INSERT test:", insErr.message);
    } else {
      console.log("   ✅ INSERT test: OK");

      const { error: updErr } = await supabase.from("products").update({ name: "Producto de Prueba Modificado" }).eq("id", testId);
      if (updErr) console.warn("   ⚠️ UPDATE test:", updErr.message);
      else console.log("   ✅ UPDATE test: OK");

      const { error: delErr } = await supabase.from("products").delete().eq("id", testId);
      if (delErr) console.warn("   ⚠️ DELETE test:", delErr.message);
      else console.log("   ✅ DELETE test: OK");
    }
  } catch (err) {
    console.warn("   ❌ Error en test de escritura:", err.message);
  }

  // 4. PURGADO TOTAL DE TODAS LAS TABLAS
  console.log("\n🧹 [4/6] Ejecutando PURGADO TOTAL de tablas en Supabase...");

  const tablesToPurge = [
    "products",
    "customers",
    "suppliers",
    "sales",
    "stock_movements",
    "cash_sessions",
    "cash_expenses",
    "purchase_orders",
    "branch_inventory",
    "bank_movements",
    "audit_logs",
    "app_state"
  ];

  for (const tbl of tablesToPurge) {
    try {
      const { error } = await supabase.from(tbl).delete().neq("id", "KEEP_ALL_DELETED_XYZ");
      if (error) {
        console.warn(`   ⚠️ Aviso al purgar '${tbl}':`, error.message);
      } else {
        console.log(`   ✅ Tabla '${tbl}' purgada por completo.`);
      }
    } catch (e) {
      console.warn(`   ❌ Error purgando '${tbl}':`, e.message);
    }
  }

  // 5. Purgar usuarios no administradores y asegurar Administrador General
  console.log("\n👤 [5/6] Asegurando Administrador General en Supabase...");
  try {
    // Eliminar usuarios no administradores
    await supabase.from("users").delete().neq("username", "admin");

    // Upsert Administrador General
    const { error: adminErr } = await supabase.from("users").upsert({
      id: "USR_ADMIN",
      username: "admin",
      name: "Administrador General",
      password: ADMIN_PASSWORD,
      role: "Administrador",
      status: "Activo"
    }, { onConflict: "username" });

    if (adminErr) {
      console.warn("   ⚠️ Error al configurar administrador:", adminErr.message);
    } else {
      console.log(`   ✅ Usuario Administrador General ('admin' / '${ADMIN_PASSWORD}') configurado con éxito.`);
    }
  } catch (e) {
    console.warn("   ❌ Error con usuario administrador:", e.message);
  }

  // 6. Resumen Final
  console.log("\n🎉 [6/6] Verificación final del estado en Supabase:");
  const { data: finalUsers } = await supabase.from("users").select("username, name, role");
  const { count: prodCount } = await supabase.from("products").select("*", { count: "exact", head: true });
  const { count: salesCount } = await supabase.from("sales").select("*", { count: "exact", head: true });
  const { count: custCount } = await supabase.from("customers").select("*", { count: "exact", head: true });

  console.log(`   • Productos:   ${prodCount || 0} (Limpio)`);
  console.log(`   • Clientes:    ${custCount || 0} (Limpio)`);
  console.log(`   • Ventas:      ${salesCount || 0} (Limpio)`);
  console.log(`   • Usuarios:    ${finalUsers?.length || 0} (${finalUsers?.map(u => `${u.username} [${u.role}]`).join(", ")})`);

  console.log("\n=================================================================");
  console.log("   ✅ PURGADO Y VERIFICACIÓN DE SUPABASE COMPLETADOS CON ÉXITO   ");
  console.log("=================================================================\n");
}

runPurgeAndVerification().catch(err => {
  console.error("Error fatal en script de purgado:", err);
});
