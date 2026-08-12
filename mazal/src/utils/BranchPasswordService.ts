/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BranchPasswords {
  Norte: string;
  Sur: string;
  Centro?: string;
  Bodega?: string;
  [key: string]: string | undefined;
}

const getEnvBranchPasswords = (): BranchPasswords => ({
  Norte: (typeof import.meta !== "undefined" && import.meta.env?.VITE_BRANCH_PASSWORD_NORTE) || "admin",
  Sur: (typeof import.meta !== "undefined" && import.meta.env?.VITE_BRANCH_PASSWORD_SUR) || "admin",
  Centro: (typeof import.meta !== "undefined" && import.meta.env?.VITE_BRANCH_PASSWORD_CENTRO) || "admin",
  Bodega: (typeof import.meta !== "undefined" && import.meta.env?.VITE_BRANCH_PASSWORD_BODEGA) || "admin",
});

export function getBranchPasswords(): BranchPasswords {
  const envDefaults = getEnvBranchPasswords();
  try {
    const saved = localStorage.getItem("mazal_branch_passwords");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...envDefaults,
        ...parsed,
      };
    }
  } catch (e) {
    console.error("Error reading branch passwords:", e);
  }
  return { ...envDefaults };
}

export function saveBranchPasswords(newPasswords: Partial<BranchPasswords>): BranchPasswords {
  try {
    const current = getBranchPasswords();
    const updated = { ...current, ...newPasswords };
    localStorage.setItem("mazal_branch_passwords", JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("Error saving branch passwords:", e);
    return getBranchPasswords();
  }
}

