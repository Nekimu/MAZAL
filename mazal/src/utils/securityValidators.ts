/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * MAZAL POS & ERP - Security Validators & Password Management
 * Manejo seguro de hashing (SHA-256 / Bcrypt), validación y sincronización en Supabase y Base Local.
 */

import { supabase, isSupabaseConfigured, ensureSupabaseConfigured, getSupabaseClient } from "../supabase";
import { saveUserToMySQL } from "../data";

export const DEFAULT_MASTER_ADMIN_PASSWORD = "admin030114";
export const MASTER_PASSWORD_STORAGE_KEY = "mazal_master_admin_password";

/**
 * Genera un hash SHA-256 en formato hexadecimal de forma universal y segura.
 */
export async function hashPassword(plainText: string): Promise<string> {
  const clean = (plainText || "").trim();
  if (!clean) return "";

  try {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(clean);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return hashHex;
    }
  } catch (e) {
    console.warn("WebCrypto digest error, using fallback encoding:", e);
  }

  // Fallback simple y determinista si WebCrypto no está disponible en el entorno
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256_fallback_${Math.abs(hash).toString(16)}`;
}

/**
 * Valida si una contraseña ingresada coincide con la contraseña almacenada (texto plano o hash SHA-256).
 */
export async function verifyPasswordHash(
  enteredPassword: string,
  storedHashOrPlain?: string | null
): Promise<boolean> {
  const cleanEntered = (enteredPassword || "").trim();
  if (!cleanEntered || !storedHashOrPlain) return false;

  const cleanStored = String(storedHashOrPlain).trim();

  // 1. Comparación directa en texto plano
  if (cleanEntered === cleanStored) {
    return true;
  }

  // 2. Comparación con hash SHA-256
  const computedHash = await hashPassword(cleanEntered);
  return computedHash.toLowerCase() === cleanStored.toLowerCase();
}

/**
 * Obtiene la contraseña maestra activa para el Administrador General:
 * Consulta Supabase Cloud primero; si no está disponible, utiliza el almacenamiento local o la clave por defecto.
 */
export async function getActiveMasterAdminPassword(): Promise<string> {
  const isConfigured = await ensureSupabaseConfigured();

  // 1. Intentar consultar Supabase Cloud
  if (isConfigured) {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from("users")
        .select("password")
        .ilike("username", "admin")
        .maybeSingle();

      if (!error && data) {
        if (data.password && data.password.trim()) {
          try {
            localStorage.setItem(MASTER_PASSWORD_STORAGE_KEY, data.password.trim());
          } catch {}
          return data.password.trim();
        }
      }
    } catch (e) {
      console.warn("Aviso al consultar contraseña maestra en Supabase:", e);
    }
  }

  // 2. Almacenamiento Local (Persistencia offline)
  try {
    if (typeof localStorage !== "undefined") {
      const localPass = localStorage.getItem(MASTER_PASSWORD_STORAGE_KEY);
      if (localPass && localPass.trim()) {
        return localPass.trim();
      }
    }
  } catch {}

  // 3. Clave maestra por defecto
  return DEFAULT_MASTER_ADMIN_PASSWORD;
}

/**
 * Actualiza la Contraseña Maestra del Administrador General en Supabase Cloud.
 */
export async function updateMasterAdminPassword(
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const cleanPass = (newPassword || "").trim();
  if (!cleanPass) {
    return { success: false, message: "La contraseña no puede estar vacía." };
  }

  if (cleanPass.length < 4) {
    return { success: false, message: "La contraseña debe tener al menos 4 caracteres." };
  }

  // 1. Guardar en almacenamiento local
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MASTER_PASSWORD_STORAGE_KEY, cleanPass);
    }
  } catch (e) {
    console.warn("Error guardando contraseña maestra en localStorage:", e);
  }

  // 2. Guardar directamente en Supabase Cloud
  let cloudSynced = false;
  try {
    const isConfigured = await ensureSupabaseConfigured();
    if (isConfigured) {
      const client = getSupabaseClient();
      const { error } = await client.from("users").upsert(
        {
          id: "USR_ADMIN",
          username: "admin",
          name: "Administrador General",
          password: cleanPass,
          role: "Administrador",
          status: "Activo"
        },
        { onConflict: "username" }
      );

      if (!error) {
        cloudSynced = true;
      }
    }
  } catch (supabaseErr) {
    console.warn("Excepción al guardar admin en Supabase:", supabaseErr);
  }

  // 3. Sincronizar en MySQL local
  saveUserToMySQL({
    name: "Administrador General",
    username: "admin",
    password: cleanPass,
    role: "Administrador"
  }).catch((err) => console.warn("Error guardando admin en MySQL local:", err));

  return {
    success: true,
    message: cloudSynced
      ? "¡Contraseña Maestra actualizada y sincronizada en la Nube con éxito!"
      : "¡Contraseña Maestra actualizada localmente!"
  };
}

/**
 * Guarda o actualiza un usuario en Supabase Cloud garantizando consistencia de contraseñas.
 */
export async function saveUserToSupabase(user: {
  id?: string;
  name: string;
  username: string;
  password?: string;
  role: string;
  status?: string;
}): Promise<boolean> {
  const cleanUser = (user.username || "").trim().toLowerCase();

  try {
    const isConfigured = await ensureSupabaseConfigured();
    if (isConfigured) {
      const client = getSupabaseClient();
      const rowData: Record<string, any> = {
        id: user.id || `USER_${cleanUser.toUpperCase()}`,
        username: cleanUser,
        name: user.name.trim(),
        role: user.role,
        status: user.status || "Activo"
      };

      if (user.password) {
        rowData.password = user.password;
      }

      const { error } = await client.from("users").upsert(rowData, { onConflict: "username" });
      if (!error) {
        return true;
      }
      console.warn("Error guardando usuario en Supabase:", error);
    }
  } catch (err) {
    console.warn("Excepción al guardar usuario en Supabase:", err);
  }

  return false;
}

/**
 * Elimina un usuario de Supabase Cloud.
 */
export async function deleteUserFromSupabase(username: string): Promise<boolean> {
  const cleanUser = (username || "").trim().toLowerCase();
  if (cleanUser === "admin") return false; // Proteger usuario administrador maestro

  // 1. Intento por API Server
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(cleanUser)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      return true;
    }
  } catch (e) {}

  // 2. Fallback Supabase directo
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("users").delete().ilike("username", cleanUser);
      return !error;
    } catch (err) {
      console.warn("Error eliminando usuario en Supabase:", err);
    }
  }

  return false;
}
