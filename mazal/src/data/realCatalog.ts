/**
 * MAZAL POS & ERP - Catálogo Limpio Base
 * Todos los datos han sido purgados para inicialización limpia.
 * Únicamente se conservan las credenciales y usuario del Administrador General.
 */
import { Product, Supplier, Customer, User, UserRole } from "../types";

export const REAL_MAZAL_PRODUCTS: Product[] = [];

export const REAL_MAZAL_SUPPLIERS: Supplier[] = [];

export const REAL_MAZAL_CUSTOMERS: Customer[] = [];

export const REAL_MAZAL_USERS: User[] = [
  {
    id: "USER_1",
    username: "admin",
    name: "Administrador General",
    role: UserRole.ADMIN,
    status: "Activo"
  }
];
