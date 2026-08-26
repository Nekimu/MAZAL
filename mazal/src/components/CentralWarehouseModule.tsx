/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Warehouse,
  Boxes,
  Truck,
  Send,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Building2,
  Search,
  Filter,
  Plus,
  RefreshCw,
  FileText,
  Download,
  History,
  BarChart3,
  Layers,
  Store,
  ShieldCheck,
  Package,
  PackagePlus,
  PackageCheck,
  Info,
  Clock,
  User,
  Check,
  X,
  Edit2,
  Trash2,
  ChevronRight,
  Sparkles,
  ArrowRight,
  DollarSign,
  AlertCircle
} from "lucide-react";

import {
  Product,
  Branch,
  BranchInventoryItem,
  DistributionRecord,
  TransferRecord,
  ReplenishmentRequest,
  UserRole,
  ProductUnit
} from "../types";

import {
  getDatabase,
  saveDatabase,
  distributeCentralStock,
  transferBetweenBranches,
  createReplenishmentRequest,
  processReplenishmentRequest,
  recordInventoryMovement,
  logAction
} from "../data";
import { SYSTEM_CATEGORIES } from "./InventoryModule";

interface CentralWarehouseModuleProps {
  currentUser: { name: string; role: UserRole };
  activeBranchContext: string | null;
}

