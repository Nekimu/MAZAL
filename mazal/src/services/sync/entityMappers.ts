/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function mapCollectionToSupabaseTable(colName: string): string {
  const cleanCol = colName.replace(/_(norte|sur|centro|bodega)$/i, "");
  const mapping: Record<string, string> = {
    products: "products",
    customers: "customers",
    suppliers: "suppliers",
    sales: "sales",
    movements: "stock_movements",
    stock_movements: "stock_movements",
    movimientos_inventario: "stock_movements",
    cashSessions: "cash_sessions",
    cash_sessions: "cash_sessions",
    expenses: "cash_expenses",
    cashExpenses: "cash_expenses",
    cash_expenses: "cash_expenses",
    purchaseOrders: "purchase_orders",
    purchase_orders: "purchase_orders",
    users: "users",
    branches: "branches",
    sucursales: "branches",
    branch_inventory: "branch_inventory",
    inventario_sucursal: "branch_inventory",
    bankAccounts: "bank_accounts",
    bank_accounts: "bank_accounts",
    bankMovements: "bank_movements",
    bank_movements: "bank_movements",
    budgets: "budgets",
    costCenters: "cost_centers",
    cost_centers: "cost_centers",
    vehicles: "vehicles",
    auditLogs: "audit_logs",
    audit_logs: "audit_logs",
    app_state: "app_state"
  };
  return mapping[cleanCol] || cleanCol;
}

export function formatEntityPayload(type: string, table: string, docId: string, payload: any, branch: string = "Norte"): any {
  const raw = payload || {};

  if (type === "SALE" || table === "sales") {
    return {
      id: String(docId),
      ticket_number: raw.ticketNumber || `TICK-${docId}`,
      total: Number(raw.total || 0),
      cost_total: Number(raw.costTotal || 0),
      profit: Number(raw.profit || 0),
      payment_method: raw.paymentMethod || "Efectivo",
      customer_id: raw.customerId || null,
      customer_name: raw.customerName || "Público General",
      user_id: raw.userId || "USR_01",
      user_name: raw.userName || "Cajero",
      date: raw.date || new Date().toISOString(),
      amount_paid: Number(raw.amountPaid || 0),
      change: Number(raw.change || 0),
      sucursal: branch || raw.sucursal || "Norte",
      items: raw.items || [],
      raw_data: raw
    };
  }

  if (type === "CUSTOMER" || table === "customers") {
    return {
      id: String(docId),
      name: raw.name || "Cliente",
      phone: raw.phone || "",
      email: raw.email || "",
      address: raw.address || "",
      rfc: raw.rfc || "",
      role: raw.role || "Cliente Normal",
      credit_limit: Number(raw.creditLimit || 0),
      credit_used: Number(raw.creditUsed || 0),
      credit_days: Number(raw.creditDays || 30),
      notes: raw.notes || "",
      status: raw.status || "Activo",
      raw_data: raw,
      updated_at: new Date().toISOString()
    };
  }

  if (type === "SUPPLIER" || table === "suppliers") {
    return {
      id: String(docId),
      name: raw.name || "Proveedor",
      contact: raw.contact || "",
      phone: raw.phone || "",
      email: raw.email || "",
      address: raw.address || "",
      rfc: raw.rfc || "",
      outstanding_balance: Number(raw.outstandingBalance || raw.adeudo || 0),
      raw_data: raw,
      updated_at: new Date().toISOString()
    };
  }

  if (type === "EXPENSE" || table === "cash_expenses") {
    return {
      id: String(docId),
      description: raw.description || "Gasto",
      amount: Number(raw.amount || 0),
      category: raw.category || "General",
      date: raw.date || new Date().toISOString(),
      user_name: raw.user || raw.userName || "Admin",
      sucursal: branch || raw.sucursal || "Norte",
      raw_data: raw
    };
  }

  if (type === "PURCHASE" || table === "purchase_orders") {
    return {
      id: String(docId),
      supplier_id: raw.supplierId || null,
      supplier_name: raw.supplierName || "",
      total: Number(raw.total || 0),
      status: raw.status || "Pendiente",
      date: raw.date || new Date().toISOString().split("T")[0],
      received_date: raw.receivedDate || null,
      payment_status: raw.paymentStatus || "Pendiente",
      sucursal: branch || raw.sucursal || "Norte",
      items: raw.items || [],
      raw_data: raw
    };
  }

  if (type === "INVENTORY_MOVEMENT" || table === "stock_movements") {
    return {
      id: String(docId),
      product_id: String(raw.productId || docId),
      product_name: raw.productName || "",
      type: raw.type || "AJUSTE",
      quantity: Number(raw.quantity || 0),
      previous_stock: Number(raw.previousStock || 0),
      new_stock: Number(raw.newStock || 0),
      date: raw.date || new Date().toISOString(),
      user_name: raw.user || raw.userName || "Admin",
      notes: raw.notes || "",
      sucursal: branch || raw.sucursal || "Norte",
      raw_data: raw
    };
  }

  if (type === "CASH_SESSION" || table === "cash_sessions") {
    return {
      id: String(docId),
      start_time: raw.startTime || new Date().toISOString(),
      end_time: raw.endTime || null,
      opened_by: raw.openedBy || "Admin",
      initial_cash: Number(raw.initialCash || 0),
      final_cash: raw.finalCash !== undefined && raw.finalCash !== null ? Number(raw.finalCash) : null,
      status: raw.status || "Abierta",
      sales_total: Number(raw.salesTotal || 0),
      expenses_total: Number(raw.expensesTotal || 0),
      expected_final_cash: Number(raw.expectedFinalCash || 0),
      sucursal: branch || raw.sucursal || "Norte",
      raw_data: raw
    };
  }

  return { id: String(docId), ...raw };
}
