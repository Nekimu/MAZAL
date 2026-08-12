/**
 * MAZAL POS & ERP - Supabase Cloud Database Client
 * Permite alojar y consultar la base de datos en línea en Supabase
 * con soporte para tiempo real y contingencia offline.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Read from localStorage to check for dynamic overrides if needed
let storedConfig: any = null;
try {
  const cached = localStorage.getItem("custom_supabase_config");
  if (cached) {
    storedConfig = JSON.parse(cached);
  }
} catch (e) {
  console.warn("Error leyendo custom_supabase_config:", e);
}

const metaEnv = (import.meta as any).env || {};

export const SUPABASE_URL: string =
  storedConfig?.supabaseUrl ||
  metaEnv.VITE_SUPABASE_URL ||
  "";

export const SUPABASE_ANON_KEY: string =
  storedConfig?.supabaseAnonKey ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL.includes("supabase.co") &&
  !SUPABASE_URL.includes("placeholder-project")
);

// Create the Supabase client instance with realtime enabled (or safe placeholder if not configured)
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    })
  : createClient("https://placeholder-project.supabase.co", "placeholder-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

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
    return {
      success: false,
      message: "Credenciales de Supabase no configuradas en el entorno.",
      url: SUPABASE_URL
    };
  }

  try {
    // Try pinging a lightweight table or app_state/products
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (error) {
      // If table doesn't exist yet, but we got a response from PostgREST, connection works!
      if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
        return {
          success: true,
          message: "Conectado a Supabase (Tablas pendientes de creación mediante el script SQL).",
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
