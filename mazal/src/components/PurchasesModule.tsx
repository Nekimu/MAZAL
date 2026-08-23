/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Truck, 
  Search, 
  Plus, 
  FileText, 
  ArrowRightLeft, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  AlertTriangle,
  User,
  X,
  Trash2
} from "lucide-react";
import { Supplier, PurchaseOrder, Product, formatPrice, UserRole } from "../types";
import { 
  getDatabase, 
  saveDatabase, 
  logAction, 
  registerMovement, 
  subscribeToDb,
  saveSupplierToSupabase,
  deleteSupplierFromSupabase,
  savePurchaseOrderToSupabase,
  deletePurchaseOrderFromSupabase,
  saveProductToSupabase,
  saveMovementToSupabase,
  activeBranch
} from "../data";
import { MovementType } from "../types";

interface PurchasesModuleProps {
  currentUser: { name: string; role: string };
}

export default function PurchasesModule({ currentUser }: PurchasesModuleProps) {
  const [db, setDb] = useState(getDatabase());
  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals state
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);

  // New Supplier Form
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    rfc: ""
  });

  // New Order Form
  const [newOrder, setNewOrder] = useState({
    supplierId: "",
    productId: "",
    quantity: 10,
    cost: 0
  });

  // Advanced PO Builder state
  const [poBuilderSupplierId, setPoBuilderSupplierId] = useState("");
  const [poSupplierSearch, setPoSupplierSearch] = useState("");
  const [poProductSearch, setPoProductSearch] = useState("");
  const [poBuilderItems, setPoBuilderItems] = useState<any[]>([]);
  const [poBuilderTempItem, setPoBuilderTempItem] = useState({
    productId: "",
    cost: 0,
    quantity: 1,
    suggestedPrice: 0,
    aplicaIVA: false,
    porcentajeIVA: 16,
    discount: 0,
    expiryDate: "",
    lote: "",
    location: ""
  });

  const triggerReload = () => {
    setDb(getDatabase());
  };

  // Filtered suppliers
  const suppliersList = Array.isArray(db?.suppliers) ? db.suppliers : [];
  const cleanSearch = (searchTerm || "").trim().toLowerCase();
  const filteredSuppliers = suppliersList.filter((s: Supplier) => {
    if (!cleanSearch) return true;
    return (
      (s.name || "").toLowerCase().includes(cleanSearch) ||
      (s.contact || "").toLowerCase().includes(cleanSearch) ||
      (s.rfc || "").toLowerCase().includes(cleanSearch) ||
      (s.email || "").toLowerCase().includes(cleanSearch) ||
      (s.phone || "").toLowerCase().includes(cleanSearch)
    );
  });

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const database = getDatabase();

    const created: Supplier = {
      ...newSupplier,
      id: "SUPP_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      outstandingBalance: 0
    };

    database.suppliers.push(created);
    await saveSupplierToSupabase(created).catch((err) => {
      console.warn("Aviso al guardar proveedor en Supabase:", err);
    });
    saveDatabase(database);
    setDb(database);
    setShowAddSupplierModal(false);

    setNewSupplier({
      name: "",
      contact: "",
      phone: "",
      email: "",
      address: "",
      rfc: ""
    });

    logAction(
      currentUser.name,
      currentUser.role,
      "Proveedor Creado",
      `Registró el proveedor: ${created.name}`
    );
  };

  const handleDeleteSupplier = async (supp: Supplier) => {
    const isAdmin = currentUser?.role === UserRole.ADMIN || String(currentUser?.role || "").toUpperCase().includes("ADMIN");
    if (!isAdmin) {
      alert("🔒 Permiso Denegado: Solo administradores pueden eliminar proveedores.");
      return;
    }
    const debt = Number(supp.outstandingBalance) || 0;
    if (debt > 0) {
      alert(`⚠️ No es posible eliminar al proveedor "${supp.name}" porque tiene cuentas por pagar pendientes de $${formatPrice(debt)} MXN.`);
      return;
    }
    if (!window.confirm(`¿Deseas eliminar permanentemente al proveedor "${supp.name}"?\n\nEsta acción lo eliminará tanto del sistema local como de Supabase Cloud.`)) return;

    await deleteSupplierFromSupabase(supp.id).catch((err) => {
      console.warn("Aviso al eliminar proveedor de Supabase:", err);
    });
    const database = getDatabase();
    database.suppliers = (database.suppliers || []).filter((s: Supplier) => s.id !== supp.id);
    saveDatabase(database);
    setDb(database);
    logAction(currentUser.name, currentUser.role, "Proveedor Eliminado", `Eliminó el proveedor: ${supp.name}`);
  };

  const handleDeleteOrder = async (order: PurchaseOrder) => {
    const isAdmin = currentUser?.role === UserRole.ADMIN || String(currentUser?.role || "").toUpperCase().includes("ADMIN");
    if (!isAdmin) {
      alert("🔒 Permiso Denegado: Solo administradores pueden eliminar órdenes de compra.");
      return;
    }
    if (!window.confirm(`¿Deseas eliminar permanentemente la orden de compra "${order.id}"?\n\nEsta acción la eliminará de Supabase Cloud.`)) return;

    await deletePurchaseOrderFromSupabase(order.id).catch((err) => {
      console.warn("Aviso al eliminar orden de compra de Supabase:", err);
    });
    const database = getDatabase();
    database.purchaseOrders = (database.purchaseOrders || []).filter((o: PurchaseOrder) => o.id !== order.id);
    saveDatabase(database);
    setDb(database);
    logAction(currentUser.name, currentUser.role, "Orden de Compra Eliminada", `Eliminó la orden: ${order.id}`);
  };

  const handleAddBuilderItem = () => {
    if (!poBuilderTempItem.productId) {
      alert("Por favor selecciona un producto.");
      return;
    }
    const prod = db.products.find((p: Product) => p.id === poBuilderTempItem.productId);
    if (!prod) return;

    if (poBuilderItems.some(item => item.productId === prod.id)) {
      alert("Este producto ya está en la lista de compras de esta orden.");
      return;
    }

    const newItem = {
      productId: prod.id,
      productName: prod.name,
      cost: poBuilderTempItem.cost || prod.cost || 0,
      quantity: poBuilderTempItem.quantity || 1,
      suggestedPrice: poBuilderTempItem.suggestedPrice || prod.priceMin || 0,
      aplicaIVA: poBuilderTempItem.aplicaIVA,
      porcentajeIVA: poBuilderTempItem.porcentajeIVA || 16,
      discount: poBuilderTempItem.discount || 0,
      expiryDate: poBuilderTempItem.expiryDate || "",
      lote: poBuilderTempItem.lote || "",
      location: poBuilderTempItem.location || ""
    };

    setPoBuilderItems([...poBuilderItems, newItem]);
    
    // Reset temp item
    setPoBuilderTempItem({
      productId: "",
      cost: 0,
      quantity: 1,
      suggestedPrice: 0,
      aplicaIVA: false,
      porcentajeIVA: 16,
      discount: 0,
      expiryDate: "",
      lote: "",
      location: ""
    });
  };

  const handleRemoveBuilderItem = (productId: string) => {
    setPoBuilderItems(poBuilderItems.filter(x => x.productId !== productId));
  };

  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poBuilderSupplierId || poBuilderItems.length === 0) {
      alert("Por favor selecciona un proveedor y agrega al menos un producto a la orden.");
      return;
    }

    const database = getDatabase();
    const supp = database.suppliers.find((s: Supplier) => s.id === poBuilderSupplierId);
    if (!supp) return;

    // Calculate sum of all items
    let grandTotal = 0;
    const finalItems = poBuilderItems.map((item) => {
      const itemSubtotal = item.cost * item.quantity;
      const itemBeforeTax = Math.max(0, itemSubtotal - (item.discount || 0));
      const itemTax = item.aplicaIVA ? (itemBeforeTax * ((item.porcentajeIVA || 16) / 100)) : 0;
      const itemTotal = itemBeforeTax + itemTax;
      grandTotal += itemTotal;

      return {
        productId: item.productId,
        productName: item.productName,
        cost: item.cost,
        quantity: item.quantity,
        expiryDate: item.expiryDate || "",
        suggestedPrice: item.suggestedPrice || 0,
        aplicaIVA: item.aplicaIVA,
        porcentajeIVA: item.porcentajeIVA || 16,
        discount: item.discount || 0,
        lote: item.lote || "",
        location: item.location || "",
        received: false
      };
    });

    const createdOrder: PurchaseOrder = {
      id: "PO-" + Math.floor(100 + Math.random() * 900),
      supplierId: supp.id,
      supplierName: supp.name,
      items: finalItems,
      total: parseFloat(grandTotal.toFixed(2)),
      status: "Pendiente",
      date: new Date().toISOString().split("T")[0],
      paymentStatus: "Pendiente"
    };

    database.purchaseOrders.unshift(createdOrder);
    await savePurchaseOrderToSupabase(createdOrder, activeBranch || "Norte").catch((err) => {
      console.warn("Aviso al guardar orden de compra en Supabase:", err);
    });
    saveDatabase(database);
    setDb(database);
    
    // Clear Builder state
    setPoBuilderSupplierId("");
    setPoBuilderItems([]);
    setPoBuilderTempItem({
      productId: "",
      cost: 0,
      quantity: 1,
      suggestedPrice: 0,
      aplicaIVA: false,
      porcentajeIVA: 16,
      discount: 0,
      expiryDate: "",
      lote: "",
      location: ""
    });
    
    setShowAddOrderModal(false);

    logAction(
      currentUser.name,
      currentUser.role,
      "Orden de Compra Creada",
      `Generó la orden: ${createdOrder.id} para ${supp.name} por $${createdOrder.total.toFixed(2)} MXN`
    );
  };

  const handleReceiveOrder = async (order: PurchaseOrder) => {
    if (order.status === "Recibida") {
      alert("Esta orden ya ha sido recibida y procesada previamente.");
      return;
    }

    const database = getDatabase();
    const orderIndex = database.purchaseOrders.findIndex((o: PurchaseOrder) => o.id === order.id);
    if (orderIndex === -1) return;

    const currentBranch = activeBranch || "Norte";

    // Update stocks and logs for all products
    order.items.forEach((item) => {
      const prodIndex = database.products.findIndex((p: Product) => p.id === item.productId);
      if (prodIndex !== -1) {
        const prod = database.products[prodIndex];
        const prevStock = prod.stock;
        const newStock = prevStock + item.quantity;
        
        // Update product data
        database.products[prodIndex].stock = newStock;
        database.products[prodIndex].cost = item.cost;
        database.products[prodIndex].costo = item.cost;
        database.products[prodIndex].ultimoCosto = item.cost;
        if (item.suggestedPrice > 0) {
          database.products[prodIndex].priceMin = item.suggestedPrice;
          database.products[prodIndex].precioMenudeo = item.suggestedPrice;
        }
        if (item.expiryDate) {
          database.products[prodIndex].expiryDate = item.expiryDate;
          database.products[prodIndex].fechaCaducidad = item.expiryDate;
        }
        if (item.lote) {
          database.products[prodIndex].lote = item.lote;
        }
        if (item.location) {
          database.products[prodIndex].location = item.location;
          database.products[prodIndex].ubicacion = item.location;
        }

        // Record stock movement log
        const mov: any = {
          id: "MOV_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
          productId: prod.id,
          productName: prod.name,
          type: MovementType.ENTRY_PURCHASE,
          quantity: item.quantity,
          previousStock: prevStock,
          newStock: newStock,
          date: new Date().toISOString().replace("T", " ").substring(0, 19),
          user: currentUser.name,
          notes: `Ingreso por Recepción de Orden de Compra ${order.id}`
        };
        database.movements.unshift(mov);

        saveProductToSupabase(database.products[prodIndex], currentBranch).catch(() => {});
        saveMovementToSupabase(mov, currentBranch).catch(() => {});
      }
    });

    // Update Order details
    database.purchaseOrders[orderIndex].status = "Recibida";
    database.purchaseOrders[orderIndex].receivedDate = new Date().toISOString().split("T")[0];
    
    // Add amount to outstanding supplier balance
    const suppIndex = database.suppliers.findIndex((s: Supplier) => s.id === order.supplierId);
    if (suppIndex !== -1) {
      database.suppliers[suppIndex].outstandingBalance += order.total;
      await saveSupplierToSupabase(database.suppliers[suppIndex]).catch(() => {});
    }

    await savePurchaseOrderToSupabase(database.purchaseOrders[orderIndex], currentBranch).catch(() => {});
    saveDatabase(database);
    setDb(database);

    logAction(
      currentUser.name,
      currentUser.role,
      "Mercancía Recibida",
      `Recibió OC ${order.id} de ${order.supplierName}. Stock e inventario actualizados automáticamente.`
    );
  };

  return (
    <div className="space-y-6" id="purchases-module-container">
      
      {/* Overview stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Proveedores Activos</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">{(db.suppliers || []).length}</h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Cuentas por Pagar (Prov)</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              ${(db.suppliers || []).reduce((sum: number, s: Supplier) => sum + (Number(s?.outstandingBalance) || 0), 0).toLocaleString()} MXN
            </h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-slate-850 text-amber-600 dark:text-amber-400">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">OC Pendientes Recepción</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              {(db.purchaseOrders || []).filter((o: PurchaseOrder) => o.status === "Pendiente").length} Ordenes
            </h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-teal-50 dark:bg-slate-850 text-teal-600 dark:text-teal-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Total Compras del Mes</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              ${(db.purchaseOrders || []).filter((o: PurchaseOrder) => o.status === "Recibida").reduce((sum: number, o: PurchaseOrder) => sum + (Number(o?.total) || 0), 0).toLocaleString()} MXN
            </h4>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT TWO-THIRDS: Suppliers Registry & Purchase Orders */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Suppliers Table section */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-150 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-gray-800 dark:text-slate-100">Directorio de Proveedores</h3>
              </div>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs rounded-lg border border-gray-200 p-2 bg-white dark:bg-slate-850 dark:text-white"
                />
                <button
                  onClick={() => setShowAddSupplierModal(true)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" /> Proveedor
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-850 border-b border-gray-150 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                    <th className="p-2.5">Proveedor</th>
                    <th className="p-2.5">RFC</th>
                    <th className="p-2.5">Contacto</th>
                    <th className="p-2.5">Cuentas por Pagar</th>
                    <th className="p-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {filteredSuppliers.map((supp) => (
                    <tr key={supp.id} className="hover:bg-gray-50/50">
                      <td className="p-2.5 font-bold text-gray-800 dark:text-slate-200">
                        {supp.name}
                        <p className="text-[10px] text-gray-400 font-normal mt-0.5">{supp.email} | {supp.phone}</p>
                      </td>
                      <td className="p-2.5 font-mono">{supp.rfc || "XAXX010101000"}</td>
                      <td className="p-2.5">{supp.contact}</td>
                      <td className="p-2.5 font-mono font-bold text-red-600">
                        ${(Number(supp.outstandingBalance) || 0).toFixed(2)} MXN
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleDeleteSupplier(supp)}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors"
                          title="Eliminar proveedor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Purchase Orders List Section */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-150 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800 mb-4">
              <h3 className="font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" /> Órdenes de Suministro / Recepción
              </h3>
              <button
                onClick={() => setShowAddOrderModal(true)}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                id="create-order-btn"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva Orden
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-850 border-b border-gray-150 text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                    <th className="p-3">Folio</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3">Detalle Compra</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3">Estatus</th>
                    <th className="p-3 text-center">Recepción</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(db.purchaseOrders || []).map((order: PurchaseOrder) => {
                    const isPending = order.status === "Pendiente";
                    return (
                      <tr key={order.id} className="hover:bg-gray-50/50">
                        <td className="p-3 font-mono font-bold text-gray-800 dark:text-slate-200">{order.id}</td>
                        <td className="p-3">{order.date}</td>
                        <td className="p-3 font-medium">{order.supplierName}</td>
                        <td className="p-3">
                          {(order.items || []).map((i, idx) => (
                            <p key={idx} className="text-[10px] text-gray-500">
                              {i.quantity}x {i.productName} (${formatPrice(i.cost)} cost)
                            </p>
                          ))}
                        </td>
                        <td className="p-3 font-mono font-bold">${(Number(order.total) || 0).toFixed(2)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-max ${
                            isPending 
                              ? "bg-amber-100 text-amber-800 border border-amber-200" 
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            {isPending ? <Clock className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                            {order.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isPending ? (
                            <button
                              onClick={() => handleReceiveOrder(order)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded shadow-xs"
                              id={`receive-btn-${order.id}`}
                            >
                              Recibir Stock
                            </button>
                          ) : (
                            <span className="text-gray-400 font-mono text-[10px]">Recibida: {order.receivedDate}</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteOrder(order)}
                            className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors"
                            title="Eliminar orden"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT ONE-THIRD: Fast Pricing adjust simulator */}
        <div className="space-y-6">
          
          <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
            <h3 className="font-extrabold text-sm flex items-center gap-2 text-gray-800 dark:text-slate-100">
              <ArrowRightLeft className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Simulador de Precios Dinámicos
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Ajusta los precios automáticamente de acuerdo al último costo o fluctuaciones del mercado aplicando márgenes sugeridos:
            </p>

            <div className="space-y-2.5 text-xs bg-gray-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-gray-100 dark:border-slate-850">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 dark:text-slate-400">Margen Lácteos Sugerido:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">25%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 dark:text-slate-400">Margen Bebidas Sugerido:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">35%</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 dark:text-slate-400">Margen Abarrotes Sugerido:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">30%</span>
              </div>
              
              <div className="pt-2 border-t border-gray-100 dark:border-slate-850 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Simulaciones masivas se despliegan en el Almacén.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* --- ADD SUPPLIER MODAL --- */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">Añadir Proveedor Comercial</h3>
              <button onClick={() => setShowAddSupplierModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Razón Social</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora Gamesa S.A."
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre Contacto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Lic. Samuel Corona"
                  value={newSupplier.contact}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact: e.target.value })}
                  className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej. 800-222"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                    className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">RFC</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={newSupplier.rfc}
                    onChange={(e) => setNewSupplier({ ...newSupplier, rfc: e.target.value })}
                    className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2 border text-gray-600 rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD ORDER MODAL --- */}
      {showAddOrderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-gray-250 dark:border-slate-850 flex flex-col max-h-[92vh] overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-emerald-600" /> Constructor de Orden de Suministro Inteligente
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">Diseña, cotiza y gestiona las adquisiciones y recepciones de inventario.</p>
              </div>
              <button onClick={() => setShowAddOrderModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content (Two Column Layout) */}
            <div className="flex-1 overflow-y-auto py-4 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
              
              {/* Left Column: Input Fields (Add products to order) */}
              <div className="lg:col-span-5 border-r border-gray-100 dark:border-slate-800 lg:pr-6 space-y-4">
                
                {/* 1. Supplier selection */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-400 block mb-1">1. Proveedor Comercial</label>
                  
                  {/* Supplier search bar */}
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder="🔍 Buscar proveedor por nombre..."
                      value={poSupplierSearch}
                      onChange={(e) => setPoSupplierSearch(e.target.value)}
                      className="w-full text-xs rounded-lg border p-2 bg-slate-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      disabled={poBuilderItems.length > 0}
                    />
                  </div>

                  <select
                    required
                    disabled={poBuilderItems.length > 0}
                    value={poBuilderSupplierId}
                    onChange={(e) => setPoBuilderSupplierId(e.target.value)}
                    className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Selecciona el Proveedor --</option>
                    {(db.suppliers || [])
                      .filter((s: Supplier) => {
                        const sSearch = (poSupplierSearch || "").trim().toLowerCase();
                        if (!sSearch) return true;
                        return (
                          (s.name || "").toLowerCase().includes(sSearch) ||
                          (s.contact || "").toLowerCase().includes(sSearch) ||
                          (s.rfc || "").toLowerCase().includes(sSearch)
                        );
                      })
                      .map((s: Supplier) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.contact || "S/N"})
                        </option>
                      ))}
                  </select>
                  {poBuilderItems.length > 0 && (
                    <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                      * El proveedor se bloquea para mantener consistencia con los productos agregados.
                    </p>
                  )}
                </div>

                {/* 2. Item configuration form */}
                <div className="border border-gray-100 dark:border-slate-800 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-950/10 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block pb-1 border-b border-gray-100 dark:border-slate-800">
                    2. Configurar Producto
                  </span>

                  {/* Select product */}
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Producto</label>
                    
                    {/* Product search bar */}
                    <div className="mb-2">
                      <input
                        type="text"
                        placeholder="🔍 Buscar producto por nombre, marca o referencia..."
                        value={poProductSearch}
                        onChange={(e) => setPoProductSearch(e.target.value)}
                        className="w-full text-xs rounded-lg border p-2 bg-slate-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <select
                      value={poBuilderTempItem.productId}
                      onChange={(e) => {
                        const pId = e.target.value;
                        const prod = (db.products || []).find((x: Product) => x.id === pId);
                        setPoBuilderTempItem({
                          ...poBuilderTempItem,
                          productId: pId,
                          cost: prod ? prod.cost : 0,
                          suggestedPrice: prod ? prod.priceMin : 0,
                          aplicaIVA: prod ? (prod.aplicaIVA ?? false) : false,
                          porcentajeIVA: prod ? (prod.porcentajeIVA ?? 16) : 16,
                          location: prod ? (prod.location ?? "") : ""
                        });
                      }}
                      className="w-full text-xs rounded-lg border p-2.5 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700"
                    >
                      <option value="">-- Elige un Producto --</option>
                      {(db.products || [])
                        .filter((p: Product) => {
                          const pSearch = (poProductSearch || "").trim().toLowerCase();
                          if (!pSearch) return true;
                          return (
                            (p.name || "").toLowerCase().includes(pSearch) ||
                            (p.code || "").toLowerCase().includes(pSearch) ||
                            (p.brand || "").toLowerCase().includes(pSearch)
                          );
                        })
                        .map((p: Product) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Ref: {p.code})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Quantity and cost */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Costo Unitario ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={poBuilderTempItem.cost || ""}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, cost: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border p-2 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Cantidad</label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={poBuilderTempItem.quantity || ""}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, quantity: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border p-2 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                        placeholder="1"
                      />
                    </div>
                  </div>

                  {/* Suggested price and discount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">P. Sugerido ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={poBuilderTempItem.suggestedPrice || ""}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, suggestedPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border p-2 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Descuento ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={poBuilderTempItem.discount || ""}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, discount: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border p-2 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* IVA Config */}
                  <div className="grid grid-cols-2 gap-3 items-center pt-1">
                    <div className="flex items-center gap-1.5 h-full">
                      <input
                        type="checkbox"
                        id="builder-iva-checkbox"
                        checked={poBuilderTempItem.aplicaIVA}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, aplicaIVA: e.target.checked })}
                        className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="builder-iva-checkbox" className="text-[10px] font-semibold text-gray-600 dark:text-slate-300 cursor-pointer">Aplica IVA</label>
                    </div>
                    {poBuilderTempItem.aplicaIVA && (
                      <div>
                        <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Porcentaje IVA (%)</label>
                        <input
                          type="number"
                          value={poBuilderTempItem.porcentajeIVA || ""}
                          onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, porcentajeIVA: parseInt(e.target.value) || 0 })}
                          className="w-full text-xs rounded-lg border p-1 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Expiry, batch & location */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Ubicación</label>
                      <input
                        type="text"
                        placeholder="Estante A"
                        value={poBuilderTempItem.location}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, location: e.target.value })}
                        className="w-full text-[10px] rounded-lg border p-1.5 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Lote</label>
                      <input
                        type="text"
                        placeholder="L-102"
                        value={poBuilderTempItem.lote}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, lote: e.target.value })}
                        className="w-full text-[10px] rounded-lg border p-1.5 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Caducidad</label>
                      <input
                        type="date"
                        value={poBuilderTempItem.expiryDate}
                        onChange={(e) => setPoBuilderTempItem({ ...poBuilderTempItem, expiryDate: e.target.value })}
                        className="w-full text-[9px] rounded-lg border p-1 bg-white dark:bg-slate-800 dark:text-white border-gray-200 dark:border-slate-700"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddBuilderItem}
                    className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> Agregar Producto a la Orden
                  </button>
                </div>
              </div>

              {/* Right Column: Ordered Items list & Pricing totals Summary */}
              <div className="lg:col-span-7 flex flex-col justify-between min-h-0 space-y-4">
                
                {/* Product items table */}
                <div className="flex-1 flex flex-col min-h-[180px] border border-gray-100 dark:border-slate-800 rounded-xl p-4 bg-gray-50/20 dark:bg-slate-950/5 overflow-hidden">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block pb-1.5 border-b border-gray-100 dark:border-slate-800">
                    Artículos en la Orden ({poBuilderItems.length})
                  </span>

                  <div className="flex-1 overflow-y-auto mt-2 text-xs">
                    {poBuilderItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-10">
                        <FileText className="h-10 w-10 text-gray-300 mb-1" />
                        <p className="text-xs font-semibold">No se han añadido productos.</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Configura un producto a la izquierda y haz clic en "Agregar".</p>
                      </div>
                    ) : (
                      <table className="w-full text-[10.5px]">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-800 text-left text-gray-500 font-bold uppercase tracking-wider text-[9px]">
                            <th className="pb-1">Concepto</th>
                            <th className="pb-1 text-center">Cant</th>
                            <th className="pb-1 text-right">Costo Unit.</th>
                            <th className="pb-1 text-right">Dcto.</th>
                            <th className="pb-1 text-right">IVA</th>
                            <th className="pb-1 text-right">Total</th>
                            <th className="pb-1 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-850">
                          {poBuilderItems.map((item, idx) => {
                            const sub = item.cost * item.quantity;
                            const discount = item.discount || 0;
                            const beforeTax = Math.max(0, sub - discount);
                            const tax = item.aplicaIVA ? (beforeTax * (item.porcentajeIVA / 100)) : 0;
                            const total = beforeTax + tax;

                            return (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-850/30">
                                <td className="py-2 pr-1 font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[150px]" title={item.productName}>
                                  {item.productName}
                                </td>
                                <td className="py-2 text-center font-mono font-bold text-gray-700 dark:text-slate-300">
                                  {item.quantity}
                                </td>
                                <td className="py-2 text-right font-mono text-gray-600 dark:text-slate-400">
                                  ${formatPrice(item.cost)}
                                </td>
                                <td className="py-2 text-right font-mono text-rose-600">
                                  {discount > 0 ? `-$${discount.toFixed(2)}` : "-"}
                                </td>
                                <td className="py-2 text-right font-mono text-gray-500">
                                  {item.aplicaIVA ? `+${item.porcentajeIVA}%` : "0%"}
                                </td>
                                <td className="py-2 text-right font-mono font-bold text-gray-900 dark:text-slate-100">
                                  ${total.toFixed(2)}
                                </td>
                                <td className="py-2 text-center pl-1">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBuilderItem(item.productId)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* 3. Summary totals Card */}
                <div className="border border-gray-150 dark:border-slate-800 rounded-xl p-4 bg-emerald-50/20 dark:bg-emerald-950/5 space-y-2 shrink-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block pb-1 border-b border-emerald-100 dark:border-emerald-900/40">
                    Resumen de Cotización (Totales)
                  </span>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Cant. Artículos</p>
                      <p className="font-mono font-bold text-gray-800 dark:text-slate-200">
                        {poBuilderItems.reduce((acc, x) => acc + x.quantity, 0)} pza(s)
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Tot. Descuentos</p>
                      <p className="font-mono font-bold text-rose-600">
                        -${poBuilderItems.reduce((acc, x) => acc + (x.discount || 0), 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">Subtotal (sin IVA)</p>
                      <p className="font-mono font-bold text-gray-700 dark:text-slate-300">
                        ${poBuilderItems.reduce((acc, x) => acc + (x.cost * x.quantity - (x.discount || 0)), 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">IVA Trasladado</p>
                      <p className="font-mono font-bold text-gray-600 dark:text-slate-400">
                        ${poBuilderItems.reduce((acc, item) => {
                          const sub = item.cost * item.quantity;
                          const beforeTax = Math.max(0, sub - (item.discount || 0));
                          return acc + (item.aplicaIVA ? (beforeTax * ((item.porcentajeIVA || 16) / 100)) : 0);
                        }, 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-dashed border-emerald-100 dark:border-emerald-900/40 pt-2.5 mt-2">
                    <span className="text-xs font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-wide">Total General de la Compra:</span>
                    <span className="text-base font-mono font-black text-emerald-700 dark:text-emerald-400">
                      ${poBuilderItems.reduce((acc, item) => {
                        const sub = item.cost * item.quantity;
                        const beforeTax = Math.max(0, sub - (item.discount || 0));
                        const tax = item.aplicaIVA ? (beforeTax * ((item.porcentajeIVA || 16) / 100)) : 0;
                        return acc + beforeTax + tax;
                      }, 0).toFixed(2)} MXN
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Controls */}
            <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowAddOrderModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddOrder}
                disabled={poBuilderItems.length === 0 || !poBuilderSupplierId}
                className={`
                  px-6 py-2 rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5
                  ${poBuilderItems.length > 0 && poBuilderSupplierId
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    : "bg-gray-100 dark:bg-slate-850 text-gray-400 cursor-not-allowed"
                  }
                `}
              >
                <CheckCircle className="h-4 w-4" /> Guardar Orden de Compra
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
