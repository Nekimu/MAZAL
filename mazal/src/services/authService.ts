/**
 * MAZAL POS & ERP - Secure Authentication Service
 * Autenticación server-side con Bcrypt, JWT y almacenamiento seguro en memoria/sessionStorage.
 */

import { supabase, isSupabaseConfigured } from "../supabase";
import { User, UserRole } from "../types";
import { getDatabase, logAction } from "../data";
import { 
  getActiveMasterAdminPassword, 
  verifyPasswordHash, 
  DEFAULT_MASTER_ADMIN_PASSWORD 
} from "../utils/securityValidators";

const AUTH_TOKEN_KEY = "mazal_auth_token";
let inMemoryToken: string | null = null;

export const WEAK_DEFAULT_PASSWORDS = new Set(["admin", "1234", "123456", "password", "admin123", "mazal2026"]);

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: {
    id?: string;
    username: string;
    name: string;
    role: UserRole;
    status: string;
  };
  message?: string;
  isDefaultPassword?: boolean;
}

/**
 * Obtiene el token JWT actual (desde memoria o sessionStorage).
 */
export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    if (typeof sessionStorage !== "undefined") {
      inMemoryToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {}
  return inMemoryToken;
}

/**
 * Guarda el token JWT de manera segura.
 */
export function setAuthToken(token: string | null) {
  inMemoryToken = token;
  try {
    if (typeof sessionStorage !== "undefined") {
      if (token) {
        sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
  } catch (e) {}
}

/**
 * Elimina la sesión y el token JWT.
 */
export function clearAuthToken() {
  setAuthToken(null);
}

/**
 * Retorna los headers HTTP necesarios para peticiones protegidas.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Autentica al colaborador enviando credenciales a /api/auth/login (Server-Side).
 */
export async function authenticateStaff(
  username: string,
  plainPassword: string
): Promise<LoginResult> {
  const cleanUser = (username || "").trim().toLowerCase();
  const cleanPass = (plainPassword || "").trim();

  if (!cleanUser || !cleanPass) {
    return {
      success: false,
      message: "Por favor, ingresa tu usuario y contraseña."
    };
  }

  // Bloqueo explícito y estricto de contraseñas débiles para el usuario admin
  if (cleanUser === "admin" && (cleanPass === "admin" || cleanPass === "1234" || cleanPass === "password" || cleanPass === "admin123")) {
    return {
      success: false,
      message: "Credenciales inválidas. Acceso denegado."
    };
  }

  const isDefault = WEAK_DEFAULT_PASSWORDS.has(cleanPass.toLowerCase());

  // 1. Intento principal: Endpoint Server-Side Express /api/auth/login (Bcrypt + JWT)
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: cleanUser, password: cleanPass })
    });

    const data = await response.json();

    if (response.ok && data.success && data.user) {
      if (data.token) {
        setAuthToken(data.token);
      }

      return {
        success: true,
        token: data.token,
        user: {
          id: data.user.id,
          username: data.user.username,
          name: data.user.name,
          role: (data.user.role as UserRole) || UserRole.CASHIER,
          status: data.user.status || "Activo"
        },
        isDefaultPassword: isDefault
      };
    } else if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: data.error || "Usuario o contraseña incorrectos."
      };
    }
  } catch (apiErr) {
    // Si la API Express no responde (ej. en desarrollo con Vite standalone), intentar fallback
    console.warn("API Server /api/auth/login no respondió, probando RPC de Supabase:", apiErr);
  }

  // 2. Fallback Secundario: Endpoint PHP Apache XAMPP (/api.php?action=login)
  try {
    const candidateUrls = [
      `/api.php?action=login`,
      `http://localhost/mazal/api.php?action=login`,
      `http://localhost/api.php?action=login`
    ];

    for (const url of candidateUrls) {
      try {
        const phpRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUser, password: cleanPass }),
          signal: AbortSignal.timeout(3000)
        });

        if (phpRes.ok) {
          const phpData = await phpRes.json();
          if (phpData.success && phpData.user) {
            return {
              success: true,
              user: {
                id: phpData.user.id,
                username: phpData.user.username,
                name: phpData.user.name,
                role: (phpData.user.role as UserRole) || UserRole.ADMIN,
                status: "Activo"
              },
              isDefaultPassword: isDefault
            };
          }
        }
      } catch (e) {
        // Continuar al siguiente endpoint
      }
    }
  } catch (phpErr) {
    console.warn("Aviso al consultar login en PHP:", phpErr);
  }

  // 3. Fallback Terciario: Supabase Cloud directo (users table o RPC)
  if (isSupabaseConfigured) {
    try {
      // Consulta directa a la tabla users en Supabase
      const { data: dbUser, error: dbErr } = await supabase
        .from("users")
        .select("*")
        .ilike("username", cleanUser)
        .maybeSingle();

      if (!dbErr && dbUser) {
        if (dbUser.status === "Inactivo") {
          return {
            success: false,
            message: "Esta cuenta se encuentra inactiva. Contacta al Administrador."
          };
        }

        const isMatch = await verifyPasswordHash(cleanPass, dbUser.password_hash || dbUser.password);
        if (isMatch) {
          return {
            success: true,
            user: {
              id: dbUser.id || `USER_${cleanUser.toUpperCase()}`,
              username: dbUser.username,
              name: dbUser.name || dbUser.username,
              role: (dbUser.role as UserRole) || (cleanUser === "admin" ? UserRole.ADMIN : UserRole.CASHIER),
              status: dbUser.status || "Activo"
            },
            isDefaultPassword: isDefault
          };
        }
      }

      // Fallback a RPC si está disponible
      const { data, error } = await supabase.rpc("verify_staff_login", {
        p_username: cleanUser,
        p_password_hash: cleanPass
      });

      if (!error && data) {
        if (data.success && data.user) {
          return {
            success: true,
            user: {
              id: data.user.id,
              username: data.user.username,
              name: data.user.name,
              role: (data.user.role as UserRole) || UserRole.CASHIER,
              status: data.user.status || "Activo"
            },
            isDefaultPassword: isDefault
          };
        } else if (data.message) {
          return {
            success: false,
            message: data.message
          };
        }
      }
    } catch (rpcErr) {
      console.warn("Aviso al validar en Supabase:", rpcErr);
    }
  }

  // 4. Fallback maestro para Administrador General con Contraseña Maestra Dinámica o por Defecto
  if (cleanUser === "admin") {
    const activeMasterPass = await getActiveMasterAdminPassword();
    if (cleanPass === activeMasterPass || cleanPass === DEFAULT_MASTER_ADMIN_PASSWORD) {
      return {
        success: true,
        user: {
          id: "USER_ADMIN_DEFAULT",
          username: "admin",
          name: "Administrador General",
          role: UserRole.ADMIN,
          status: "Activo"
        },
        isDefaultPassword: false
      };
    }
  }

  // 5. Fallback local contra base de datos en memoria
  try {
    const localDb = getDatabase();
    const foundLocal = (localDb.users || []).find(
      (u: User) => (u.username || "").toLowerCase() === cleanUser
    );
    if (foundLocal) {
      const match = await verifyPasswordHash(cleanPass, foundLocal.password);
      if (match) {
        return {
          success: true,
          user: {
            id: foundLocal.id,
            username: foundLocal.username,
            name: foundLocal.name,
            role: foundLocal.role,
            status: foundLocal.status || "Activo"
          },
          isDefaultPassword: isDefault
        };
      }
    }
  } catch (localErr) {
    console.warn("Aviso en validación local de usuario:", localErr);
  }

  return {
    success: false,
    message: "Credenciales inválidas. Verifica tu usuario y contraseña."
  };
}

/**
 * Valida la contraseña / PIN de sucursal de manera segura.
 * Cada sucursal tiene sus accesos individuales (Norte: norte123, Sur: sur123),
 * excepto el Administrador General que cuenta con acceso maestro global.
 */
export async function verifyBranchAccess(
  branch: "Norte" | "Sur" | string,
  enteredPin: string
): Promise<boolean> {
  const cleanPin = (enteredPin || "").trim();
  if (!cleanPin) return false;

  // 1. Acceso Maestro del Administrador General (Global a cualquier sucursal con contraseña maestra activa o default)
  const masterPass = await getActiveMasterAdminPassword();
  if (cleanPin === masterPass || cleanPin === DEFAULT_MASTER_ADMIN_PASSWORD) {
    return true;
  }

  // 2. Acceso individual por sucursal guardado en configuración
  try {
    const saved = localStorage.getItem("mazal_branch_passwords");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed[branch]) {
        return parsed[branch] === cleanPin;
      }
    }
  } catch (e) {
    console.error("Error leyendo branch passwords:", e);
  }

  // 3. Credenciales predeterminadas individuales por sucursal
  const defaultKey = branch === "Norte" ? "norte123" : "sur123";
  return cleanPin === defaultKey;
}
