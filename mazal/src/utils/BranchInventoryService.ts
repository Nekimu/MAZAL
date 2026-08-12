/**
 * BranchInventoryService.ts
 * Multi-branch inventory consolidation and stock transfer engine.
 * Supports Central Warehouse (Matriz) + Branch Warehouses (Norte, Sur, etc.).
 */

import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { firestore } from "../firebase";
import { Product, MovementType } from "../types";
import { getDatabase, saveDatabase, logAction, handleFirestoreError, OperationType } from "../data";

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
 * Helper to resolve collection names for branches
 */
export function getBranchCollectionName(branch: "Matriz" | "Norte" | "Sur"): string {
  if (branch === "Norte") return "products_norte";
  if (branch === "Sur") return "products_sur";
  return "products"; // Matriz / Central
}

/**
 * Loads consolidated stock across all branches (Matriz, Norte, Sur).
 */
export async function getConsolidatedInventory(): Promise<BranchStockItem[]> {
  const map = new Map<string, BranchStockItem>();

  const loadBranch = async (branch: "Matriz" | "Norte" | "Sur") => {
    const colName = getBranchCollectionName(branch);
    try {
      const snap = await getDocs(collection(firestore, colName));
      snap.forEach((d) => {
        const prod = d.data() as Product;
        const codeKey = (prod.code || prod.barcode || prod.id).trim();
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
            stockTotal: 0
          };
          map.set(codeKey, existing);
        }

        if (branch === "Matriz") {
          existing.stockMatriz += prod.stock || 0;
          existing.productMatriz = prod;
        } else if (branch === "Norte") {
          existing.stockNorte += prod.stock || 0;
          existing.productNorte = prod;
        } else if (branch === "Sur") {
          existing.stockSur += prod.stock || 0;
          existing.productSur = prod;
        }

        existing.stockTotal = existing.stockMatriz + existing.stockNorte + existing.stockSur;
      });
    } catch (err) {
      console.warn(`Error loading branch ${branch}:`, err);
    }
  };

  await Promise.all([loadBranch("Matriz"), loadBranch("Norte"), loadBranch("Sur")]);

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

import { StockTransfer } from "../types";

/**
 * Initiates a double-confirmation stock transfer request (Origin dispatches, Destination must confirm receipt).
 */
