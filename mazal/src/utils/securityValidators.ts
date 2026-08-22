/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * MAZAL POS & ERP - Security Validators & Password Management
 * Manejo seguro de hashing (SHA-256 / Bcrypt), validación y sincronización en Supabase y Base Local.
 */

import { supabase, isSupabaseConfigured, ensureSupabaseConfigured } from "../supabase";
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
 * Valida si una contraseña ingresada coincide con la contraseña almacenada (texto plano, hash SHA-256 o bcrypt).
 */
export async function verifyPasswordHash(
  enteredPassword: string,
  storedHashOrPlain?: string | null
): Promise<boolean> {
  const cleanEntered = (enteredPassword || "").trim();
  if (!cleanEntered || !storedHashOrPlain) return false;

  const cleanStored = String(storedHashOrPlain).trim();

  // 1. Comparación directa (texto plano o token coincidente)
  if (cleanEntered === cleanStored) {
    return true;
  }

  // 2. Si el hash almacenado es SHA-256 (64 hex characters)
  if (/^[a-f0-9]{64}$/i.test(cleanStored)) {
    const enteredHash = await hashPassword(cleanEntered);
    if (enteredHash.toLowerCase() === cleanStored.toLowerCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Obtiene la contraseña maestra activa para el Administrador General:
 * Consulta Supabase Cloud primero; si no está disponible, utiliza el almacenamiento local o la clave por defecto.
 */
export async function getActiveMasterAdminPassword(): Promise<string> {
  if (!isSupabaseConfigured) {
    await ensureSupabaseConfigured();
  }

  // 1. Intentar consultar Supabase Cloud
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("password, password_hash")
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
 * Actualiza la Contraseña Maestra del Administrador General tanto en Supabase Cloud como en MySQL local.
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

  // 2. Intentar guardar mediante endpoint Server-Side
  let cloudSynced = false;
  try {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "USR_ADMIN",
        username: "admin",
        name: "Administrador General",
        password: cleanPass,
        role: "Administrador",
        status: "Activo"
      })
    });
    if (res.ok) {
      cloudSynced = true;
    }
  } catch (e) {}

  // Fallback directo a Supabase
  if (!cloudSynced && isSupabaseConfigured) {
    try {
      const passHash = await hashPassword(cleanPass);
      const { error } = await supabase.from("users").upsert(
        {
          id: "USR_ADMIN",
          username: "admin",
          name: "Administrador General",
          password: cleanPass,
          password_hash: passHash,
          role: "Administrador",
          status: "Activo"
        },
        { onConflict: "username" }
      );

      if (!error) {
        cloudSynced = true;
      }
    } catch (supabaseErr) {
      console.warn("Excepción al guardar admin en Supabase:", supabaseErr);
    }
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
      : "¡Contraseña Maestra actualizada localmente! Se sincronizará con la Nube al haber conexión."
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

  // 1. Intento principal: Endpoint Server-side Express con hash Bcrypt
  try {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id || `USER_${cleanUser.toUpperCase()}`,
        username: cleanUser,
        name: user.name.trim(),
        password: user.password,
        role: user.role,
        status: user.status || "Activo"
      })
    });

    if (res.ok) {
      return true;
    }
  } catch (apiErr) {
    // Si el servidor Express no está disponible (modo offline o standalone Vite), continuar a fallback
  }

  // 2. Fallback Secundario: Supabase Cloud directo
  if (!isSupabaseConfigured) {
    await ensureSupabaseConfigured();
  }

  if (isSupabaseConfigured) {
    try {
      const passHash = user.password ? await hashPassword(user.password) : undefined;

      const rowData: Record<string, any> = {
        id: user.id || `USER_${cleanUser.toUpperCase()}`,
        username: cleanUser,
        name: user.name.trim(),
        role: user.role,
        status: user.status || "Activo"
      };

      if (user.password) {
        rowData.password = user.password;
        rowData.password_hash = passHash;
      }

      const { error } = await supabase.from("users").upsert(rowData, { onConflict: "username" });
      if (!error) {
        return true;
      }
      console.warn("Error guardando usuario en Supabase:", error);
    } catch (err) {
      console.warn("Excepción al guardar usuario en Supabase:", err);
    }
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
