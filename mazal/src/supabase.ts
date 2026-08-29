/**
 * MAZAL POS & ERP - Supabase Cloud Database Client
 * Permite alojar y consultar la base de datos en línea en Supabase
 * con soporte para tiempo real, entrega dinámica en Railway y contingencia offline.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Read from window.__MAZAL_CONFIG__ (injected by server.js in Railway) or localStorage or Vite env
let storedConfig: any = null;
try {
  const cached = typeof localStorage !== "undefined" ? localStorage.getItem("custom_supabase_config") : null;
  if (cached) {
    storedConfig = JSON.parse(cached);
  }
} catch (e) {
  console.warn("Error leyendo custom_supabase_config:", e);
}

const windowConfig = (typeof window !== "undefined" && (window as any).__MAZAL_CONFIG__) || {};
const metaEnv = (import.meta as any).env || {};

// Todas las llaves de Supabase removidas para operación 100% local en MySQL
const HARDCODED_SUPABASE_URL = "";
const HARDCODED_SUPABASE_ANON_KEY = "";

// Constante para controlar el modo de operación: 100% Localhost MySQL / XAMPP
export const PAUSE_ONLINE_SYNC: boolean = true;

export let SUPABASE_URL: string = "";
export let SUPABASE_ANON_KEY: string = "";

export function checkIsConfigured(url: string, key: string): boolean {
  return false;
}

export let isSupabaseConfigured = false;

// Mock inerte de Supabase para evitar conexiones de red o subscriptions innecesarias
function createSafeDummyClient(): SupabaseClient {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: [], error: null }),
      upsert: () => Promise.resolve({ data: [], error: null }),
      update: () => Promise.resolve({ data: [], error: null }),
      delete: () => Promise.resolve({ data: [], error: null }),
      eq: function() { return this; },
      order: function() { return this; },
      limit: function() { return this; },
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null })
    }),
    channel: () => ({
      on: function() { return this; },
      subscribe: () => ({ unsubscribe: () => {} })
    }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    }
  } as unknown as SupabaseClient;
}

// Create the safe Supabase client instance (inactivo)
export let supabase: SupabaseClient = createSafeDummyClient();

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

const configListeners: Array<(configured: boolean) => void> = [];

export function onSupabaseConfigChange(listener: (configured: boolean) => void) {
  configListeners.push(listener);
  return () => {
    const idx = configListeners.indexOf(listener);
    if (idx >= 0) configListeners.splice(idx, 1);
  };
}

/**
 * Asegura que Supabase esté configurado consultando /api/config en runtime si es necesario.
 */
export async function ensureSupabaseConfigured(): Promise<boolean> {
  if (PAUSE_ONLINE_SYNC) {
    return false;
  }
  if (isSupabaseConfigured && checkIsConfigured(SUPABASE_URL, SUPABASE_ANON_KEY)) {
    return true;
  }

  // Fallback to active constants
  if (!checkIsConfigured(SUPABASE_URL, SUPABASE_ANON_KEY)) {
    SUPABASE_URL = HARDCODED_SUPABASE_URL;
    SUPABASE_ANON_KEY = HARDCODED_SUPABASE_ANON_KEY;
  }
  isSupabaseConfigured = true;
  supabase = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Check window config again
  const windowConf = (typeof window !== "undefined" && (window as any).__MAZAL_CONFIG__) || {};
  if (windowConf.supabaseUrl && windowConf.supabaseAnonKey && checkIsConfigured(windowConf.supabaseUrl, windowConf.supabaseAnonKey)) {
    SUPABASE_URL = windowConf.supabaseUrl;
    SUPABASE_ANON_KEY = windowConf.supabaseAnonKey;
    isSupabaseConfigured = true;
    supabase = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);
    configListeners.forEach((fn) => fn(true));
    return true;
  }

  try {
    const res = await fetch("/api/config");
    const contentType = res.headers.get("content-type") || "";
    if (res.ok && contentType.includes("application/json")) {
      const data = await res.json();
      if (data.supabaseUrl && data.supabaseAnonKey && checkIsConfigured(data.supabaseUrl, data.supabaseAnonKey)) {
        SUPABASE_URL = data.supabaseUrl;
        SUPABASE_ANON_KEY = data.supabaseAnonKey;
        isSupabaseConfigured = true;
        supabase = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);

        try {
          localStorage.setItem("custom_supabase_config", JSON.stringify({
            supabaseUrl: SUPABASE_URL,
            supabaseAnonKey: SUPABASE_ANON_KEY
          }));
        } catch (e) {}

        configListeners.forEach((fn) => fn(true));
        console.log("☁️ Configuración de Supabase obtenida exitosamente desde el servidor.");
        return true;
      }
    }
  } catch (err) {
    // Non-blocking fallback to built-in default config
  }

  return isSupabaseConfigured;
}

// Auto-run runtime check on startup
if (typeof window !== "undefined") {
  ensureSupabaseConfigured().catch(() => {});
}

/**
 * Diagnostic function to test the Supabase connection and return detailed status.
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  url: string;
  tableCount?: number;
}> {
  if (!isSupabaseConfigured) {
    await ensureSupabaseConfigured();
  }

  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: "Credenciales de Supabase no configuradas en el entorno.",
      url: SUPABASE_URL
    };
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
        return {
          success: true,
          message: "Conectado a Supabase (Tablas listas en la nube).",
          url: SUPABASE_URL,
          tableCount: 0
        };
      }
      return {
        success: false,
        message: `Error de respuesta Supabase: ${error.message} (${error.code})`,
        url: SUPABASE_URL
      };
    }

    return {
      success: true,
      message: "Conexión a Supabase exitosa y tablas verificadas en la nube.",
      url: SUPABASE_URL,
      tableCount: Array.isArray(data) ? data.length : 1
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Error de red al conectar con Supabase: ${err.message || String(err)}`,
      url: SUPABASE_URL
    };
  }
}