export async function createPendingStockTransfer(params: InventoryTransferParams): Promise<{ success: boolean; transfer?: StockTransfer; message: string }> {
  const { productCode, productName, fromBranch, toBranch, quantity, userName, userRole, notes } = params;

  if (fromBranch === toBranch) {
    return { success: false, message: "La sucursal de origen y destino deben ser distintas." };
  }
  if (!quantity || quantity <= 0) {
    return { success: false, message: "Ingresa una cantidad válida mayor a 0 para transferir." };
  }

  const fromCol = getBranchCollectionName(fromBranch);

  try {
    // 1. Verify stock availability at origin branch
    const originSnap = await getDocs(collection(firestore, fromCol));
    let originDoc: Product | null = null;

    originSnap.forEach((d) => {
      const p = d.data() as Product;
      if ((p.code || p.barcode || p.id).trim() === productCode.trim()) {
        originDoc = p;
      }
    });

    if (!originDoc) {
      return { success: false, message: `El producto "${productName}" no se encontró en la sucursal ${fromBranch}.` };
    }

    if ((originDoc.stock || 0) < quantity) {
      return {
        success: false,
        message: `Stock insuficiente en ${fromBranch}. Stock disponible: ${originDoc.stock || 0}, requerido: ${quantity}.`
      };
    }

    // 2. Create pending transfer record
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

    // Save transfer document to Firestore
    await setDoc(doc(firestore, "stock_transfers", transferId), newTransfer);

    // Save to local database
    const db = getDatabase();
    db.stockTransfers = [newTransfer, ...(db.stockTransfers || [])];
    await saveDatabase(db);

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
  const fromCol = getBranchCollectionName(fromBranch);
  const toCol = getBranchCollectionName(toBranch);

  try {
    // 1. Fetch origin product document
    const originSnap = await getDocs(collection(firestore, fromCol));
    let originDoc: Product | null = null;
    let originDocId = "";

    originSnap.forEach((d) => {
      const p = d.data() as Product;
      if ((p.code || p.barcode || p.id).trim() === productCode.trim()) {
        originDoc = p;
        originDocId = d.id;
      }
    });

    if (!originDoc) {
      return { success: false, message: `El producto "${productName}" ya no existe en la sucursal de origen (${fromBranch}).` };
    }

    if ((originDoc.stock || 0) < quantity) {
      return { success: false, message: `El stock en ${fromBranch} bajó durante la espera. Disponible: ${originDoc.stock || 0}, requerido: ${quantity}.` };
    }

    // 2. Deduct stock from origin
    const newOriginStock = Number(((originDoc.stock || 0) - quantity).toFixed(3));
    const updatedOriginDoc: Product = {
      ...originDoc,
      stock: newOriginStock,
      stockDisponible: newOriginStock - (originDoc.stockReservado || 0)
    };
    await setDoc(doc(firestore, fromCol, originDocId), updatedOriginDoc);

    // 3. Add stock to destination
    const destSnap = await getDocs(collection(firestore, toCol));
    let destDoc: Product | null = null;
    let destDocId = "";

    destSnap.forEach((d) => {
      const p = d.data() as Product;
      if ((p.code || p.barcode || p.id).trim() === productCode.trim()) {
        destDoc = p;
        destDocId = d.id;
      }
    });

    let newDestStock = quantity;
    let updatedDestDoc: Product;

    if (destDoc) {
      destDocId = destDoc.id;
      newDestStock = Number(((destDoc.stock || 0) + quantity).toFixed(3));
      updatedDestDoc = {
        ...destDoc,
        stock: newDestStock,
        stockDisponible: newDestStock - (destDoc.stockReservado || 0)
      };
    } else {
      const safeId = productCode.replace(/[^a-zA-Z0-9_\-]/g, "_");
      destDocId = `PROD_${safeId || Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      updatedDestDoc = {
        ...originDoc,
        id: destDocId,
        sucursal: toBranch === "Matriz" ? "Matriz Central" : `Sucursal ${toBranch}`,
        stock: quantity,
        stockDisponible: quantity
      };
    }
    await setDoc(doc(firestore, toCol, destDocId), updatedDestDoc);

    // 4. Update transfer record status
    const receiveDateStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    const completedTransfer: StockTransfer = {
      ...transfer,
      status: "COMPLETADO",
      confirmedByReceiver: true,
      receivedBy: receiverUserName,
      receiveDate: receiveDateStr
    };

    await setDoc(doc(firestore, "stock_transfers", transfer.id), completedTransfer);

    // Update local DB
    const db = getDatabase();
    db.stockTransfers = (db.stockTransfers || []).map((t: StockTransfer) => t.id === transfer.id ? completedTransfer : t);
    await saveDatabase(db);

    // Log action
    await logAction(
      receiverUserName,
      userRole as any,
      "RECEPCION_TRASPASO_CONFIRMADA",
      `Confirmó recepción de ${quantity} ${transfer.unit} de "${productName}". Stock descontado de ${fromBranch} e incrementado en ${toBranch}. Folio: ${transfer.transferCode}`
    );

    return {
      success: true,
      message: `🎉 ¡Traspaso ${transfer.transferCode} confirmado y sincronizado con éxito! El inventario de ambas sucursales se actualizó.`
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

    await setDoc(doc(firestore, "stock_transfers", transfer.id), rejectedTransfer);

    const db = getDatabase();
    db.stockTransfers = (db.stockTransfers || []).map((t: StockTransfer) => t.id === transfer.id ? rejectedTransfer : t);
    await saveDatabase(db);

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

