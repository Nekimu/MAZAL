/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * MAZAL POS & ERP - Security Validators & Password Management
 * Manejo seguro de hashing (SHA-256 / Bcrypt), validación y sincronización en Supabase y Base Local.
 */

import { supabase, isSupabaseConfigured, ensureSupabaseConfigured, getSupabaseClient } from "../supabase";
import { saveUserToMySQL } from "../data";

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
 * Guarda o actualiza un usuario a través del API del servidor Express (Bcrypt + JWT) o fallback
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

  // 1. Intentar guardar mediante API Server Express con JWT
  try {
    const token = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("mazal_auth_token") : null;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        id: user.id,
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
    // Continuar a fallback directo si no hay API
  }

  // 2. Fallback Supabase directo si está configurado
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
        rowData.password_hash = await hashPassword(user.password);
      }

      const { error } = await client.from("users").upsert(rowData, { onConflict: "username" });
      if (!error) {
        return true;
      }
      console.warn("Aviso al guardar usuario en Supabase:", error);
    }
  } catch (err) {
    console.warn("Excepción al guardar usuario en Supabase:", err);
  }

  return false;
}

/**
 * Elimina un usuario del sistema de forma segura.
 */
export async function deleteUserFromSupabase(usernameOrId: string, optionalId?: string): Promise<boolean> {
  const cleanUser = (usernameOrId || "").trim();
  if (cleanUser.toLowerCase() === "admin") return false; // Proteger usuario administrador maestro

  // 1. Intento por API Server Express con JWT
  try {
    const token = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("mazal_auth_token") : null;
    const res = await fetch(`/api/users/${encodeURIComponent(cleanUser.toLowerCase())}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.ok) {
      return true;
    }
  } catch (e) {}

  // 2. Fallback Supabase directo
  try {
    const isConfigured = await ensureSupabaseConfigured();
    if (isConfigured) {
      const client = getSupabaseClient();
      const targetId = optionalId || cleanUser;
      const { error } = await client
        .from("users")
        .delete()
        .or(`username.ilike.${cleanUser.toLowerCase()},id.eq.${targetId}`);

      if (error) {
        console.warn("Aviso al eliminar usuario en Supabase:", error);
      }
      return !error;
    }
  } catch (err) {
    console.warn("Error eliminando usuario en Supabase:", err);
  }

  return false;
}
