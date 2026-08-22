/**
 * BranchInventoryService.ts
 * Multi-branch inventory consolidation and stock transfer engine.
 * Supports Central Warehouse (Matriz) + Branch Warehouses (Norte, Sur, etc.).
 * Fully powered by Supabase Cloud & Local Storage.
 */

import { Product, StockTransfer } from "../types";
import { getDatabase, saveDatabase, logAction } from "../data";
import { supabase, isSupabaseConfigured } from "../supabase";

export interface BranchStockItem {
  code: string;
  id: string;
  name: string;
  category: string;
  brand: string;
  unit: string;
  cost: number;
  priceMin: number;
  tipoVenta?: string;
  permiteVentaFraccionada?: boolean;
  gramajeBase?: number;
  
  // Stock per branch location
  stockMatriz: number;
  stockNorte: number;
  stockSur: number;
  stockTotal: number;

  // Raw product references per branch
  productMatriz?: Product;
  productNorte?: Product;
  productSur?: Product;
}

export interface InventoryTransferParams {
  productCode: string;
  productName: string;
  fromBranch: "Matriz" | "Norte" | "Sur";
  toBranch: "Matriz" | "Norte" | "Sur";
  quantity: number;
  userName: string;
  userRole: string;
  notes?: string;
}

/**
 * Loads consolidated stock across all branches (Matriz, Norte, Sur).
 */
