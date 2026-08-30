/**
 * Configuración centralizada del sistema MAZAL
 * Modo 100% Local (XAMPP / MySQL / Apache api.php)
 */

export const LOCAL_MODE = true;

// URL base de api.php - configurable y con resolución dinámica en navegador si se sirve relativo
export const LOCAL_API_BASE = "http://localhost/MAZAL/api.php";

// Sucursales activas en el sistema. Actualmente solo Norte ('mazal_bd') está habilitada.
export const ACTIVE_BRANCHES: Array<"Norte" | "Sur"> = ["Norte"];

// Helper para obtener la sucursal por defecto
export const getDefaultBranch = (): "Norte" | "Sur" => {
  return ACTIVE_BRANCHES[0] || "Norte";
};

// Helper para comprobar si una sucursal está activa
export const isBranchActive = (branch: string): boolean => {
  return ACTIVE_BRANCHES.includes(branch as "Norte" | "Sur");
};