export default function CentralWarehouseModule({
  currentUser,
  activeBranchContext
}: CentralWarehouseModuleProps) {
  const [db, setDb] = useState(getDatabase());
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "catalog"
    | "distribution"
    | "replenishment"
    | "transfers"
    | "branch_view"
    | "history"
    | "branches_config"
  >("dashboard");

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("TODAS");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LOW_STOCK" | "OUT_OF_STOCK">("ALL");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Helper states for custom category
  const [isCustomCategoryWarehouse, setIsCustomCategoryWarehouse] = useState(false);
  const [customCategoryWarehouseText, setCustomCategoryWarehouseText] = useState("");

  const [selectedBranchForView, setSelectedBranchForView] = useState<string>("Centro");

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const refreshDb = () => {
    setDb({ ...getDatabase() });
  };

  // Safe collections getters
  const almacenGeneralList: Product[] = useMemo(() => db.almacen_general || db.products || [], [db]);
  const branchInventoryList: BranchInventoryItem[] = useMemo(() => db.inventario_sucursal || [], [db]);
  const branchesList: Branch[] = useMemo(() => db.sucursales || [], [db]);
  const movementsList: any[] = useMemo(() => db.movimientos_inventario || [], [db]);
  const distributionsList: DistributionRecord[] = useMemo(() => db.distribuciones || [], [db]);
  const transfersList: TransferRecord[] = useMemo(() => db.transferencias || [], [db]);
  const requestsList: ReplenishmentRequest[] = useMemo(() => db.solicitudes_reabastecimiento || [], [db]);

  const activeBranches = useMemo(() => branchesList.filter(b => b.status === "Activo"), [branchesList]);

  // Categories list
  const availableCategoryOptions = useMemo(() => {
    return Array.from(new Set([
      ...SYSTEM_CATEGORIES,
      ...almacenGeneralList.map(p => p.category || (p as any).categoria).filter(Boolean)
    ])).filter(c => c && c !== "TODAS" && c !== "Todas" && c !== "OTRO" && c !== "Otro (especificar)").sort();
  }, [almacenGeneralList]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    almacenGeneralList.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return ["TODAS", ...Array.from(cats)];
  }, [almacenGeneralList]);

  // ==========================================
  // DISTRIBUCIÓN STATE (TAB 3)
  // ==========================================
  // Map of [productId_branchName] -> sendQuantity
  const [distributionInputs, setDistributionInputs] = useState<Record<string, number>>({});
  const [distributionNotes, setDistributionNotes] = useState("");
  const [isDistributing, setIsDistributing] = useState(false);

  const handleDistributionInputChange = (productId: string, branchName: string, val: number) => {
    const key = `${productId}_${branchName}`;
    setDistributionInputs(prev => ({
      ...prev,
      [key]: Math.max(0, val)
    }));
  };

  const handleQuickFillBranch = (productId: string, branchName: string, qty: number) => {
    handleDistributionInputChange(productId, branchName, qty);
  };

  const handleExecuteDistribution = async () => {
    const itemsToDistribute: { productId: string; destinationBranch: string; quantity: number }[] = [];

    Object.entries(distributionInputs).forEach(([key, rawQty]) => {
      const qty = Number(rawQty || 0);
      if (qty > 0) {
        const [productId, destinationBranch] = key.split("_");
        itemsToDistribute.push({ productId, destinationBranch, quantity: qty });
      }
    });

    if (itemsToDistribute.length === 0) {
      showToast("Ingresa al menos una cantidad en alguna sucursal para distribuir.", "error");
      return;
    }

    setIsDistributing(true);
    try {
      const result = await distributeCentralStock(itemsToDistribute, currentUser.name, distributionNotes);
      if (result.success) {
        showToast(result.message, "success");
        setDistributionInputs({});
        setDistributionNotes("");
        refreshDb();
        logAction(currentUser.name, currentUser.role, "Distribución de Inventario", result.message);
      } else {
        showToast(result.message, "error");
      }
    } catch (err: any) {
      showToast("Error al ejecutar la distribución: " + (err?.message || String(err)), "error");
    } finally {
      setIsDistributing(false);
    }
  };

  // ==========================================
  // TRANSFERENCIAS STATE (TAB 5)
  // ==========================================
  const [transferSourceBranch, setTransferSourceBranch] = useState<string>("Centro");
  const [transferDestBranch, setTransferDestBranch] = useState<string>("Norte");
  const [transferQuantities, setTransferQuantities] = useState<Record<string, number>>({});
  const [transferNotes, setTransferNotes] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const handleExecuteTransfer = async () => {
    if (transferSourceBranch === transferDestBranch) {
      showToast("La sucursal origen y destino deben ser distintas.", "error");
      return;
    }

    const itemsToTransfer: { productId: string; quantity: number }[] = [];
    Object.entries(transferQuantities).forEach(([pId, rawQty]) => {
      const qty = Number(rawQty || 0);
      if (qty > 0) {
        itemsToTransfer.push({ productId: pId, quantity: qty });
      }
    });

    if (itemsToTransfer.length === 0) {
      showToast("Ingresa cantidades a transferir para al menos un producto.", "error");
      return;
    }

    setIsTransferring(true);
    try {
      const res = await transferBetweenBranches(
        transferSourceBranch,
        transferDestBranch,
        itemsToTransfer,
        currentUser.name,
        transferNotes
      );
      if (res.success) {
        showToast(res.message, "success");
        setTransferQuantities({});
        setTransferNotes("");
        refreshDb();
        logAction(currentUser.name, currentUser.role, "Transferencia entre Sucursales", res.message);
      } else {
        showToast(res.message, "error");
      }
    } catch (err: any) {
      showToast("Error en transferencia: " + (err?.message || String(err)), "error");
    } finally {
      setIsTransferring(false);
    }
  };

  // ==========================================
  // REABASTECIMIENTO / REQUESTS STATE (TAB 4)
  // ==========================================
  const [selectedRequest, setSelectedRequest] = useState<ReplenishmentRequest | null>(null);
  const [approvedQuantitiesModal, setApprovedQuantitiesModal] = useState<Record<string, number>>({});
  const [rejectionReasonText, setRejectionReasonText] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleOpenApproveModal = (req: ReplenishmentRequest) => {
    setSelectedRequest(req);
    const initialMap: Record<string, number> = {};
    req.items.forEach(it => {
      initialMap[it.productId] = it.requestedQuantity;
    });
    setApprovedQuantitiesModal(initialMap);
  };

  const handleConfirmApproveRequest = async () => {
    if (!selectedRequest) return;

    try {
      const res = await processReplenishmentRequest(
        selectedRequest.id,
        true,
        currentUser.name,
        undefined,
        approvedQuantitiesModal
      );

      if (res.success) {
        showToast(res.message, "success");
        setSelectedRequest(null);
        refreshDb();
        logAction(currentUser.name, currentUser.role, "Aprobación Reabastecimiento", res.message);
      } else {
        showToast(res.message, "error");
      }
    } catch (err: any) {
      showToast("Error aprobando solicitud: " + (err?.message || String(err)), "error");
    }
  };

  const handleConfirmRejectRequest = async () => {
    if (!selectedRequest) return;
    if (!rejectionReasonText.trim()) {
      showToast("Por favor especifica un motivo de rechazo.", "error");
      return;
    }

    try {
      const res = await processReplenishmentRequest(
        selectedRequest.id,
        false,
        currentUser.name,
        rejectionReasonText
      );

      if (res.success) {
        showToast(res.message, "info");
        setSelectedRequest(null);
        setShowRejectModal(false);
        setRejectionReasonText("");
        refreshDb();
        logAction(currentUser.name, currentUser.role, "Rechazo Reabastecimiento", res.message);
      } else {
        showToast(res.message, "error");
      }
    } catch (err: any) {
      showToast("Error al rechazar solicitud: " + (err?.message || String(err)), "error");
    }
  };

  // Modal to CREATE Replenishment Request from Branch View (Tab 6)
  const [showCreateRequestModal, setShowCreateRequestModal] = useState(false);
  const [newRequestItems, setNewRequestItems] = useState<Record<string, number>>({});
  const [newRequestNotes, setNewRequestNotes] = useState("");

  const handleSendNewReplenishmentRequest = async () => {
    const items: { productId: string; requestedQuantity: number }[] = [];
    Object.entries(newRequestItems).forEach(([pId, rawQty]) => {
      const qty = Number(rawQty || 0);
      if (qty > 0) items.push({ productId: pId, requestedQuantity: qty });
    });

    if (items.length === 0) {
      showToast("Selecciona al menos un producto con cantidad mayor a 0.", "error");
      return;
    }

    try {
      const res = await createReplenishmentRequest(
        selectedBranchForView,
        items,
        currentUser.name,
        newRequestNotes
      );

      if (res.success) {
        showToast(res.message, "success");
        setShowCreateRequestModal(false);
        setNewRequestItems({});
        setNewRequestNotes("");
        refreshDb();
        logAction(currentUser.name, currentUser.role, "Solicitud de Reabastecimiento", res.message);
      } else {
        showToast(res.message, "error");
      }
    } catch (err: any) {
      showToast("Error al crear solicitud: " + (err?.message || String(err)), "error");
    }
  };

  // ==========================================
  // CREATE / EDIT PRODUCT IN ALMACÉN GENERAL (TAB 2)
  // ==========================================
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [productForm, setProductForm] = useState({
    code: "",
    barcode: "",
    sku: "",
    name: "",
    brand: "",
    category: "General",
    unit: ProductUnit.PIECE,
    cost: 0,
    priceMin: 0,
    priceMed: 0,
    priceMax: 0,
    priceSpecial: 0,
    stock: 100, // Central warehouse initial stock
    stockMin: 10,
    stockMax: 1000,
    location: "Pasillo Central A1",
    imageUrl: "",
    supplierId: "",
    description: "",
    aplicaIVA: false,
    porcentajeIVA: 16
  });

  const handleOpenNewProductModal = () => {
    setIsCustomCategoryWarehouse(false);
    setCustomCategoryWarehouseText("");
    setEditingProduct(null);
    setProductForm({
      code: "PROD-" + Math.floor(1000 + Math.random() * 9000),
      barcode: String(Math.floor(750000000000 + Math.random() * 90000000000)),
      sku: "SKU-" + Math.floor(100 + Math.random() * 900),
      name: "",
      brand: "",
      category: "Abarrotes",
      unit: ProductUnit.PIECE,
      cost: 50,
      priceMin: 80,
      priceMed: 75,
      priceMax: 70,
      priceSpecial: 65,
      stock: 200,
      stockMin: 20,
      stockMax: 1000,
      location: "Almacén Central RACK-A",
      imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=200",
      supplierId: "",
      description: "Producto registrado en Almacén General Maestro",
      aplicaIVA: false,
      porcentajeIVA: 16
    });
    setShowProductModal(true);
  };

  const handleSaveProductToAlmacenGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      showToast("Ingresa la descripción/nombre del producto.", "error");
      return;
    }

    const currentDatabase = getDatabase();
    if (!currentDatabase.almacen_general) currentDatabase.almacen_general = [];
    if (!currentDatabase.products) currentDatabase.products = [];

    const newId = editingProduct ? editingProduct.id : "PRD" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const fullProduct: Product = {
      id: newId,
      code: productForm.code,
      barcode: productForm.barcode,
      sku: productForm.sku,
      name: productForm.name,
      brand: productForm.brand || "Generico",
      category: productForm.category,
      subcategory: "",
      unit: productForm.unit,
      cost: Number(productForm.cost),
      priceMin: Number(productForm.priceMin),
      priceMed: Number(productForm.priceMed),
      priceMax: Number(productForm.priceMax),
      priceSpecial: Number(productForm.priceSpecial),
      stock: Number(productForm.stock), // Master Central Stock
      stockMin: Number(productForm.stockMin),
      stockMax: Number(productForm.stockMax),
      location: productForm.location,
      isCompound: false,
      imageUrl: productForm.imageUrl || "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=200",
      supplierId: productForm.supplierId || "",

      // Dual compatibility keys
      codigo: productForm.code,
      codigoBarras: productForm.barcode,
      codigoInterno: productForm.sku,
      activo: true,
      departamento: "General",
      categoria: productForm.category,
      subcategoria: "",
      familia: "",
      linea: "",
      marca: productForm.brand || "Generico",
      tipoProducto: "General",
      presentacion: productForm.unit,
      unidadVenta: productForm.unit,
      unidadCompra: productForm.unit,
      stockReservado: 0,
      stockDisponible: Number(productForm.stock),
      stockMinimo: Number(productForm.stockMin),
      stockMaximo: Number(productForm.stockMax),
      puntoReorden: Number(productForm.stockMin),
      costo: Number(productForm.cost),
      ultimoCosto: Number(productForm.cost),
      costoPromedio: Number(productForm.cost),
      precioMenudeo: Number(productForm.priceMin),
      precioMedioMayoreo: Number(productForm.priceMed),
      precioMayoreo: Number(productForm.priceMax),
      precioEspecial: Number(productForm.priceSpecial),
      utilidad: Number(productForm.priceMin) - Number(productForm.cost),
      aplicaIVA: productForm.aplicaIVA,
      porcentajeIVA: productForm.porcentajeIVA,
      proveedorId: "",
      proveedorNombre: "",
      sucursal: "Almacén General",
      almacen: "Central",
      pasillo: "A",
      estante: "1",
      ubicacion: productForm.location,
      manejaCaducidad: false,
      lote: "",
      fechaCaducidad: "",
      descripcion: productForm.description || productForm.name,
      imagen: productForm.imageUrl || "",
      observaciones: "Registrado exclusivamente en Almacén General (0 en sucursales hasta distribuir)",
      totalVentas: 0,
      totalCompras: Number(productForm.stock),
      ultimaVenta: "",
      ultimaCompra: new Date().toISOString().substring(0, 10),
      rotacion: 0,
      tipoVenta: "pieza",
      unidad: productForm.unit
    };

    if (editingProduct) {
      const idx = currentDatabase.almacen_general.findIndex((p: any) => p.id === editingProduct.id);
      if (idx !== -1) currentDatabase.almacen_general[idx] = fullProduct;
      const idx2 = currentDatabase.products.findIndex((p: any) => p.id === editingProduct.id);
      if (idx2 !== -1) currentDatabase.products[idx2] = fullProduct;
    } else {
      currentDatabase.almacen_general.unshift(fullProduct);
      currentDatabase.products.unshift(fullProduct);
    }

    await saveDatabase(currentDatabase);
    setShowProductModal(false);
    refreshDb();
    showToast(
      editingProduct
        ? `Producto ${fullProduct.name} actualizado en Almacén General.`
        : `Producto ${fullProduct.name} registrado únicamente en Almacén General. (Las sucursales tienen 0 unidades hasta ser distribuidas).`,
      "success"
    );
    logAction(currentUser.name, currentUser.role, "Alta/Edición Almacén General", `Producto: ${fullProduct.name}`);
  };

  // ==========================================
  // KPI CALCULATIONS FOR DASHBOARD (TAB 1)
  // ==========================================
  const totalMasterProducts = almacenGeneralList.length;

  const totalCentralUnits = useMemo(() => {
    return almacenGeneralList.reduce((acc, p) => acc + Number(p.stock ?? p.stockDisponible ?? 0), 0);
  }, [almacenGeneralList]);

  const totalCentralValueCost = useMemo(() => {
    return almacenGeneralList.reduce((acc, p) => acc + (Number(p.stock ?? 0) * Number(p.cost ?? 0)), 0);
  }, [almacenGeneralList]);

  const centralLowStockCount = useMemo(() => {
    return almacenGeneralList.filter(p => Number(p.stock ?? 0) <= Number(p.stockMin ?? 5) && Number(p.stock ?? 0) > 0).length;
  }, [almacenGeneralList]);

  const centralOutOfStockCount = useMemo(() => {
    return almacenGeneralList.filter(p => Number(p.stock ?? 0) === 0).length;
  }, [almacenGeneralList]);

  const totalDistributedUnits = useMemo(() => {
    return distributionsList.reduce((acc, d) => acc + Number(d.totalUnits || 0), 0);
  }, [distributionsList]);

  const lastDistributionDate = useMemo(() => {
    if (distributionsList.length === 0) return "Sin distribuciones aún";
    return distributionsList[0].date;
  }, [distributionsList]);

  // Filtered master catalog for Tab 2
  const filteredCatalog = useMemo(() => {
    return almacenGeneralList.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = categoryFilter === "TODAS" || p.category === categoryFilter;

      let matchesStatus = true;
      const stock = Number(p.stock ?? 0);
      const minStock = Number(p.stockMin ?? 5);

      if (statusFilter === "AGOTADO") matchesStatus = stock === 0;
      if (statusFilter === "BAJO") matchesStatus = stock > 0 && stock <= minStock;
      if (statusFilter === "OK") matchesStatus = stock > minStock;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [almacenGeneralList, searchQuery, categoryFilter, statusFilter]);

  // Branch specific metrics for Tab 6
  const branchViewInventory = useMemo(() => {
    return branchInventoryList.filter(i => i.sucursal === selectedBranchForView);
  }, [branchInventoryList, selectedBranchForView]);

  const branchTotalStockUnits = useMemo(() => {
    return branchViewInventory.reduce((acc, i) => acc + Number(i.stock || 0), 0);
  }, [branchViewInventory]);

  const branchTotalValue = useMemo(() => {
    return branchViewInventory.reduce((acc, i) => acc + (Number(i.stock || 0) * Number(i.cost || 0)), 0);
  }, [branchViewInventory]);

  const branchOutOfStock = useMemo(() => {
    return branchViewInventory.filter(i => Number(i.stock || 0) === 0).length;
  }, [branchViewInventory]);

  const branchLowStock = useMemo(() => {
    return branchViewInventory.filter(i => Number(i.stock || 0) <= Number(i.stockMin || 5) && Number(i.stock || 0) > 0).length;
  }, [branchViewInventory]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans pb-12">
      
      {/* TOAST NOTIFICATION BANNER */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 max-w-md animate-bounce-short ${
            toastMessage.type === "success"
              ? "bg-emerald-900/90 text-emerald-100 border-emerald-500/50"
              : toastMessage.type === "error"
              ? "bg-rose-900/90 text-rose-100 border-rose-500/50"
              : "bg-slate-900/90 text-slate-100 border-slate-700"
          }`}
        >
          {toastMessage.type === "success" && <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />}
          {toastMessage.type === "error" && <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />}
          {toastMessage.type === "info" && <Info className="h-6 w-6 text-blue-400 shrink-0" />}
          <div className="text-xs font-medium leading-relaxed">{toastMessage.text}</div>
          <button onClick={() => setToastMessage(null)} className="ml-auto text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TOP ERP HEADER BAR */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-teal-950 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Warehouse className="w-80 h-80 text-teal-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-black uppercase tracking-widest border border-teal-500/30 font-mono flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-teal-400" />
                Módulo Enterprise ERP
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
                Almacén General (Independiente de POS)
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
              <Building2 className="h-8 w-8 text-teal-400 shrink-0" />
              Almacén General & Distribución Maestro
            </h1>

            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Administración centralizada de existencias empresariales. Registrar compras y productos en el Almacén General y distribuirlos en tiempo real hacia las sucursales sin intervenir con las ventas locales.
            </p>
          </div>

          {/* Quick Metrics Header Card */}
          <div className="flex items-center gap-3 bg-white/10 dark:bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-teal-300 font-bold uppercase tracking-wider font-mono">Stock Central Disponibilidad</p>
              <p className="text-xl font-black text-white font-mono">{totalCentralUnits.toLocaleString()} Pzas</p>
              <p className="text-[10px] text-slate-300 font-medium">En {totalMasterProducts} SKUs registrados</p>
            </div>
            <div className="p-3 bg-teal-500/20 text-teal-400 rounded-xl">
              <Boxes className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* MODULE MAIN NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "dashboard"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Dashboard Central</span>
        </button>

        <button
          onClick={() => setActiveTab("catalog")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "catalog"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Boxes className="h-4 w-4" />
          <span>Catálogo Maestro (Almacén General)</span>
        </button>

        <button
          onClick={() => setActiveTab("distribution")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "distribution"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400 scale-102"
              : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-800"
          }`}
        >
          <Send className="h-4 w-4" />
          <span>Distribución de Inventario</span>
          <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-extrabold uppercase">Envío a Sucursales</span>
        </button>

        <button
          onClick={() => setActiveTab("replenishment")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer relative ${
            activeTab === "replenishment"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <RefreshCw className="h-4 w-4" />
          <span>Solicitudes Reabastecimiento</span>
          {requestsList.filter(r => r.status === "Pendiente").length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold animate-pulse">
              {requestsList.filter(r => r.status === "Pendiente").length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("transfers")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "transfers"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span>Transferencias entre Sucursales</span>
        </button>

        <button
          onClick={() => setActiveTab("branch_view")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "branch_view"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Store className="h-4 w-4" />
          <span>Stock por Sucursal</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "history"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Auditoría & Kárdex</span>
        </button>

        <button
          onClick={() => setActiveTab("branches_config")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "branches_config"
              ? "bg-slate-900 dark:bg-teal-500 text-white dark:text-slate-950 shadow-md scale-102"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Sucursales ({activeBranches.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DASHBOARD ALMACÉN GENERAL */}
      {/* ========================================================================= */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          
          {/* KPI BENTO GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Master Items */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Productos Registrados</p>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white font-mono">{totalMasterProducts}</h3>
                <p className="text-[10px] text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1">
                  <Package className="h-3 w-3" /> Catálogo Maestro Almacén Central
                </p>
              </div>
              <div className="p-3.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-2xl">
                <Boxes className="h-7 w-7" />
              </div>
            </div>

            {/* KPI 2: Total Central Units */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Inventario Total Central</p>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white font-mono">{totalCentralUnits.toLocaleString()}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Unidades en Almacén General (Sin vender)</p>
              </div>
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <Warehouse className="h-7 w-7" />
              </div>
            </div>

            {/* KPI 3: Central Inventory Value */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Valor Inversión Almacén</p>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white font-mono">${totalCentralValueCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Costo total de stock en bodega central</p>
              </div>
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl">
                <DollarSign className="h-7 w-7" />
              </div>
            </div>

            {/* KPI 4: Distributed Units */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">Inventario Distribuido</p>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white font-mono">{totalDistributedUnits.toLocaleString()}</h3>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">A {activeBranches.length} sucursales activas</p>
              </div>
              <div className="p-3.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-2xl">
                <Truck className="h-7 w-7" />
              </div>
            </div>
          </div>

          {/* SECONDARY DASHBOARD ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT 2 COLS: Stock Status & Branch Breakdown */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Central Stock Alerts */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Diagnóstico de Stock en Almacén General</h3>
                  </div>
                  <button onClick={() => setActiveTab("catalog")} className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline flex items-center gap-1">
                    Ver Catálogo Completo <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                    <p className="text-xs text-emerald-800 dark:text-emerald-400 font-bold">Stock Suficiente</p>
                    <p className="text-2xl font-black text-emerald-900 dark:text-emerald-300 font-mono mt-1">
                      {almacenGeneralList.filter(p => Number(p.stock ?? 0) > Number(p.stockMin ?? 5)).length} SKUs
                    </p>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-500 mt-0.5">Nivel óptimo para distribución</p>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                    <p className="text-xs text-amber-800 dark:text-amber-400 font-bold">Por Agotarse (Reabastecer)</p>
                    <p className="text-2xl font-black text-amber-900 dark:text-amber-300 font-mono mt-1">
                      {centralLowStockCount} SKUs
                    </p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-500 mt-0.5">Por debajo del stock mínimo</p>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
                    <p className="text-xs text-rose-800 dark:text-rose-400 font-bold">Stock Agotado en Bodega</p>
                    <p className="text-2xl font-black text-rose-900 dark:text-rose-300 font-mono mt-1">
                      {centralOutOfStockCount} SKUs
                    </p>
                    <p className="text-[10px] text-rose-700 dark:text-rose-500 mt-0.5">Requiere compra urgente a proveedor</p>
                  </div>
                </div>

                {/* Stock distribution CTA banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-teal-900 to-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-extrabold flex items-center gap-2">
                      <Send className="h-4 w-4 text-teal-400" /> ¿Necesitas enviar mercancía a las tiendas?
                    </h4>
                    <p className="text-xs text-slate-300">
                      Utiliza la matriz de Distribución de Inventario para surtir a Centro, Norte, Sur y Bodega en una sola pantalla.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("distribution")}
                    className="px-4 py-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-black shadow-lg cursor-pointer whitespace-nowrap shrink-0 transition-all hover:scale-105"
                  >
                    Ir a Distribución de Inventario →
                  </button>
                </div>
              </div>

              {/* Active Branches Distribution Summary */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal-600" /> Resumen de Inventario Asignado por Sucursal
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeBranches.map(branch => {
                    const branchItems = branchInventoryList.filter(i => i.sucursal === branch.name);
                    const unitsInBranch = branchItems.reduce((acc, i) => acc + Number(i.stock || 0), 0);
                    const branchVal = branchItems.reduce((acc, i) => acc + (Number(i.stock || 0) * Number(i.cost || 0)), 0);

                    return (
                      <div key={branch.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Sucursal {branch.name}</h4>
                            <span className="text-[10px] font-mono text-slate-400">{branch.code}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            <strong>{unitsInBranch.toLocaleString()}</strong> piezas asignadas
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Valor: ${branchVal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedBranchForView(branch.name);
                            setActiveTab("branch_view");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-teal-700 dark:text-teal-300 border border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
                        >
                          Ver Detalle
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COL: Recent Distribution Activity & Quick Information */}
            <div className="space-y-6">
              
              {/* Recent Distributions Feed */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="h-4 w-4 text-teal-600" /> Últimas Distribuciones
                  </h3>
                  <button onClick={() => setActiveTab("history")} className="text-[10px] text-teal-600 font-bold hover:underline">Ver Historial</button>
                </div>

                {distributionsList.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs space-y-2">
                    <Boxes className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p>No se han realizado distribuciones aún.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {distributionsList.slice(0, 5).map(dist => (
                      <div key={dist.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 text-xs space-y-1.5">
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-teal-600 dark:text-teal-400">{dist.code}</span>
                          <span className="text-[10px] text-slate-400">{dist.date}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-medium">
                          <strong>{dist.totalUnits} piezas</strong> ({dist.totalItems} productos) enviadas
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                          <span>Operador: <strong>{dist.user}</strong></span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold">{dist.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Replenishment Requests Alert Widget */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-amber-500" /> Solicitudes Pendientes
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[10px] font-black">
                    {requestsList.filter(r => r.status === "Pendiente").length} por revisar
                  </span>
                </div>

                {requestsList.filter(r => r.status === "Pendiente").length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs text-center font-medium">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                    Todas las solicitudes de reabastecimiento han sido procesadas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {requestsList.filter(r => r.status === "Pendiente").slice(0, 3).map(req => (
                      <div key={req.id} className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900 dark:text-amber-300">Sucursal {req.branch}</span>
                          <span className="font-mono text-[10px] text-amber-700">{req.code}</span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300">
                          {req.items.length} productos solicitados por <strong>{req.requestedBy}</strong>
                        </p>
                        <button
                          onClick={() => setActiveTab("replenishment")}
                          className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                        >
                          Revisar y Aprobar →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CATÁLOGO & STOCK MAESTRO (ALMACÉN GENERAL) */}
      {/* ========================================================================= */}
      {activeTab === "catalog" && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* HEADER & CONTROLS */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Boxes className="h-5 w-5 text-teal-600" /> Inventario Maestro de Almacén General
              </h2>
              <p className="text-xs text-slate-500">
                Catálogo global de productos de la empresa y existencias en bodega central.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenNewProductModal}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Alta Producto en Almacén General</span>
              </button>
            </div>
          </div>

          {/* FILTERS TOOLBAR */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, código de barras o SKU maestro..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white cursor-pointer"
              >
                {categories.map(c => (
                  <option key={c} value={c}>Categoría: {c}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white cursor-pointer"
              >
                <option value="TODOS">Estado Stock: Todos</option>
                <option value="OK">Suficiente (&gt; Mínimo)</option>
                <option value="BAJO">Bajo (&lt;= Mínimo)</option>
                <option value="AGOTADO">Agotado (0)</option>
              </select>
            </div>
          </div>

          {/* CATALOG MASTER TABLE */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider bg-slate-50 dark:bg-slate-850">
                    <th className="p-3 font-extrabold">Producto Maestro</th>
                    <th className="p-3 font-extrabold">Código / SKU</th>
                    <th className="p-3 font-extrabold">Categoría</th>
                    <th className="p-3 font-extrabold text-right">Costo</th>
                    <th className="p-3 font-extrabold text-right">Precio Menudeo</th>
                    <th className="p-3 font-extrabold text-center">Stock Almacén General</th>
                    <th className="p-3 font-extrabold text-center">Ubicación Bodega</th>
                    <th className="p-3 font-extrabold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400">
                        <Boxes className="h-10 w-10 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                        <p className="font-bold">No se encontraron productos en Almacén General.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map(product => {
                      const stockVal = Number(product.stock ?? 0);
                      const minStock = Number(product.stockMin ?? 5);

                      return (
                        <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={product.imageUrl || "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=200"}
                                alt={product.name}
                                className="w-10 h-10 object-cover rounded-xl border border-slate-200 dark:border-slate-800 shrink-0"
                              />
                              <div>
                                <p className="font-extrabold text-slate-900 dark:text-white text-xs">{product.name}</p>
                                <p className="text-[10px] text-slate-400">Marca: {product.brand || "Generico"} • Unidad: {product.unit}</p>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 font-mono">
                            <p className="font-bold text-slate-800 dark:text-slate-200">{product.code || product.codigo}</p>
                            <p className="text-[10px] text-slate-400">{product.barcode || "Sin barras"}</p>
                          </td>

                          <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[10px]">
                              {product.category || "General"}
                            </span>
                          </td>

                          <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            ${Number(product.cost || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                            ${Number(product.priceMin || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-center font-mono">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-xs shadow-xs"
                              style={{
                                backgroundColor: stockVal === 0 ? "rgba(244, 63, 94, 0.15)" : stockVal <= minStock ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                color: stockVal === 0 ? "#f43f5e" : stockVal <= minStock ? "#d97706" : "#059669"
                              }}
                            >
                              <span>{stockVal} {product.unit}</span>
                              <span className="text-[9px] uppercase opacity-75 font-sans">(General)</span>
                            </div>
                          </td>

                          <td className="p-3 text-center text-slate-500 text-xs font-mono">
                            {product.location || "Central"}
                          </td>

                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                const isCust = product.category ? !availableCategoryOptions.includes(product.category) : false;
                                setIsCustomCategoryWarehouse(isCust);
                                setCustomCategoryWarehouseText(isCust ? (product.category || "") : "");
                                setEditingProduct(product);
                                setProductForm({
                                  code: product.code,
                                  barcode: product.barcode || "",
                                  sku: product.sku || "",
                                  name: product.name,
                                  brand: product.brand || "",
                                  category: product.category || "General",
                                  unit: product.unit || ProductUnit.PIECE,
                                  cost: product.cost || 0,
                                  priceMin: product.priceMin || 0,
                                  priceMed: product.priceMed || 0,
                                  priceMax: product.priceMax || 0,
                                  priceSpecial: product.priceSpecial || 0,
                                  stock: product.stock || 0,
                                  stockMin: product.stockMin || 10,
                                  stockMax: product.stockMax || 1000,
                                  location: product.location || "",
                                  imageUrl: product.imageUrl || "",
                                  supplierId: product.supplierId || "",
                                  description: product.description || "",
                                  aplicaIVA: Boolean(product.aplicaIVA),
                                  porcentajeIVA: product.porcentajeIVA || 16
                                });
                                setShowProductModal(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DISTRIBUCIÓN DE INVENTARIO (SECCIÓN PRINCIPAL) */}
      {/* ========================================================================= */}
      {activeTab === "distribution" && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* EXPLANATORY HEADER BANNER */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white border border-emerald-800 shadow-md space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Send className="h-6 w-6 text-emerald-400" />
                <h2 className="text-xl font-black">Módulo de Distribución de Inventario</h2>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
                Almacén General → Sucursales
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Asigna y transfiere mercancía disponible en el Almacén General a cualquiera de las sucursales. 
              <strong> Importante:</strong> Al confirmar, las piezas se descuentan automáticamente del Almacén General y se suman al inventario de la sucursal seleccionada sin afectar las ventas locales.
            </p>
          </div>

          {/* DISTRIBUTION MATRIX TABLE */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            
            {/* Search & Filter bar for distribution matrix */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="relative flex-1 w-full">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filtrar productos para distribuir..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  value={distributionNotes}
                  onChange={e => setDistributionNotes(e.target.value)}
                  placeholder="Observaciones de distribución (Opcional)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* MATRIX TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider bg-slate-50 dark:bg-slate-850">
                    <th className="p-3 font-extrabold min-w-[200px]">Producto</th>
                    <th className="p-3 font-extrabold text-center min-w-[120px] bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      Stock General
                    </th>
                    {activeBranches.map(branch => (
                      <th key={branch.id} className="p-3 font-extrabold text-center min-w-[170px] border-l border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-center gap-1 text-slate-800 dark:text-white">
                          <Store className="h-3.5 w-3.5 text-teal-600" />
                          <span>{branch.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={2 + activeBranches.length} className="p-12 text-center text-slate-400">
                        No hay productos para distribuir.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map(product => {
                      const centralStock = Number(product.stock ?? 0);

                      return (
                        <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={product.imageUrl || "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=200"}
                                alt={product.name}
                                className="w-8 h-8 object-cover rounded-lg border border-slate-200 dark:border-slate-800 shrink-0"
                              />
                              <div>
                                <p className="font-extrabold text-slate-900 dark:text-white text-xs">{product.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{product.code} • {product.unit}</p>
                              </div>
                            </div>
                          </td>

                          {/* Central Stock Cell */}
                          <td className="p-3 text-center font-mono bg-teal-50/50 dark:bg-teal-950/10">
                            <span className={`px-2.5 py-1 rounded-full font-black text-xs ${
                              centralStock > 0 ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}>
                              {centralStock}
                            </span>
                          </td>

                          {/* Column for each branch */}
                          {activeBranches.map(branch => {
                            const branchInvItem = branchInventoryList.find(
                              i => i.productId === product.id && i.sucursal === branch.name
                            );
                            const currentBranchStock = Number(branchInvItem?.stock || 0);

                            const inputKey = `${product.id}_${branch.name}`;
                            const sendQty = distributionInputs[inputKey] || 0;

                            return (
                              <td key={branch.id} className="p-3 border-l border-slate-100 dark:border-slate-800">
                                <div className="space-y-1.5 text-center">
                                  <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                                    <span>Disponible:</span>
                                    <strong className="text-slate-800 dark:text-slate-200 font-black">{currentBranchStock}</strong>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      max={centralStock}
                                      value={sendQty || ""}
                                      onChange={e => handleDistributionInputChange(product.id, branch.name, parseInt(e.target.value) || 0)}
                                      placeholder="Enviar..."
                                      className={`w-full px-2 py-1.5 rounded-lg border text-xs font-mono font-bold text-center focus:outline-none ${
                                        sendQty > 0
                                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30"
                                          : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                      }`}
                                    />
                                    {centralStock > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => handleQuickFillBranch(product.id, branch.name, Math.min(10, centralStock))}
                                        title="Enviar 10 piezas"
                                        className="px-1.5 py-1 rounded bg-slate-200 dark:bg-slate-750 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-emerald-500 hover:text-white cursor-pointer"
                                      >
                                        +10
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* DISTRIBUTION SUMMARY & CONFIRMATION BAR */}
            <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <p className="text-xs text-slate-300 font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Resumen de Selección para Distribución
                </p>
                <p className="text-xs text-slate-400">
                  Total de unidades marcadas para envío:{" "}
                  <strong className="text-emerald-400 font-mono text-sm">
                    {(Object.values(distributionInputs) as number[]).reduce((a, b) => a + Number(b || 0), 0)} Pzas
                  </strong>
                </p>
              </div>

              <button
                onClick={handleExecuteDistribution}
                disabled={isDistributing || (Object.values(distributionInputs) as number[]).reduce((a, b) => a + Number(b || 0), 0) === 0}
                className={`px-6 py-3 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer transition-all ${
                  (Object.values(distributionInputs) as number[]).reduce((a, b) => a + Number(b || 0), 0) > 0
                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 scale-102"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                <Send className="h-4 w-4" />
                <span>{isDistributing ? "Procesando Distribución..." : "Distribuir Inventario a Sucursales"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SOLICITUDES DE REABASTECIMIENTO DE SUCURSALES */}
      {/* ========================================================================= */}
      {activeTab === "replenishment" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-amber-500" /> Solicitudes de Reabastecimiento de Sucursales
              </h2>
              <p className="text-xs text-slate-500">
                Aprobar o rechazar pedidos de mercancía generados por los gerentes de cada tienda.
              </p>
            </div>
          </div>

          {/* REQUESTS LIST */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            {requestsList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <RefreshCw className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="font-bold">No hay solicitudes de reabastecimiento registradas.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requestsList.map(req => (
                  <div
                    key={req.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      req.status === "Pendiente"
                        ? "border-amber-300 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10"
                        : req.status === "Aprobado"
                        ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{req.code}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              req.status === "Pendiente"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse"
                                : req.status === "Aprobado"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Solicitante: <strong>{req.requestedBy}</strong> (Sucursal <strong>{req.branch}</strong>) • Fecha: {req.requestDate}
                        </p>
                      </div>

                      {req.status === "Pendiente" && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenApproveModal(req)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Aprobar y Surtir
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setShowRejectModal(true);
                            }}
                            className="px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-bold text-xs cursor-pointer"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ITEMS REQUESTED TABLE */}
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-400 font-mono text-[10px] uppercase">
                            <th className="py-2">Producto</th>
                            <th className="py-2 text-center">Stock Actual Sucursal</th>
                            <th className="py-2 text-center">Cantidad Solicitada</th>
                            {req.status === "Aprobado" && <th className="py-2 text-center text-emerald-600">Aprobada</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800">
                          {req.items.map((it, idx) => (
                            <tr key={idx}>
                              <td className="py-2 font-bold text-slate-800 dark:text-slate-200">{it.productName} ({it.code})</td>
                              <td className="py-2 text-center font-mono text-slate-500">{it.currentStock} Pzas</td>
                              <td className="py-2 text-center font-mono font-bold text-amber-600 dark:text-amber-400">{it.requestedQuantity} Pzas</td>
                              {req.status === "Aprobado" && (
                                <td className="py-2 text-center font-mono font-bold text-emerald-600">{it.approvedQuantity || it.requestedQuantity} Pzas</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {req.rejectionReason && (
                      <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900/40">
                        <strong>Motivo de Rechazo:</strong> {req.rejectionReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TRANSFERENCIAS ENTRE SUCURSALES */}
      {/* ========================================================================= */}
      {activeTab === "transfers" && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white border border-blue-800 shadow-md space-y-2">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6 text-blue-400" />
              <h2 className="text-xl font-black">Transferencia Directa Entre Sucursales</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Transfiere inventario directamente de una sucursal origen a otra sucursal destino. 
              <strong> Nota importante:</strong> Las transferencias entre sucursales únicamente mueven existencias locales y NO modifican el Almacén General.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            
            {/* SOURCE AND DESTINATION BRANCH SELECTORS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-amber-500" /> Sucursal Origen (Descontar stock)
                </label>
                <select
                  value={transferSourceBranch}
                  onChange={e => setTransferSourceBranch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
                >
                  {activeBranches.map(b => (
                    <option key={b.id} value={b.name}>Sucursal {b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-emerald-500" /> Sucursal Destino (Acreditar stock)
                </label>
                <select
                  value={transferDestBranch}
                  onChange={e => setTransferDestBranch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
                >
                  {activeBranches.map(b => (
                    <option key={b.id} value={b.name} disabled={b.name === transferSourceBranch}>
                      Sucursal {b.name} ({b.code}) {b.name === transferSourceBranch ? "(Origen)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* PRODUCT SELECTOR TABLE FOR TRANSFER */}
            <div className="space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Seleccionar Productos Disponibles en Sucursal {transferSourceBranch}
              </h3>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-400">
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-center">Disponible en {transferSourceBranch}</th>
                      <th className="p-3 text-center">Cantidad a Transferir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {branchInventoryList.filter(i => i.sucursal === transferSourceBranch).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-slate-400">
                          No hay productos registrados con stock disponible en {transferSourceBranch}.
                        </td>
                      </tr>
                    ) : (
                      branchInventoryList.filter(i => i.sucursal === transferSourceBranch).map(inv => {
                        const available = Number(inv.stock || 0);
                        const transferQty = transferQuantities[inv.productId] || 0;

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                            <td className="p-3">
                              <p className="font-extrabold text-slate-900 dark:text-white">{inv.productName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{inv.code}</p>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                              {available} Pzas
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={available}
                                value={transferQty || ""}
                                onChange={e => setTransferQuantities(prev => ({ ...prev, [inv.productId]: parseInt(e.target.value) || 0 }))}
                                placeholder="0"
                                className="w-28 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-center text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CONFIRMATION */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <input
                type="text"
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                placeholder="Motivo u observaciones de transferencia..."
                className="w-full sm:w-80 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border text-xs"
              />

              <button
                onClick={handleExecuteTransfer}
                disabled={isTransferring}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>Ejecutar Transferencia ({transferSourceBranch} → {transferDestBranch})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: DASHBOARD & STOCK POR SUCURSAL */}
      {/* ========================================================================= */}
      {activeTab === "branch_view" && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="h-5 w-5 text-teal-600" /> Inventario & Métricas por Sucursal
              </h2>
              <p className="text-xs text-slate-500">
                Selecciona una sucursal para consultar sus existencias locales, alertas de stock y realizar solicitudes de reabastecimiento.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedBranchForView}
                onChange={e => setSelectedBranchForView(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 font-black text-xs border border-teal-300 dark:border-teal-800 cursor-pointer"
              >
                {activeBranches.map(b => (
                  <option key={b.id} value={b.name}>Sucursal {b.name}</option>
                ))}
              </select>

              <button
                onClick={() => setShowCreateRequestModal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Solicitar Reabastecimiento a Bodega</span>
              </button>
            </div>
          </div>

          {/* BRANCH SPECIFIC KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[10px] text-slate-400 font-mono uppercase font-bold">Unidades en Sucursal {selectedBranchForView}</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">{branchTotalStockUnits.toLocaleString()} Pzas</h3>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <p className="text-[10px] text-slate-400 font-mono uppercase font-bold">Valor Inventario Local</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">${branchTotalValue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h3>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
              <p className="text-[10px] text-amber-800 dark:text-amber-400 font-mono uppercase font-bold">Por Agotarse</p>
              <h3 className="text-2xl font-black text-amber-900 dark:text-amber-300 font-mono mt-1">{branchLowStock} SKUs</h3>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
              <p className="text-[10px] text-rose-800 dark:text-rose-400 font-mono uppercase font-bold">Agotados en Tienda</p>
              <h3 className="text-2xl font-black text-rose-900 dark:text-rose-300 font-mono mt-1">{branchOutOfStock} SKUs</h3>
            </div>
          </div>

          {/* BRANCH INVENTORY TABLE */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="p-3">Producto</th>
                    <th className="p-3">Código</th>
                    <th className="p-3 text-center">Stock Disponible</th>
                    <th className="p-3 text-center">Stock Mínimo</th>
                    <th className="p-3 text-right">Precio Menudeo</th>
                    <th className="p-3 text-center">Última Actualización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {branchViewInventory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Esta sucursal aún no tiene productos asignados desde Almacén General.
                      </td>
                    </tr>
                  ) : (
                    branchViewInventory.map(inv => (
                      <tr key={inv.id}>
                        <td className="p-3 font-extrabold text-slate-900 dark:text-white">{inv.productName}</td>
                        <td className="p-3 font-mono text-slate-500">{inv.code}</td>
                        <td className="p-3 text-center font-mono font-black text-teal-600 dark:text-teal-400">{inv.stock} Pzas</td>
                        <td className="p-3 text-center font-mono text-slate-400">{inv.stockMin || 5} Pzas</td>
                        <td className="p-3 text-right font-mono font-bold">${Number(inv.priceMin || 0).toFixed(2)}</td>
                        <td className="p-3 text-center text-[10px] text-slate-400">{inv.updatedAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: HISTORIAL AUDITORÍA & KÁRDEX COMPLETO */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <History className="h-5 w-5 text-teal-600" /> Auditoría Completa de Movimientos de Inventario
            </h2>
            <p className="text-xs text-slate-500">
              Historial permanente e inmutable de todas las distribuciones, transferencias, ventas, mermas y reabastecimientos.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                    <th className="p-3">Fecha y Hora</th>
                    <th className="p-3">Usuario</th>
                    <th className="p-3">Tipo Movimiento</th>
                    <th className="p-3">Origen → Destino</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movementsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        No hay movimientos registrados en el historial de auditoría.
                      </td>
                    </tr>
                  ) : (
                    movementsList.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                        <td className="p-3 font-mono text-slate-500 text-[11px]">{m.date}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{m.user}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-bold text-[10px]">
                            {m.reason}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <span className="text-slate-500">{m.sourceBranch}</span>
                          <span className="text-teal-500 font-bold mx-1">→</span>
                          <span className="text-slate-900 dark:text-white font-bold">{m.destinationBranch}</span>
                        </td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{m.productName}</td>
                        <td className="p-3 text-center font-mono font-black text-emerald-600">{m.quantity} Pzas</td>
                        <td className="p-3 text-slate-500 text-[11px]">{m.notes || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: CONFIGURACIÓN DE SUCURSALES */}
      {/* ========================================================================= */}
      {activeTab === "branches_config" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-600" /> Directorio & Sucursales de la Empresa
              </h2>
              <p className="text-xs text-slate-500">
                Soporta ilimitadas sucursales de forma dinámica (Centro, Norte, Sur, Bodega, etc.).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {branchesList.map(branch => (
              <div key={branch.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-teal-600 font-bold">{branch.code}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{branch.status}</span>
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Sucursal {branch.name}</h3>
                <p className="text-xs text-slate-500">{branch.address}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">Encargado: <strong>{branch.manager}</strong></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REGISTER / EDIT PRODUCT IN ALMACÉN GENERAL */}
      {/* ========================================================================= */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <PackagePlus className="h-6 w-6 text-teal-600" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {editingProduct ? "Editar Producto en Almacén General" : "Alta de Producto en Almacén General Maestro"}
                </h3>
              </div>
              <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs border border-amber-200 dark:border-amber-900/40">
              <strong>Regla de Almacén General:</strong> Al registrar este producto, se almacenará únicamente en el Almacén General con su Stock Inicial. Las sucursales iniciarán con 0 piezas hasta que realices una distribución.
            </div>

            <form onSubmit={handleSaveProductToAlmacenGeneral} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Código Producto *</label>
                  <input
                    type="text"
                    required
                    value={productForm.code}
                    onChange={e => setProductForm({ ...productForm, code: e.target.value })}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Código de Barras</label>
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={e => setProductForm({ ...productForm, barcode: e.target.value })}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">SKU / Clave Interna</label>
                  <input
                    type="text"
                    value={productForm.sku}
                    onChange={e => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Descripción / Nombre del Producto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Coca Cola 600ml No Retornable"
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-extrabold text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Categoría</label>
                  <select
                    value={
                      isCustomCategoryWarehouse
                        ? "OTRO"
                        : availableCategoryOptions.includes(productForm.category)
                        ? productForm.category
                        : productForm.category
                        ? "OTRO"
                        : "Abarrotes"
                    }
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "OTRO") {
                        setIsCustomCategoryWarehouse(true);
                        setProductForm({ ...productForm, category: customCategoryWarehouseText || "" });
                      } else {
                        setIsCustomCategoryWarehouse(false);
                        setProductForm({ ...productForm, category: val });
                      }
                    }}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-semibold text-xs"
                  >
                    <option value="" disabled>-- Selecciona una categoría --</option>
                    {availableCategoryOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="OTRO">➕ Otro (especificar)...</option>
                  </select>

                  {(isCustomCategoryWarehouse || (!availableCategoryOptions.includes(productForm.category) && Boolean(productForm.category))) && (
                    <div className="mt-1 space-y-1 animate-fadeIn">
                      <input
                        type="text"
                        required
                        placeholder="Especifique la categoría..."
                        value={productForm.category}
                        onChange={e => {
                          setCustomCategoryWarehouseText(e.target.value);
                          setProductForm({ ...productForm, category: e.target.value });
                        }}
                        className="w-full p-2 rounded-lg border-2 border-emerald-500 bg-emerald-50/40 dark:bg-slate-800 text-xs font-medium"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Marca</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={e => setProductForm({ ...productForm, brand: e.target.value })}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Unidad de Medida</label>
                  <select
                    value={productForm.unit}
                    onChange={e => setProductForm({ ...productForm, unit: e.target.value as ProductUnit })}
                    className="w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value={ProductUnit.PIECE}>Pieza (Pza)</option>
                    <option value={ProductUnit.KILO}>Kilo (Kg)</option>
                    <option value={ProductUnit.LITER}>Litro (L)</option>
                    <option value={ProductUnit.PACK}>Paquete (Paq)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.cost}
                    onChange={e => setProductForm({ ...productForm, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-teal-600">Precio Menudeo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.priceMin}
                    onChange={e => setProductForm({ ...productForm, priceMin: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border font-mono font-black"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Medio Mayoreo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.priceMed}
                    onChange={e => setProductForm({ ...productForm, priceMed: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Precio Mayoreo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.priceMax}
                    onChange={e => setProductForm({ ...productForm, priceMax: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-black text-emerald-600">Stock Inicial Almacén General *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={productForm.stock}
                    onChange={e => setProductForm({ ...productForm, stock: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 font-mono font-black text-sm text-emerald-900 dark:text-emerald-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Stock Mínimo Bodega</label>
                  <input
                    type="number"
                    value={productForm.stockMin}
                    onChange={e => setProductForm({ ...productForm, stockMin: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 rounded-xl border font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Ubicación Bodega Central</label>
                  <input
                    type="text"
                    value={productForm.location}
                    onChange={e => setProductForm({ ...productForm, location: e.target.value })}
                    placeholder="Ej. Rack A-12 Pasillo 3"
                    className="w-full p-2.5 rounded-xl border"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black shadow-lg cursor-pointer"
                >
                  {editingProduct ? "Guardar Cambios" : "Registrar en Almacén General"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE REPLENISHMENT REQUEST FROM BRANCH (TAB 6) */}
      {/* ========================================================================= */}
      {showCreateRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Solicitud de Reabastecimiento para Sucursal {selectedBranchForView}
                </h3>
              </div>
              <button onClick={() => setShowCreateRequestModal(false)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Selecciona los productos y cantidades que la sucursal <strong>{selectedBranchForView}</strong> necesita recibir desde el Almacén General.
            </p>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {almacenGeneralList.map(prod => {
                const requestedQty = newRequestItems[prod.id] || 0;
                return (
                  <div key={prod.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{prod.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{prod.code} • Dispo Central: {prod.stock || 0} Pzas</p>
                    </div>

                    <input
                      type="number"
                      min={0}
                      value={requestedQty || ""}
                      onChange={e => setNewRequestItems(prev => ({ ...prev, [prod.id]: parseInt(e.target.value) || 0 }))}
                      placeholder="Cantidad..."
                      className="w-28 px-2 py-1.5 rounded-lg border font-mono font-bold text-center"
                    />
                  </div>
                );
              })}
            </div>

            <input
              type="text"
              value={newRequestNotes}
              onChange={e => setNewRequestNotes(e.target.value)}
              placeholder="Notas o justificación del pedido..."
              className="w-full px-3 py-2 rounded-xl border text-xs"
            />

            <div className="flex justify-end gap-3 pt-3">
              <button onClick={() => setShowCreateRequestModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-xs">Cancelar</button>
              <button onClick={handleSendNewReplenishmentRequest} className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black text-xs shadow-md">
                Enviar Solicitud a Bodega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APPROVE REPLENISHMENT REQUEST */}
      {/* ========================================================================= */}
      {selectedRequest && !showRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Aprobar y Surtir Solicitud {selectedRequest.code}
                </h3>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Sucursal Destino: <strong>{selectedRequest.branch}</strong>. Ajusta las cantidades a enviar desde Almacén General si no cuentas con la totalidad del pedido.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedRequest.items.map(it => {
                const currentCentral = (almacenGeneralList.find(p => p.id === it.productId)?.stock) || 0;
                const approvedQty = approvedQuantitiesModal[it.productId] ?? it.requestedQuantity;

                return (
                  <div key={it.productId} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{it.productName}</p>
                      <p className="text-[10px] text-slate-400">Solicitado: {it.requestedQuantity} Pzas | Central: {currentCentral} Pzas</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-500">Aprobar:</span>
                      <input
                        type="number"
                        min={0}
                        max={currentCentral}
                        value={approvedQty}
                        onChange={e => setApprovedQuantitiesModal(prev => ({ ...prev, [it.productId]: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 rounded-lg border font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button onClick={() => setSelectedRequest(null)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-xs">Cancelar</button>
              <button onClick={handleConfirmApproveRequest} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md">
                Confirmar Envío y Descontar Bodega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REJECT REPLENISHMENT REQUEST */}
      {/* ========================================================================= */}
      {selectedRequest && showRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <XCircle className="h-6 w-6" />
              <h3 className="text-base font-black">Rechazar Solicitud {selectedRequest.code}</h3>
            </div>

            <p className="text-xs text-slate-500">
              Indica la razón del rechazo para notificar a la sucursal {selectedRequest.branch}.
            </p>

            <textarea
              value={rejectionReasonText}
              onChange={e => setRejectionReasonText(e.target.value)}
              placeholder="Escribe el motivo de rechazo (Ej. Sin stock en proveedor, pedido duplicado...)"
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs h-24"
            />

            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowRejectModal(false); setSelectedRequest(null); }} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-xs">Cancelar</button>
              <button onClick={handleConfirmRejectRequest} className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md">
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
