/**
 * BranchInventoryService.ts
 * Multi-branch inventory consolidation and stock transfer engine.
 * Supports Central Warehouse (Matriz) + Branch Warehouses (Norte, Sur, etc.).
 * Fully powered by Supabase Cloud & Local Storage.
 */

import { Product, StockTransfer } from "../types";
import { getDatabase, saveDatabase, logAction, saveProductToSupabase } from "../data";
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
 * Creates a pending transfer request.
 * Deducts stock from origin immediately and registers the pending dispatch in Supabase.
 */
export async function createPendingStockTransfer(params: InventoryTransferParams): Promise<{ success: boolean; transfer?: StockTransfer; message: string }> {
  const { productCode, productName, fromBranch, toBranch, quantity, userName, userRole, notes } = params;

  if (fromBranch === toBranch) {
    return { success: false, message: "La sucursal de origen y destino no pueden ser la misma." };
  }

  if (quantity <= 0) {
    return { success: false, message: "La cantidad a traspasar debe ser mayor a 0." };
  }

  try {
    const db = getDatabase();
    const products: Product[] = db.products || [];
    const originDoc = products.find((p) => (p.code || p.barcode || p.id).trim() === productCode.trim());

    if (!originDoc) {
      return {
        success: false,
        message: `El producto con código ${productCode} no fue encontrado en el catálogo de ${fromBranch}.`
      };
    }

    if ((originDoc.stock || 0) < quantity) {
      return {
        success: false,
        message: `Stock insuficiente en ${fromBranch}. Stock disponible: ${originDoc.stock || 0}, requerido: ${quantity}.`
      };
    }

    // 1. Restar stock en origen de inmediato
    originDoc.stock = Number(((originDoc.stock || 0) - quantity).toFixed(3));
    originDoc.stockDisponible = (originDoc.stock || 0) - (originDoc.stockReservado || 0);

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

    // 2. Guardar en base de datos local
    db.stockTransfers = [newTransfer, ...(db.stockTransfers || [])];
    await saveDatabase(db);

    // 3. Sincronizar producto descontado en Supabase Cloud
    await saveProductToSupabase(originDoc, fromBranch).catch(() => {});

    // 4. Sincronizar estado global de traspasos en Supabase Cloud
    if (isSupabaseConfigured) {
      try {
        await supabase.from("app_state").upsert({
          id: "mazal_stock_transfers",
          data: db.stockTransfers,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Aviso al guardar traspaso en Supabase app_state:", e);
      }
    }

    // 5. Registrar en bitácora de auditoría
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
 * Confirms physical receipt of a stock transfer, applying stock changes in destination branch in Supabase.
 */
export async function confirmStockTransferReceipt(transfer: StockTransfer, receiverUserName: string, userRole: string): Promise<{ success: boolean; message: string }> {
  if (transfer.status !== "PENDIENTE_RECEPCION") {
    return { success: false, message: "Este traspaso ya no se encuentra en estado pendiente de recepción." };
  }

  const { productCode, productName, fromBranch, toBranch, quantity } = transfer;

  try {
    const db = getDatabase();
    const products: Product[] = db.products || [];

    // 1. Buscar si el producto ya existe en la sucursal de destino
    const isToSur = toBranch.toLowerCase() === "sur";
    let destDoc = products.find((p) => {
      const pBranch = (p.sucursal || "Norte").toLowerCase();
      const matchBranch = isToSur ? pBranch === "sur" : pBranch !== "sur";
      const matchCode = (p.code || p.barcode || p.id).trim() === productCode.trim();
      return matchBranch && matchCode;
    });

    if (destDoc) {
      // Sumar al stock existente en destino
      destDoc.stock = Number(((destDoc.stock || 0) + quantity).toFixed(3));
      destDoc.stockDisponible = (destDoc.stock || 0) - (destDoc.stockReservado || 0);
      destDoc.sucursal = toBranch;
    } else {
      // Si no existía en el catálogo de destino, crear registro para toBranch
      const originDoc = products.find((p) => (p.code || p.barcode || p.id).trim() === productCode.trim());
      destDoc = {
        id: `PROD_${toBranch.toUpperCase()}_${Date.now()}`,
        code: productCode.trim(),
        barcode: originDoc?.barcode || productCode.trim(),
        sku: originDoc?.sku || productCode.trim(),
        name: productName,
        brand: originDoc?.brand || "MAZAL",
        category: originDoc?.category || "General",
        subcategory: originDoc?.subcategory || "",
        unit: (originDoc?.unit as any) || "Pza",
        cost: originDoc?.cost || 0,
        priceMin: originDoc?.priceMin || 0,
        priceMed: originDoc?.priceMed || 0,
        priceMax: originDoc?.priceMax || 0,
        priceSpecial: originDoc?.priceSpecial || 0,
        stock: quantity,
        stockMin: originDoc?.stockMin || 5,
        stockMax: originDoc?.stockMax || 100,
        location: `Sucursal ${toBranch}`,
        isCompound: false,
        imageUrl: originDoc?.imageUrl || "",
        supplierId: originDoc?.supplierId || "SUPP1",
        sucursal: toBranch,
        tipoVenta: originDoc?.tipoVenta || "pieza",
        permiteVentaFraccionada: Boolean(originDoc?.permiteVentaFraccionada),
        gramajeBase: originDoc?.gramajeBase || 0
      };
      db.products.unshift(destDoc);
    }

    // 2. Actualizar estado del traspaso a COMPLETADO
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

    // 3. Sincronizar producto en Supabase Cloud en la sucursal de destino directamente
    if (isSupabaseConfigured) {
      try {
        const { data: dbDestList } = await supabase
          .from("products")
          .select("*")
          .eq("sucursal", toBranch)
          .or(`code.eq.${productCode.trim()},barcode.eq.${productCode.trim()},id.eq.${productCode.trim()}`);

        if (dbDestList && dbDestList.length > 0) {
          const dbDest = dbDestList[0];
          const newStock = Number(((dbDest.stock || 0) + quantity).toFixed(3));
          await supabase
            .from("products")
            .update({ stock: newStock, updated_at: new Date().toISOString() })
            .eq("id", dbDest.id);
        } else {
          // Fetch from origin in Supabase to clone full item
          const { data: dbOrigList } = await supabase
            .from("products")
            .select("*")
            .or(`code.eq.${productCode.trim()},barcode.eq.${productCode.trim()},id.eq.${productCode.trim()}`);

          const dbOrig = dbOrigList && dbOrigList.length > 0 ? dbOrigList[0] : null;

          const newDestId = `PROD_${toBranch.toUpperCase()}_${Date.now()}`;
          const newDestRow = {
            id: newDestId,
            code: productCode.trim(),
            barcode: dbOrig?.barcode || productCode.trim(),
            sku: dbOrig?.sku || productCode.trim(),
            name: productName,
            brand: dbOrig?.brand || "MAZAL",
            category: dbOrig?.category || "General",
            subcategory: dbOrig?.subcategory || "",
            unit: dbOrig?.unit || "pz",
            cost: Number(dbOrig?.cost || 0),
            price_min: Number(dbOrig?.price_min || 0),
            price_med: Number(dbOrig?.price_med || 0),
            price_max: Number(dbOrig?.price_max || 0),
            price_special: Number(dbOrig?.price_special || 0),
            stock: quantity,
            stock_min: Number(dbOrig?.stock_min || 5),
            stock_max: Number(dbOrig?.stock_max || 100),
            location: `Sucursal ${toBranch}`,
            sucursal: toBranch,
            image_url: dbOrig?.image_url || "",
            supplier_id: dbOrig?.supplier_id || "SUPP1",
            updated_at: new Date().toISOString()
          };
          await supabase.from("products").insert(newDestRow);
        }
      } catch (errSup) {
        console.warn("Aviso actualizando destino en Supabase:", errSup);
      }

      // 4. Sincronizar deducción en origen en Supabase Cloud
      try {
        const { data: dbOrigList } = await supabase
          .from("products")
          .select("*")
          .eq("sucursal", fromBranch)
          .or(`code.eq.${productCode.trim()},barcode.eq.${productCode.trim()},id.eq.${productCode.trim()}`);

        if (dbOrigList && dbOrigList.length > 0) {
          const dbOrig = dbOrigList[0];
          const newOriginStock = Math.max(0, Number(((dbOrig.stock || 0) - quantity).toFixed(3)));
          await supabase
            .from("products")
            .update({ stock: newOriginStock, updated_at: new Date().toISOString() })
            .eq("id", dbOrig.id);
        }
      } catch (errOrig) {
        console.warn("Aviso actualizando origen en Supabase:", errOrig);
      }

      // 5. Sincronizar lista global de traspasos en Supabase Cloud
      try {
        await supabase.from("app_state").upsert({
          id: "mazal_stock_transfers",
          data: db.stockTransfers,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Aviso al actualizar traspaso en Supabase app_state:", e);
      }
    }

    // 5. Registrar en bitácora
    await logAction(
      receiverUserName,
      userRole as any,
      "RECEPCION_TRASPASO_CONFIRMADA",
      `Confirmó recepción de ${quantity} ${transfer.unit} de "${productName}". Stock ingresado a sucursal ${toBranch}. Folio: ${transfer.transferCode}`
    );

    return {
      success: true,
      message: `🎉 ¡Traspaso ${transfer.transferCode} confirmado y sincronizado con éxito! El inventario de ${toBranch} sumó +${quantity} ${transfer.unit}.`
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
 * Rejects a pending stock transfer, returning stock to origin branch.
 */
export async function rejectStockTransfer(transfer: StockTransfer, rejectorUserName: string, userRole: string, reason?: string): Promise<{ success: boolean; message: string }> {
  try {
    const db = getDatabase();
    const products: Product[] = db.products || [];
    const originDoc = products.find((p) => (p.code || p.barcode || p.id).trim() === transfer.productCode.trim());

    // 1. Devolver stock a la sucursal de origen
    if (originDoc) {
      originDoc.stock = Number(((originDoc.stock || 0) + transfer.quantity).toFixed(3));
      originDoc.stockDisponible = (originDoc.stock || 0) - (originDoc.stockReservado || 0);
      await saveProductToSupabase(originDoc, transfer.fromBranch).catch(() => {});
    }

    const rejectedTransfer: StockTransfer = {
      ...transfer,
      status: "RECHAZADO",
      notes: `${transfer.notes || ""} | Rechazado por ${rejectorUserName}. Razón: ${reason || "No especificada"}`
    };

    db.stockTransfers = (db.stockTransfers || []).map((t: StockTransfer) => t.id === transfer.id ? rejectedTransfer : t);
    await saveDatabase(db);

    if (isSupabaseConfigured) {
      try {
        await supabase.from("app_state").upsert({
          id: "mazal_stock_transfers",
          data: db.stockTransfers,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Aviso al rechazar traspaso en Supabase app_state:", e);
      }
    }

    await logAction(
      rejectorUserName,
      userRole as any,
      "RECHAZO_TRASPASO",
      `Rechazó el traspaso ${transfer.transferCode} de ${transfer.productName}. Se reincorporaron ${transfer.quantity} ${transfer.unit} al inventario de ${transfer.fromBranch}.`
    );

    return {
      success: true,
      message: `El traspaso ${transfer.transferCode} ha sido rechazado. El stock fue reincorporado a ${transfer.fromBranch}.`
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
