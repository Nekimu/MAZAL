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
  if (PAUSE_ONLINE_SYNC) return false;
  return Boolean(url && key && !url.includes("your-project") && !url.includes("placeholder"));
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
function createSupabaseInstance(url: string, key: string): SupabaseClient {
  if (PAUSE_ONLINE_SYNC) {
    return createSafeDummyClient();
  }
  if (url && key) {
    try {
      return createClient(url, key);
    } catch (e) {
      return createSafeDummyClient();
    }
  }
  return createSafeDummyClient();
}

// Create the safe Supabase client instance (inactivo)
export let supabase: SupabaseClient = createSafeDummyClient();

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

const configListeners: Array<(configured: boolean) => void> = [];

export function onSupabaseConfigChange(listener: (configured: boolean) => void) {
  if (PAUSE_ONLINE_SYNC) return () => {};
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
    isSupabaseConfigured = false;
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
  isSupabaseConfigured = checkIsConfigured(SUPABASE_URL, SUPABASE_ANON_KEY);
  supabase = createSupabaseInstance(SUPABASE_URL, SUPABASE_ANON_KEY);

  return isSupabaseConfigured;
}

// Auto-run runtime check ONLY if online sync is enabled
if (typeof window !== "undefined" && !PAUSE_ONLINE_SYNC) {
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
  if (PAUSE_ONLINE_SYNC) {
    return {
      success: false,
      message: "Modo 100% Local activo (Supabase desactivado por configuración).",
      url: ""
    };
  }

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
      return {
        success: false,
        message: `Error de respuesta Supabase: ${error.message} (${error.code})`,
        url: SUPABASE_URL
      };
    }

    return {
      success: true,
      message: "Conexión a Supabase exitosa.",
      url: SUPABASE_URL,
      tableCount: Array.isArray(data) ? data.length : 1
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Error de red: ${err.message || String(err)}`,
      url: SUPABASE_URL
    };
  }
}
