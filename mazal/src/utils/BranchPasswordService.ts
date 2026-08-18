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

const getDefaultBranchPasswords = (): BranchPasswords => ({
  Norte: "norte123",
  Sur: "sur123",
  Centro: "centro123",
  Bodega: "bodega123",
});

export function getBranchPasswords(): BranchPasswords {
  const defaults = getDefaultBranchPasswords();
  try {
    const saved = localStorage.getItem("mazal_branch_passwords");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaults,
        ...parsed,
      };
    }
  } catch (e) {
    console.error("Error reading branch passwords:", e);
  }
  return { ...defaults };
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

