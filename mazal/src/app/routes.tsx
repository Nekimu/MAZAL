/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import POSModule from "../components/POSModule";
import InventoryModule from "../components/InventoryModule";
import CustomersModule from "../components/CustomersModule";
import PurchasesModule from "../components/PurchasesModule";
import FinanceModule from "../components/FinanceModule";
import ReceiptsModule from "../components/ReceiptsModule";
import SecurityModule from "../components/SecurityModule";
import { UserRole } from "../types";

export interface RouteRendererProps {
  activeTab: string;
  db: any;
  currentUser: { name: string; role: any };
  currentBranch: string;
  theme: "light" | "dark";
  cashSessionActive: boolean;
  onOpenCashSession: () => void;
  onNavigateTab: (tabId: string) => void;
  reloadDb: () => void;
}

export const RouteRenderer: React.FC<RouteRendererProps> = ({
  activeTab,
  currentUser,
  currentBranch,
  cashSessionActive,
  onOpenCashSession,
  reloadDb
}) => {
  switch (activeTab) {
    case "pos":
      return (
        <POSModule
          currentUser={currentUser}
          cashSessionActive={cashSessionActive}
          onOpenCashSession={onOpenCashSession}
          onSaleComplete={reloadDb}
        />
      );

    case "inventory":
      return (
        <InventoryModule
          currentUser={currentUser}
          currentBranch={currentBranch || "Norte"}
        />
      );

    case "customers":
      return (
        <CustomersModule
          currentUser={currentUser}
        />
      );

    case "purchases":
      return (
        <PurchasesModule
          currentUser={currentUser}
        />
      );

    case "reports":
      return (
        <FinanceModule
          currentUser={currentUser}
        />
      );

    case "receipts":
      return (
        <ReceiptsModule
          currentUser={currentUser}
        />
      );

    case "security":
      return (
        <SecurityModule
          currentUser={currentUser}
          onChangeRole={(_newRole, _name) => reloadDb()}
        />
      );

    default:
      return null;
  }
};