export async function getConsolidatedInventory(): Promise<BranchStockItem[]> {
  const map = new Map<string, BranchStockItem>();
  const db = getDatabase();
  const products: Product[] = db.products || [];

  products.forEach((prod) => {
    const codeKey = (prod.code || prod.barcode || prod.id || "").trim();
    if (!codeKey) return;

    let existing = map.get(codeKey);
    if (!existing) {
      existing = {
        code: codeKey,
        id: prod.id,
        name: prod.name,
        category: prod.category || "General",
        brand: prod.brand || "Generico",
        unit: prod.unit || "Pza",
        cost: prod.cost || 0,
        priceMin: prod.priceMin || 0,
        tipoVenta: prod.tipoVenta,
        permiteVentaFraccionada: prod.permiteVentaFraccionada,
        gramajeBase: prod.gramajeBase,
        stockMatriz: 0,
        stockNorte: 0,
        stockSur: 0,
        stockTotal: 0,
        productMatriz: prod
      };
      map.set(codeKey, existing);
    }

    const branchName = (prod.sucursal || "").toLowerCase();
    if (branchName.includes("sur")) {
      existing.stockSur += prod.stock || 0;
      existing.productSur = prod;
    } else if (branchName.includes("norte")) {
      existing.stockNorte += prod.stock || 0;
      existing.productNorte = prod;
    } else {
      existing.stockMatriz += prod.stock || 0;
    }

    existing.stockTotal = existing.stockMatriz + existing.stockNorte + existing.stockSur;
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Initiates a double-confirmation stock transfer request.
 */
export async function createPendingStockTransfer(params: InventoryTransferParams): Promise<{ success: boolean; transfer?: StockTransfer; message: string }> {
  const { productCode, productName, fromBranch, toBranch, quantity, userName, userRole, notes } = params;

  if (fromBranch === toBranch) {
    return { success: false, message: "La sucursal de origen y destino deben ser distintas." };
  }
  if (!quantity || quantity <= 0) {
    return { success: false, message: "Ingresa una cantidad válida mayor a 0 para transferir." };
  }

  try {
    const db = getDatabase();
    const products: Product[] = db.products || [];
    const originDoc = products.find((p) => (p.code || p.barcode || p.id).trim() === productCode.trim());

    if (!originDoc) {
      return { success: false, message: `El producto "${productName}" no se encontró en el inventario.` };
    }

    if ((originDoc.stock || 0) < quantity) {
      return {
        success: false,
        message: `Stock insuficiente en ${fromBranch}. Stock disponible: ${originDoc.stock || 0}, requerido: ${quantity}.`
      };
    }

    const transferId = "TRF_" + Math.random().toString(36).substring(2, 9).toUpperCase();
    const dateNow = new Date().toISOString().replace("T", " ").substring(0, 19);

    const newTransfer: StockTransfer = {
      id: transferId,
      transferCode: `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      productCode: productCode.trim(),
      productName,
      quantity,
      unit: originDoc.unit || "Pza",
      fromBranch,
      toBranch,
      requestedBy: userName,
      requestDate: dateNow,
      dispatchedBy: userName,
      dispatchDate: dateNow,
      status: "PENDIENTE_RECEPCION",
      confirmedBySender: true,
      confirmedByReceiver: false,
      notes: notes || "Traspaso inter-sucursal despachado y pendiente de verificación en destino"
    };

    // Save to local database
    db.stockTransfers = [newTransfer, ...(db.stockTransfers || [])];
    await saveDatabase(db);

    // Save to Supabase Cloud if configured
    if (isSupabaseConfigured) {
      try {
        await supabase.from("stock_transfers").upsert({
          id: newTransfer.id,
          transfer_code: newTransfer.transferCode,
          product_code: newTransfer.productCode,
          product_name: newTransfer.productName,
          quantity: newTransfer.quantity,
          from_branch: newTransfer.fromBranch,
          to_branch: newTransfer.toBranch,
          status: newTransfer.status,
          raw_data: newTransfer
        });
      } catch (e) {
        console.warn("Aviso al guardar traspaso en Supabase:", e);
      }
    }

    // Log action
    await logAction(
      userName,
      userRole as any,
      "DESPACHO_TRASPASO_PENDIENTE",
      `Solicitó y despachó traspaso de ${quantity} ${newTransfer.unit} de "${productName}" desde ${fromBranch} hacia ${toBranch}. Pendiente confirmación en destino.`
    );

    return {
      success: true,
      transfer: newTransfer,
      message: `¡Traspaso despachado con éxito! Folio: ${newTransfer.transferCode}. Esperando confirmación de recepción en sucursal ${toBranch}.`
    };
  } catch (err) {
    console.error("Error creating pending transfer:", err);
    return {
      success: false,
      message: `Error al crear el traspaso: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Confirms physical receipt of a stock transfer, applying stock changes in both origin and destination.
 */
export async function confirmStockTransferReceipt(transfer: StockTransfer, receiverUserName: string, userRole: string): Promise<{ success: boolean; message: string }> {
  if (transfer.status !== "PENDIENTE_RECEPCION") {
    return { success: false, message: "Este traspaso ya no se encuentra en estado pendiente de recepción." };
  }

  const { productCode, productName, fromBranch, toBranch, quantity } = transfer;

  try {
    const db = getDatabase();
    const products: Product[] = db.products || [];
    const originDoc = products.find((p) => (p.code || p.barcode || p.id).trim() === productCode.trim());

    if (!originDoc) {
      return { success: false, message: `El producto "${productName}" ya no existe en el catálogo.` };
    }

    if ((originDoc.stock || 0) < quantity) {
      return { success: false, message: `El stock bajó durante la espera. Disponible: ${originDoc.stock || 0}, requerido: ${quantity}.` };
    }

    // Deduct stock from origin
    originDoc.stock = Number(((originDoc.stock || 0) - quantity).toFixed(3));
    originDoc.stockDisponible = (originDoc.stock || 0) - (originDoc.stockReservado || 0);

    // Update transfer record status
    const receiveDateStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    const completedTransfer: StockTransfer = {
      ...transfer,
      status: "COMPLETADO",
      confirmedByReceiver: true,
      receivedBy: receiverUserName,
      receiveDate: receiveDateStr
    };

    db.stockTransfers = (db.stockTransfers || []).map((t: StockTransfer) => t.id === transfer.id ? completedTransfer : t);
    await saveDatabase(db);

    // Update Supabase Cloud if configured
    if (isSupabaseConfigured) {
      try {
        await supabase.from("stock_transfers").upsert({
          id: completedTransfer.id,
          status: "COMPLETADO",
          raw_data: completedTransfer
        });
      } catch (e) {
        console.warn("Aviso al actualizar traspaso en Supabase:", e);
      }
    }

    // Log action
    await logAction(
      receiverUserName,
      userRole as any,
      "RECEPCION_TRASPASO_CONFIRMADA",
      `Confirmó recepción de ${quantity} ${transfer.unit} de "${productName}". Stock descontado de ${fromBranch} e incrementado en ${toBranch}. Folio: ${transfer.transferCode}`
    );

    return {
      success: true,
      message: `🎉 ¡Traspaso ${transfer.transferCode} confirmado y sincronizado con éxito! El inventario se actualizó.`
    };
  } catch (err) {
    console.error("Error confirming stock transfer receipt:", err);
    return {
      success: false,
      message: `Error al confirmar la recepción: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Rejects a pending stock transfer.
 */
export async function rejectStockTransfer(transfer: StockTransfer, rejectorUserName: string, userRole: string, reason?: string): Promise<{ success: boolean; message: string }> {
  try {
    const rejectedTransfer: StockTransfer = {
      ...transfer,
      status: "RECHAZADO",
      notes: `${transfer.notes || ""} | Rechazado por ${rejectorUserName}. Razón: ${reason || "No especificada"}`
    };

    const db = getDatabase();
    db.stockTransfers = (db.stockTransfers || []).map((t: StockTransfer) => t.id === transfer.id ? rejectedTransfer : t);
    await saveDatabase(db);

    if (isSupabaseConfigured) {
      try {
        await supabase.from("stock_transfers").upsert({
          id: rejectedTransfer.id,
          status: "RECHAZADO",
          raw_data: rejectedTransfer
        });
      } catch (e) {
        console.warn("Aviso al rechazar traspaso en Supabase:", e);
      }
    }

    await logAction(
      rejectorUserName,
      userRole as any,
      "RECHAZO_TRASPASO",
      `Rechazó el traspaso ${transfer.transferCode} de ${transfer.productName} enviado desde ${transfer.fromBranch}. El inventario se mantuvo intacto.`
    );

    return {
      success: true,
      message: `El traspaso ${transfer.transferCode} ha sido rechazado. Los inventarios no sufrieron modificaciones.`
    };
  } catch (err) {
    console.error("Error rejecting transfer:", err);
    return {
      success: false,
      message: `Error al rechazar traspaso: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Legacy wrapper for immediate transfer fallback.
 */
export async function transferBranchStock(params: InventoryTransferParams): Promise<{ success: boolean; message: string }> {
  const result = await createPendingStockTransfer(params);
  if (!result.success || !result.transfer) {
    return { success: false, message: result.message };
  }
  return await confirmStockTransferReceipt(result.transfer, params.userName, params.userRole);
}
