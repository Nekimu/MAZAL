/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = "Administrador",
  MANAGER = "Gerente",
  CASHIER = "Cajero",
  WAREHOUSE = "Almacenista",
  PURCHASING = "Compras",
  ACCOUNTANT = "Contabilidad"
}

export interface User {
  id: string;
  username: string;
  name: string;
  password?: string;
  role: UserRole;
  status: "Activo" | "Inactivo";
  lastLogin?: string;
}

export interface AuditLog {
  id: string;
  user: string;
  role: string;
  action: string;
  details: string;
  timestamp: string;
  ip: string;
  branch: string;
}

export interface RolePermissions {
  pos: boolean;
  inventory: boolean;
  customers: boolean;
  purchases: boolean;
  reports: boolean;
  security: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  [UserRole.ADMIN]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true },
  [UserRole.MANAGER]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: false },
  [UserRole.CASHIER]: { pos: true, inventory: false, customers: true, purchases: false, reports: false, security: false },
  [UserRole.WAREHOUSE]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
  [UserRole.PURCHASING]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
  [UserRole.ACCOUNTANT]: { pos: false, inventory: false, customers: true, purchases: true, reports: true, security: false }
};

export function getSavedRolePermissions(): Record<string, RolePermissions> {
  try {
    const saved = localStorage.getItem("mazal_role_permissions");
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed[UserRole.ADMIN] = { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
      return { ...DEFAULT_ROLE_PERMISSIONS, ...parsed };
    }
  } catch (e) {
    console.error("Error reading mazal_role_permissions:", e);
  }
  return DEFAULT_ROLE_PERMISSIONS;
}

export async function fetchRolePermissionsFromDB(): Promise<Record<string, RolePermissions>> {
  return getSavedRolePermissions();
}

export async function saveRolePermissionsToDB(permissions: Record<string, RolePermissions>): Promise<{ success: boolean; message?: string }> {
  permissions[UserRole.ADMIN] = { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
  localStorage.setItem("mazal_role_permissions", JSON.stringify(permissions));
  return { success: true, message: "Permisos guardados exitosamente en el sistema." };
}

export function normalizeUserRole(role: any): UserRole {
  const r = String(role || "").trim().toLowerCase();
  if (r === "admin" || r === "administrador" || r === "administrator" || r.includes("admin")) return UserRole.ADMIN;
  if (r === "gerente" || r === "manager") return UserRole.MANAGER;
  if (r === "cajero" || r === "caja" || r === "cashier" || r === "vendedor") return UserRole.CASHIER;
  if (r === "almacenista" || r === "almacen" || r === "warehouse") return UserRole.WAREHOUSE;
  if (r === "compras" || r === "purchasing") return UserRole.PURCHASING;
  if (r === "contabilidad" || r === "contador" || r === "accountant") return UserRole.ACCOUNTANT;
  return UserRole.ADMIN;
}

export function getRolePermissionsForUser(role: any): RolePermissions {
  const normalized = normalizeUserRole(role);
  if (normalized === UserRole.ADMIN) {
    return { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true };
  }
  const allPerms = getSavedRolePermissions();
  return allPerms[normalized] || allPerms[role] || { pos: false, inventory: false, customers: false, purchases: false, reports: false, security: false };
}
