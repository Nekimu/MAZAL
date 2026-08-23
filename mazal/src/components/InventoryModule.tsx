/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Package, 
  Search, 
  Filter, 
  AlertTriangle, 
  Plus, 
  ArrowUpDown, 
  Edit3, 
  Eye, 
  Clock, 
  CheckCircle2, 
  Activity,
  FileText,
  MapPin,
  Calendar,
  X,
  RefreshCw,
  Camera,
  Trash2,
  Layers,
  Truck,
  Send,
  Check,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Product, ProductUnit, MovementType, StockMovement, User, UserRole, formatPrice, StockTransfer } from "../types";
import { 
  getDatabase, 
  saveDatabase, 
  logAction, 
  registerMovement, 
  subscribeToDb,
  saveProductToSupabase,
  deleteProductFromSupabase,
  saveMovementToSupabase
} from "../data";
import { authenticateStaff } from "../services/authService";
import { createPendingStockTransfer, confirmStockTransferReceipt, rejectStockTransfer } from "../utils/BranchInventoryService";

interface InventoryModuleProps {
  currentUser: { name: string; role: string };
  currentBranch?: "Norte" | "Sur" | string | null;
}

export default function InventoryModule({ currentUser, currentBranch }: InventoryModuleProps) {
  const [db, setDb] = useState(getDatabase());
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [selectedDepartamento, setSelectedDepartamento] = useState("Todas");
  const [selectedSubcategory, setSelectedSubcategory] = useState("Todas");
  const [selectedBrand, setSelectedBrand] = useState("Todas");
  const [selectedSupplier, setSelectedSupplier] = useState("Todas");
  const [selectedTipoVenta, setSelectedTipoVenta] = useState("Todas");
  const [selectedUnidad, setSelectedUnidad] = useState("Todas");
  const [selectedStockStatus, setSelectedStockStatus] = useState("Todas");
  
  const [selectedMetricFilter, setSelectedMetricFilter] = useState<"todas" | "bajo_stock" | "caducidad" | "movimientos_hoy">("todas");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(30);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Transfer Modal & Actions State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [transferForm, setTransferForm] = useState({
    fromBranch: (currentBranch === "Sur" ? "Sur" : currentBranch === "Matriz" ? "Matriz" : "Norte") as "Matriz" | "Norte" | "Sur",
    toBranch: (currentBranch === "Sur" ? "Norte" : "Sur") as "Matriz" | "Norte" | "Sur",
    quantity: 1,
    notes: ""
  });
  const [isTransferring, setIsTransferring] = useState(false);

  const handleOpenTransferModal = (product: Product) => {
    setTransferProduct(product);
    const origin = (currentBranch === "Sur" ? "Sur" : currentBranch === "Matriz" ? "Matriz" : "Norte") as "Matriz" | "Norte" | "Sur";
    const dest = origin === "Norte" ? "Sur" : "Norte";
    setTransferForm({
      fromBranch: origin,
      toBranch: dest,
      quantity: 1,
      notes: `Traspaso inter-sucursal de ${product.name}`
    });
    setShowTransferModal(true);
  };

  const handleExecutePendingTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProduct || transferForm.quantity <= 0) return;

    setIsTransferring(true);
    try {
      const res = await createPendingStockTransfer({
        productCode: transferProduct.code || transferProduct.barcode || transferProduct.id,
        productName: transferProduct.name,
        fromBranch: transferForm.fromBranch,
        toBranch: transferForm.toBranch,
        quantity: Number(transferForm.quantity),
        userName: currentUser.name,
        userRole: currentUser.role,
        notes: transferForm.notes
      });

      if (res.success) {
        alert(res.message);
        setShowTransferModal(false);
        setTransferProduct(null);
        triggerReload();
      } else {
        alert("⚠️ " + res.message);
      }
    } catch (err: any) {
      alert("Error al solicitar traspaso: " + (err?.message || String(err)));
    } finally {
      setIsTransferring(false);
    }
  };

  const handleConfirmReceipt = async (transfer: StockTransfer) => {
    const branchNorm = (currentBranch || "").toLowerCase();
    const isReceiver = transfer.toBranch?.toLowerCase() === branchNorm;
    const isSystemAdmin = currentUser.role === UserRole.ADMIN || currentUser.role === "Administrador";

    if (!isReceiver && !isSystemAdmin) {
      alert(`⚠️ Únicamente la sucursal de destino (${transfer.toBranch}) puede confirmar la recepción física de este traspaso.`);
      return;
    }

    if (window.confirm(`¿Confirmas la recepción física de ${transfer.quantity} ${transfer.unit} de "${transfer.productName}" en la sucursal ${transfer.toBranch}?`)) {
      const res = await confirmStockTransferReceipt(transfer, currentUser.name, currentUser.role);
      alert(res.message);
      triggerReload();
    }
  };

  const handleRejectReceipt = async (transfer: StockTransfer) => {
    const branchNorm = (currentBranch || "").toLowerCase();
    const isReceiver = transfer.toBranch?.toLowerCase() === branchNorm;
    const isSystemAdmin = currentUser.role === UserRole.ADMIN || currentUser.role === "Administrador";

    if (!isReceiver && !isSystemAdmin) {
      alert(`⚠️ Únicamente la sucursal de destino (${transfer.toBranch}) puede rechazar este traspaso.`);
      return;
    }

    const reason = window.prompt(`Ingresa el motivo del rechazo del traspaso ${transfer.transferCode}:`);
    if (reason !== null) {
      const res = await rejectStockTransfer(transfer, currentUser.name, currentUser.role, reason);
      alert(res.message);
      triggerReload();
    }
  };

  // New product form
  const [newProduct, setNewProduct] = useState({
    code: "",
    barcode: "",
    sku: "",
    name: "",
    brand: "",
    category: "Abarrotes",
    subcategory: "",
    unit: ProductUnit.PIECE,
    cost: 0,
    priceMin: 0,
    priceMed: 0,
    priceMax: 0,
    priceSpecial: 0,
    stock: 0,
    stockMin: 10,
    stockMax: 100,
    location: "",
    expiryDate: "",
    supplierId: "SUPP1",
    imageUrl: "",
    tipoVenta: "pieza",
    permiteVentaFraccionada: false,
    gramajeBase: 0
  });

  // Editing state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState<number>(0);

  // Secure Product Deletion States
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // Camera state & logic for taking product photos
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Su navegador o dispositivo no tiene soporte para cámara.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      // Wait for ref to bind
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => {
            console.warn("Gracefully handled video play error:", e);
          });
        }
      }, 150);
    } catch (err: any) {
      console.warn("Camera access gracefully caught:", err);
      const errMsg = err?.message || String(err);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || errMsg.includes("Permission denied") || errMsg.includes("denied")) {
        setCameraError("Permiso de cámara denegado. Por favor, habilita el acceso en tu navegador.");
      } else {
        setCameraError(`No se pudo acceder a la cámara: ${errMsg}`);
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  const capturePhoto = (isEdit: boolean) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      if (isEdit) {
        if (editingProduct) {
          setEditingProduct({ ...editingProduct, imageUrl: dataUrl });
        }
      } else {
        setNewProduct(prev => ({ ...prev, imageUrl: dataUrl }));
      }
    }
    stopCamera();
  };

  // Adjust product stock form with live search and unit/gramaje editing
  const [adjustSearch, setAdjustSearch] = useState("");
  const [adjustMode, setAdjustMode] = useState<"direct" | "add" | "subtract" | "expired">("direct");
  const [adjustment, setAdjustment] = useState({
    productId: "",
    directStock: 0,
    quantity: 0,
    unit: ProductUnit.PIECE,
    permiteVentaFraccionada: false,
    tipoVenta: "pieza",
    gramajeBase: 0,
    notes: ""
  });

  const selectProductForAdjustment = (prod: Product) => {
    setAdjustment({
      productId: prod.id,
      directStock: prod.stock,
      quantity: 0,
      unit: prod.unit || ProductUnit.PIECE,
      permiteVentaFraccionada: Boolean(prod.permiteVentaFraccionada),
      tipoVenta: prod.tipoVenta || (prod.unit === ProductUnit.KILO ? "peso" : prod.unit === ProductUnit.LITER ? "volumen" : "pieza"),
      gramajeBase: prod.gramajeBase || 0,
      notes: ""
    });
  };

  const uniqueDepartamentos = ["Todas", ...Array.from(new Set(db.products.map((p: any) => p.departamento).filter(Boolean).sort()))];
  const uniqueCategories = ["Todas", ...Array.from(new Set(db.products.map((p: any) => p.category || p.categoria).filter(Boolean).sort()))];
  const uniqueSubcategories = ["Todas", ...Array.from(new Set(db.products.map((p: any) => p.subcategory || p.subcategoria).filter(Boolean).sort()))];
  const uniqueBrands = ["Todas", ...Array.from(new Set(db.products.map((p: any) => p.brand || p.marca).filter(Boolean).sort()))];
  const uniqueSuppliers = ["Todas", ...Array.from(new Set(db.products.map((p: any) => p.proveedorNombre || "Proveedor Directo").filter(Boolean).sort()))];
  const uniqueTipoVentas = ["Todas", "pieza", "peso", "volumen"];
  const uniqueUnidades = ["Todas", "Pza", "Kg", "L", "Paq", "g", "ml"];

  const categories = uniqueCategories;

  const triggerReload = () => {
    const freshDb = getDatabase();
    setDb(freshDb);
  };

  useEffect(() => {
    triggerReload();
  }, []);

  // Check warnings
  const isExpiredSoon = (dateStr?: string) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 15; // Expires in next 15 days
  };

  // Filter products
  const filteredProducts = db.products.filter((p: Product) => {
    // 1. Apply metric card filters if selected
    if (selectedMetricFilter === "bajo_stock") {
      if (!(p.stock <= p.stockMin)) return false;
    } else if (selectedMetricFilter === "caducidad") {
      if (!isExpiredSoon(p.expiryDate || p.fechaCaducidad)) return false;
    } else if (selectedMetricFilter === "movimientos_hoy") {
      const todayStr = new Date().toISOString().substring(0, 10);
      const hasMovement = db.movements.some((m: any) => m.productId === p.id && m.date.startsWith(todayStr));
      if (!hasMovement) return false;
    }

    // 2. Apply search text filters (Name, Code, SKU, Barcode)
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.codigo && p.codigo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.marca && p.marca.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.codigoBarras && p.codigoBarras.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    // 3. Apply category dropdown filters
    const matchesCategory = selectedCategory === "Todas" || p.category === selectedCategory || p.categoria === selectedCategory;
    if (!matchesCategory) return false;

    // 4. Apply Departamento
    const matchesDepartamento = selectedDepartamento === "Todas" || p.departamento === selectedDepartamento;
    if (!matchesDepartamento) return false;

    // 5. Apply Subcategory
    const matchesSubcategory = selectedSubcategory === "Todas" || p.subcategory === selectedSubcategory || p.subcategoria === selectedSubcategory;
    if (!matchesSubcategory) return false;

    // 6. Apply Brand / Marca
    const matchesBrand = selectedBrand === "Todas" || p.brand === selectedBrand || p.marca === selectedBrand;
    if (!matchesBrand) return false;

    // 7. Apply Supplier
    const matchesSupplier = selectedSupplier === "Todas" || p.supplierId === selectedSupplier || p.proveedorId === selectedSupplier || p.proveedorNombre === selectedSupplier;
    if (!matchesSupplier) return false;

    // 8. Apply Tipo Venta
    const matchesTipoVenta = selectedTipoVenta === "Todas" || p.tipoVenta === selectedTipoVenta;
    if (!matchesTipoVenta) return false;

    // 9. Apply Unidad
    const matchesUnidad = selectedUnidad === "Todas" || p.unit === selectedUnidad || p.unidad === selectedUnidad || p.unidadVenta === selectedUnidad;
    if (!matchesUnidad) return false;

    // 10. Apply Stock Status
    if (selectedStockStatus === "Con Stock" && p.stock <= 0) return false;
    if (selectedStockStatus === "Sin Stock" && p.stock > 0) return false;
    if (selectedStockStatus === "Bajo Stock" && p.stock > p.stockMin) return false;

    return true;
  });

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategory,
    selectedDepartamento,
    selectedSubcategory,
    selectedBrand,
    selectedSupplier,
    selectedTipoVenta,
    selectedUnidad,
    selectedStockStatus,
    selectedMetricFilter
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
            if (isEdit) {
              if (editingProduct) {
                setEditingProduct({ ...editingProduct, imageUrl: compressedDataUrl });
              }
            } else {
              setNewProduct(prev => ({ ...prev, imageUrl: compressedDataUrl }));
            }
          } else {
            const rawBase64 = event.target?.result as string;
            if (isEdit) {
              if (editingProduct) {
                setEditingProduct({ ...editingProduct, imageUrl: rawBase64 });
              }
            } else {
              setNewProduct(prev => ({ ...prev, imageUrl: rawBase64 }));
            }
          }
        };
        img.onerror = () => {
          const rawBase64 = event.target?.result as string;
          if (isEdit) {
            if (editingProduct) {
              setEditingProduct({ ...editingProduct, imageUrl: rawBase64 });
            }
          } else {
            setNewProduct(prev => ({ ...prev, imageUrl: rawBase64 }));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const database = getDatabase();
    const index = database.products.findIndex((p: Product) => p.id === editingProduct.id);
    if (index !== -1) {
      const originalProduct = database.products[index];
      let finalStock = editingProduct.stock;

      // Handle Restock Quantity first
      if (restockQty > 0) {
        const prevStock = originalProduct.stock;
        finalStock = originalProduct.stock + restockQty;
        
        // Register restock movement in database
        const movementId = "MOV" + Math.random().toString(36).substring(2, 9).toUpperCase();
        database.movements.unshift({
          id: movementId,
          productId: editingProduct.id,
          productName: editingProduct.name,
          type: MovementType.ENTRY_PURCHASE,
          quantity: restockQty,
          previousStock: prevStock,
          newStock: finalStock,
          date: new Date().toISOString().replace("T", " ").substring(0, 19),
          user: currentUser.name,
          notes: "Reabastecimiento directo desde panel de productos"
        });

        logAction(
          currentUser.name,
          currentUser.role,
          "Reabastecimiento de Producto",
          `Reabasteció ${restockQty} unidades de ${editingProduct.name}. Existencia anterior: ${prevStock}, nueva: ${finalStock}`
        );
      } else if (editingProduct.stock !== originalProduct.stock) {
        // Manual stock edit
        const diff = editingProduct.stock - originalProduct.stock;
        const type = diff > 0 ? MovementType.ENTRY_ADJUSTMENT : MovementType.EXIT_ADJUSTMENT;
        
        const movementId = "MOV" + Math.random().toString(36).substring(2, 9).toUpperCase();
        database.movements.unshift({
          id: movementId,
          productId: editingProduct.id,
          productName: editingProduct.name,
          type: type,
          quantity: Math.abs(diff),
          previousStock: originalProduct.stock,
          newStock: editingProduct.stock,
          date: new Date().toISOString().replace("T", " ").substring(0, 19),
          user: currentUser.name,
          notes: "Ajuste directo de stock desde panel de edición"
        });

        logAction(
          currentUser.name,
          currentUser.role,
          "Ajuste de Stock Manual",
          `Ajustó stock de ${editingProduct.name} de ${originalProduct.stock} a ${editingProduct.stock}`
        );
      }

      database.products[index] = {
        ...editingProduct,
        stock: finalStock,
        barcode: editingProduct.barcode || editingProduct.code,
        sku: editingProduct.sku || `SKU-${editingProduct.code}`
      };
      
      saveProductToSupabase(database.products[index], currentBranch || "Norte").catch((err) => {
        console.warn("Aviso al actualizar producto en Supabase:", err);
      });

      saveDatabase(database);
      setDb(database);
      setShowEditModal(false);
      setEditingProduct(null);
      setRestockQty(0);

      logAction(
        currentUser.name,
        currentUser.role,
        "Producto Editado",
        `Modificó datos generales de: ${editingProduct.name} [Código: ${editingProduct.code}]`
      );
    }
  };

  const getUtilityMarkup = (price: number, cost: number) => {
    if (!cost || cost <= 0) return null;
    const diff = price - cost;
    const percent = (diff / cost) * 100;
    return {
      percent: percent.toFixed(1),
      amount: diff.toFixed(2),
      isPositive: diff >= 0
    };
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const database = getDatabase();
    
    const productToAdd: Product = {
      ...newProduct,
      id: "PROD_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      barcode: newProduct.barcode || newProduct.code,
      sku: newProduct.sku || `SKU-${newProduct.code}`,
      sucursal: currentBranch || "Norte",
      almacen: currentBranch || "Norte",
      isCompound: false,
      imageUrl: newProduct.imageUrl || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
    };

    database.products.push(productToAdd);

    // Stock Movement Log
    if (productToAdd.stock > 0) {
      const movement: StockMovement = {
        id: "MOV_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        productId: productToAdd.id,
        productName: productToAdd.name,
        type: MovementType.ENTRY_ADJUSTMENT,
        quantity: productToAdd.stock,
        previousStock: 0,
        newStock: productToAdd.stock,
        date: new Date().toISOString().replace("T", " ").substring(0, 19),
        user: currentUser.name,
        notes: "Carga inicial de inventario nuevo"
      };
      database.movements.unshift(movement);
      saveMovementToSupabase(movement, currentBranch || "Norte").catch(() => {});
    }

    saveProductToSupabase(productToAdd, currentBranch || "Norte").catch((err) => {
      console.warn("Aviso al guardar producto en Supabase:", err);
    });

    saveDatabase(database);
    setDb(database);
    setShowAddModal(false);

    // Reset Form
    setNewProduct({
      code: "",
      barcode: "",
      sku: "",
      name: "",
      brand: "",
      category: "Abarrotes",
      subcategory: "",
      unit: ProductUnit.PIECE,
      cost: 0,
      priceMin: 0,
      priceMed: 0,
      priceMax: 0,
      priceSpecial: 0,
      stock: 0,
      stockMin: 10,
      stockMax: 100,
      location: "",
      expiryDate: "",
      supplierId: "SUPP1",
      imageUrl: "",
      permiteVentaFraccionada: false,
      gramajeBase: 0,
      tipoVenta: "pieza"
    });

    logAction(
      currentUser.name,
      currentUser.role,
      "Producto Creado",
      `Agregó el producto: ${productToAdd.name} [Código: ${productToAdd.code}]`
    );
  };

  const handleAdjustInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustment.productId) {
      alert("Por favor selecciona un producto para ajustar.");
      return;
    }

    const database = getDatabase();
    const prodIndex = database.products.findIndex((p: Product) => p.id === adjustment.productId);
    if (prodIndex === -1) return;

    const targetProduct = database.products[prodIndex];
    const prevStock = Number(targetProduct.stock) || 0;
    let finalStock = prevStock;
    let movType = MovementType.ENTRY_ADJUSTMENT;
    let diffQty = 0;

    if (adjustMode === "direct") {
      finalStock = Math.max(0, Number(adjustment.directStock) || 0);
      diffQty = Math.abs(finalStock - prevStock);
      movType = finalStock >= prevStock ? MovementType.ENTRY_ADJUSTMENT : MovementType.EXIT_ADJUSTMENT;
    } else if (adjustMode === "add") {
      diffQty = Math.max(0, Number(adjustment.quantity) || 0);
      finalStock = prevStock + diffQty;
      movType = MovementType.ENTRY_ADJUSTMENT;
    } else if (adjustMode === "subtract") {
      diffQty = Math.max(0, Number(adjustment.quantity) || 0);
      finalStock = Math.max(0, prevStock - diffQty);
      movType = MovementType.EXIT_ADJUSTMENT;
    } else if (adjustMode === "expired") {
      diffQty = Math.max(0, Number(adjustment.quantity) || 0);
      finalStock = Math.max(0, prevStock - diffQty);
      movType = MovementType.EXIT_EXPIRED;
    }

    // Update product stock and unit/gramaje settings
    database.products[prodIndex].stock = finalStock;
    database.products[prodIndex].unit = adjustment.unit;
    database.products[prodIndex].permiteVentaFraccionada = adjustment.permiteVentaFraccionada;
    database.products[prodIndex].tipoVenta = adjustment.tipoVenta;
    database.products[prodIndex].gramajeBase = adjustment.gramajeBase;

    // Movement Register
    const mov: StockMovement = {
      id: "MOV_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      productId: targetProduct.id,
      productName: targetProduct.name,
      type: movType,
      quantity: diffQty || 1,
      previousStock: prevStock,
      newStock: finalStock,
      date: new Date().toISOString().replace("T", " ").substring(0, 19),
      user: currentUser.name,
      notes: adjustment.notes || (adjustMode === "direct" ? `Ajuste físico de stock a ${finalStock} ${adjustment.unit}` : `Ajuste manual de inventario (${adjustMode})`)
    };

    database.movements.unshift(mov);
    
    saveProductToSupabase(database.products[prodIndex], currentBranch || "Norte").catch((err) => {
      console.warn("Aviso al actualizar stock de producto en Supabase:", err);
    });
    saveMovementToSupabase(mov, currentBranch || "Norte").catch(() => {});

    saveDatabase(database);
    setDb(database);
    setShowAdjustModal(false);

    logAction(
      currentUser.name,
      currentUser.role,
      "Ajuste de Inventario",
      `Ajustó producto ${targetProduct.name} [Stock: ${prevStock} -> ${finalStock} ${adjustment.unit}, Gramaje: ${adjustment.gramajeBase || 0}g, Tipo: ${adjustment.tipoVenta}]`
    );

    // Reset Adjustment state
    setAdjustSearch("");
    setAdjustMode("direct");
    setAdjustment({
      productId: "",
      directStock: 0,
      quantity: 0,
      unit: ProductUnit.PIECE,
      permiteVentaFraccionada: false,
      tipoVenta: "pieza",
      gramajeBase: 0,
      notes: ""
    });
  };

  const handleDeletePrompt = (product: Product) => {
    setProductToDelete(product);
    setAdminPassword("");
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    // Verify admin authorization server-side
    const authRes = await authenticateStaff("admin", adminPassword);
    if (!authRes.success) {
      setDeleteError("⚠️ Contraseña de administrador incorrecta");
      return;
    }

    // Eliminar permanentemente de Supabase Cloud
    deleteProductFromSupabase(productToDelete.id).catch((err) => {
      console.warn("Aviso al eliminar producto de Supabase:", err);
    });

    const database = getDatabase();
    database.products = database.products.filter((p: Product) => p.id !== productToDelete.id);
    
    // Register kárdex movement (EXIT adjustment)
    const mov: StockMovement = {
      id: "MOV_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      productId: productToDelete.id,
      productName: productToDelete.name,
      type: MovementType.EXIT_ADJUSTMENT,
      quantity: productToDelete.stock,
      previousStock: productToDelete.stock,
      newStock: 0,
      date: new Date().toISOString().replace("T", " ").substring(0, 19),
      user: currentUser.name,
      notes: "Producto eliminado definitivamente del catálogo por el administrador"
    };
    database.movements.unshift(mov);
    saveMovementToSupabase(mov, currentBranch || "Norte").catch(() => {});
    
    saveDatabase(database);
    setDb(database);
    setShowDeleteModal(false);
    setProductToDelete(null);

    logAction(
      currentUser.name,
      currentUser.role,
      "Eliminación de Producto",
      `Eliminó del catálogo el producto: ${productToDelete.name} [Código: ${productToDelete.code}]`
    );
  };

  return (
    <div className="space-y-6" id="inventory-module-container">
      {/* Overview Cards */}
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Card 1: Total SKU */}
        <div 
          onClick={() => setSelectedMetricFilter("todas")}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs flex items-center gap-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${
            selectedMetricFilter === "todas" 
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10" 
              : "border-gray-150 dark:border-slate-800"
          }`}
          title="Ver todos los productos"
        >
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
              <span>Total Productos</span>
              {selectedMetricFilter === "todas" && <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />}
            </p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">{db.products.length} SKU</h4>
          </div>
        </div>

        {/* Card 2: Stock Crítico / Bajo */}
        <div 
          onClick={() => setSelectedMetricFilter("bajo_stock")}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs flex items-center gap-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${
            selectedMetricFilter === "bajo_stock" 
              ? "border-red-500 ring-2 ring-red-500/20 bg-red-50/10 dark:bg-red-950/10" 
              : "border-gray-150 dark:border-slate-800"
          }`}
          title="Ver productos con existencias por debajo del mínimo"
        >
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
              <span>Stock Crítico / Bajo</span>
              {selectedMetricFilter === "bajo_stock" && <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />}
            </p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              {db.products.filter((p: Product) => p.stock <= p.stockMin).length} Productos
            </h4>
          </div>
        </div>

        {/* Card 3: Caducidad Próxima */}
        <div 
          onClick={() => setSelectedMetricFilter("caducidad")}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs flex items-center gap-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${
            selectedMetricFilter === "caducidad" 
              ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/10 dark:bg-amber-950/10" 
              : "border-gray-150 dark:border-slate-800"
          }`}
          title="Ver productos perecederos próximos a caducar en 15 días"
        >
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-slate-850 text-amber-600 dark:text-amber-400">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
              <span>Caducidad Próxima</span>
              {selectedMetricFilter === "caducidad" && <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />}
            </p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              {db.products.filter((p: Product) => isExpiredSoon(p.expiryDate)).length} Lotes
            </h4>
          </div>
        </div>

        {/* Card 4: Movimientos Hoy */}
        <div 
          onClick={() => setSelectedMetricFilter("movimientos_hoy")}
          className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs flex items-center gap-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${
            selectedMetricFilter === "movimientos_hoy" 
              ? "border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/10 dark:bg-teal-950/10" 
              : "border-gray-150 dark:border-slate-800"
          }`}
          title="Ver productos con movimientos registrados el día de hoy"
        >
          <div className="p-3 rounded-lg bg-teal-50 dark:bg-slate-850 text-teal-600 dark:text-teal-400">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono flex items-center gap-1.5">
              <span>Movimientos Hoy</span>
              {selectedMetricFilter === "movimientos_hoy" && <span className="h-2 w-2 rounded-full bg-teal-500 inline-block" />}
            </p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">
              {db.movements.length} Registros
            </h4>
          </div>
        </div>

      </div>

      {/* Filter notification to orient the user ("que me enseñe de donde estan") */}
      {selectedMetricFilter !== "todas" && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
          selectedMetricFilter === "bajo_stock"
            ? "bg-red-50 dark:bg-red-950/15 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-400"
            : selectedMetricFilter === "caducidad"
            ? "bg-amber-50 dark:bg-amber-950/15 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-450"
            : "bg-teal-50 dark:bg-teal-950/15 border-teal-200 dark:border-teal-900/40 text-teal-800 dark:text-teal-400"
        }`}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                selectedMetricFilter === "bajo_stock" ? "bg-red-450" : selectedMetricFilter === "caducidad" ? "bg-amber-450" : "bg-teal-450"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                selectedMetricFilter === "bajo_stock" ? "bg-red-500" : selectedMetricFilter === "caducidad" ? "bg-amber-500" : "bg-teal-500"
              }`}></span>
            </span>
            <span>
              {selectedMetricFilter === "bajo_stock" && (
                <>Filtro Activo: Mostrando únicamente productos de <strong>Stock Crítico / Bajo</strong> (stock actual menor o igual que su stock mínimo configurado).</>
              )}
              {selectedMetricFilter === "caducidad" && (
                <>Filtro Activo: Mostrando únicamente productos con <strong>Caducidad Próxima</strong> (lotes que vencen en los siguientes 15 días).</>
              )}
              {selectedMetricFilter === "movimientos_hoy" && (
                <>Filtro Activo: Mostrando únicamente productos con <strong>Movimientos de Almacén Registrados Hoy</strong> en el Kárdex.</>
              )}
            </span>
          </div>
          <button 
            onClick={() => setSelectedMetricFilter("todas")}
            className="px-2.5 py-1 rounded bg-white dark:bg-slate-850 hover:bg-gray-50 dark:hover:bg-slate-800 border text-[10px] font-bold shadow-xs cursor-pointer transition-all uppercase"
          >
            Ver Todo
          </button>
        </div>
      )}
      {/* REAL-TIME PENDING TRANSFERS DOUBLE-CONFIRMATION WIDGET */}
      {(() => {
        const branchNormalized = (currentBranch || "Norte").toLowerCase();
        
        // Traspasos entrantes: Esta sucursal es el DESTINO y debe verificar/confirmar
        const incomingTransfers = (db.stockTransfers || []).filter(
          (t: StockTransfer) => 
            t.status === "PENDIENTE_RECEPCION" && 
            t.toBranch?.toLowerCase() === branchNormalized
        );

        // Traspasos salientes: Esta sucursal es el ORIGEN y está en espera de que el destino confirme
        const outgoingTransfers = (db.stockTransfers || []).filter(
          (t: StockTransfer) => 
            t.status === "PENDIENTE_RECEPCION" && 
            t.fromBranch?.toLowerCase() === branchNormalized
        );

        if (incomingTransfers.length === 0 && outgoingTransfers.length === 0) return null;

        return (
          <div className="space-y-3">
            {/* Panel para la sucursal receptora: Confirmar Recepción */}
            {incomingTransfers.length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 dark:bg-amber-950/20 shadow-sm space-y-3 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-bounce" />
                    <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                      Traspasos Entrantes Pendientes de Confirmar Recepción ({incomingTransfers.length})
                    </h4>
                  </div>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 font-mono italic">
                    🔒 Confirma la llegada física de la mercancía para ingresarla a tu inventario
                  </span>
                </div>

                <div className="space-y-2">
                  {incomingTransfers.map((transfer: StockTransfer) => (
                    <div 
                      key={transfer.id} 
                      className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded">
                            {transfer.transferCode}
                          </span>
                          <span className="font-bold text-xs text-gray-800 dark:text-slate-200">
                            {transfer.quantity} {transfer.unit} de "{transfer.productName}"
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">
                          Origen: <strong>{transfer.fromBranch}</strong> ➔ Destino: <strong>{transfer.toBranch}</strong> | Despachado por: {transfer.dispatchedBy} el {transfer.dispatchDate}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleConfirmReceipt(transfer)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" /> Confirmar Recepción
                        </button>
                        <button
                          onClick={() => handleRejectReceipt(transfer)}
                          className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Panel informativo para la sucursal de origen: En tránsito hacia destino */}
            {outgoingTransfers.length > 0 && (
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-300 dark:border-blue-900/40 dark:bg-blue-950/20 shadow-xs space-y-2.5">
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 text-xs font-extrabold uppercase">
                  <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>Traspasos Enviados en Tránsito ({outgoingTransfers.length})</span>
                </div>
                <div className="space-y-1.5">
                  {outgoingTransfers.map((transfer: StockTransfer) => (
                    <div key={transfer.id} className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-blue-200 dark:border-blue-900/30 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-300 mr-2">{transfer.transferCode}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{transfer.quantity} {transfer.unit} de "{transfer.productName}"</span>
                        <span className="text-[10px] text-slate-500 ml-2 font-mono">➔ Enviado hacia {transfer.toBranch}</span>
                      </div>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded font-mono font-bold">
                        ⏳ Esperando confirmación de {transfer.toBranch}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 1. Primary Table Sticky Search Bar & Actions (Sticky únicamente al buscador) */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 sm:p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, código, sku, código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              id="inventory-search-input"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="w-full md:w-auto flex flex-wrap gap-2 sm:gap-3 justify-end shrink-0">
            <button
              onClick={() => {
                setSelectedCategory("Todas");
                setSelectedDepartamento("Todas");
                setSelectedSubcategory("Todas");
                setSelectedBrand("Todas");
                setSelectedSupplier("Todas");
                setSelectedTipoVenta("Todas");
                setSelectedUnidad("Todas");
                setSelectedStockStatus("Todas");
                setSearchTerm("");
              }}
              className="px-3 py-2 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Limpiar todos los filtros"
            >
              Limpiar Filtros
            </button>

            <button
              onClick={() => setShowAdjustModal(true)}
              className="px-4 py-2 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              id="adjust-stock-btn"
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> Ajustar Stock
            </button>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              id="add-product-btn"
            >
              <Plus className="h-4 w-4" /> Nuevo Producto
            </button>
          </div>
        </div>
      </div>

      {/* 2. Advanced filters Grid (Non-sticky) */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 bg-gray-50 dark:bg-slate-850/50 p-3 rounded-lg border border-gray-100 dark:border-slate-800/60">
          
          {/* Depto */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Depto</label>
            <select
              value={selectedDepartamento}
              onChange={(e) => setSelectedDepartamento(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueDepartamentos.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Categoría</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
              id="inventory-category-select"
            >
              {uniqueCategories.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Subcategoría */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Subcat</label>
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueSubcategories.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Marca */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Marca</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueBrands.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Proveedor */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Proveedor</label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueSuppliers.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Tipo Venta */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Tipo Venta</label>
            <select
              value={selectedTipoVenta}
              onChange={(e) => setSelectedTipoVenta(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueTipoVentas.map(val => (
                <option key={val} value={val}>{val === "Todas" ? "Todas" : val.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Unidad */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Unidad</label>
            <select
              value={selectedUnidad}
              onChange={(e) => setSelectedUnidad(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              {uniqueUnidades.map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Existencias */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-mono font-bold text-gray-450 dark:text-gray-400">Stock</label>
            <select
              value={selectedStockStatus}
              onChange={(e) => setSelectedStockStatus(e.target.value)}
              className="w-full text-xs rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white p-1.5 focus:outline-none"
            >
              <option value="Todas">Todas</option>
              <option value="Con Stock">Con Stock</option>
              <option value="Sin Stock">Sin Stock</option>
              <option value="Bajo Stock">Bajo Stock</option>
            </select>
          </div>

        </div>
      </div>

      {/* Catalog Listing Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="inventory-table">
            <thead>
              <tr className="border-b border-gray-150 dark:border-slate-800 bg-gray-50 dark:bg-slate-850 text-[11px] uppercase tracking-wider text-gray-500 font-mono">
                <th className="px-5 py-3">Código / Producto</th>
                <th className="px-4 py-3">Categoría</th>
                {isAdmin && <th className="px-4 py-3">Costo</th>}
                <th className="px-4 py-3">Precios (Min/Med/Max)</th>
                <th className="px-4 py-3 text-center">Existencia</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Caducidad</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-xs">
              {paginatedProducts.map((prod) => {
                const isStockLow = prod.stock <= prod.stockMin;
                const isCritical = prod.stock <= 2;
                const expirySoon = isExpiredSoon(prod.expiryDate);

                return (
                  <tr 
                    key={prod.id} 
                    className="hover:bg-gray-50/50 dark:hover:bg-slate-850/40 transition-colors"
                    id={`inventory-row-${prod.id}`}
                  >
                    
                    {/* Title and Thumbnail */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover border border-gray-200 dark:border-slate-800 bg-gray-50"
                        />
                        <div>
                          <p className="font-bold text-gray-800 dark:text-slate-100">{prod.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            Cod: {prod.code} | SKU: {prod.sku}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 font-medium">
                          {prod.category}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-1">{prod.subcategory}</p>
                      </div>
                    </td>

                    {/* Cost */}
                    {isAdmin && (
                      <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-slate-400">
                        ${formatPrice(prod.cost)}
                      </td>
                    )}

                     {/* Prices & Margins */}
                     <td className="px-4 py-3.5">
                       <div className="font-mono space-y-1">
                         <div className="flex flex-col">
                           <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                             ${formatPrice(prod.priceMin)} <span className="text-[9px] font-normal text-gray-400">(Men)</span>
                           </span>
                           {isAdmin && (
                             <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
                               Ganancia: +${formatPrice(prod.priceMin - prod.cost)} ({prod.cost > 0 ? (((prod.priceMin - prod.cost) / prod.cost) * 100).toFixed(1) : 0}%)
                             </span>
                           )}
                         </div>
                         <div className="flex flex-col border-t border-gray-100 dark:border-slate-800/60 pt-0.5">
                           <span className="text-gray-600 dark:text-slate-300 text-[10px]">
                             ${formatPrice(prod.priceMed)} <span className="text-[9px] font-normal text-gray-400">(Med)</span>
                           </span>
                           {isAdmin && (
                             <span className="text-[9px] text-teal-600 dark:text-teal-400">
                               Ganancia: +${formatPrice(prod.priceMed - prod.cost)} ({prod.cost > 0 ? (((prod.priceMed - prod.cost) / prod.cost) * 100).toFixed(1) : 0}%)
                             </span>
                           )}
                         </div>
                         <div className="flex flex-col border-t border-gray-100 dark:border-slate-800/60 pt-0.5">
                           <span className="text-gray-600 dark:text-slate-300 text-[10px]">
                             ${formatPrice(prod.priceMax)} <span className="text-[9px] font-normal text-gray-400">(May)</span>
                           </span>
                           {isAdmin && (
                             <span className="text-[9px] text-amber-600 dark:text-amber-400">
                               Ganancia: +${formatPrice(prod.priceMax - prod.cost)} ({prod.cost > 0 ? (((prod.priceMax - prod.cost) / prod.cost) * 100).toFixed(1) : 0}%)
                             </span>
                           )}
                         </div>
                         <div className="flex flex-col border-t border-gray-100 dark:border-slate-800/60 pt-0.5">
                           <span className="text-purple-600 dark:text-purple-400 text-[10px] font-bold">
                             ${formatPrice(prod.priceSpecial || prod.priceMax)} <span className="text-[9px] font-normal text-gray-400">(Dist)</span>
                           </span>
                         </div>
                       </div>
                     </td>

                    {/* Stock */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center">
                        <span 
                          className={`font-mono text-sm font-black px-2.5 py-1 rounded-md border ${
                            prod.stock <= 0 
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50" 
                              : isStockLow 
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50 animate-pulse" 
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50"
                          }`}
                          id={`stock-badge-${prod.id}`}
                        >
                          {prod.stock} {prod.unit}
                        </span>
                        <div className="text-[10px] text-gray-400 font-mono mt-1">
                          Min: {prod.stockMin} | Max: {prod.stockMax}
                        </div>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        <span>{prod.location || "Sin asignar"}</span>
                      </div>
                    </td>

                    {/* Expiry */}
                    <td className="px-4 py-3.5">
                      {prod.expiryDate ? (
                        <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                          expirySoon 
                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse" 
                            : "text-gray-500 dark:text-slate-400"
                        }`}>
                          {prod.expiryDate}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-slate-600 font-mono text-[11px]">N/A</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedProduct(prod);
                            setShowDetailModal(true);
                          }}
                          className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Ver Ficha Técnica"
                          id={`view-prod-btn-${prod.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingProduct({
                              ...prod,
                              permiteVentaFraccionada: prod.permiteVentaFraccionada ?? (prod.unit === ProductUnit.KILO || prod.unit === ProductUnit.LITER),
                              tipoVenta: prod.tipoVenta || (prod.unit === ProductUnit.KILO ? "peso" : prod.unit === ProductUnit.LITER ? "volumen" : "pieza"),
                              gramajeBase: prod.gramajeBase || (prod.unit === ProductUnit.KILO ? 1000 : 0)
                            });
                            setShowEditModal(true);
                          }}
                          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Editar Producto"
                          id={`edit-prod-btn-${prod.id}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleOpenTransferModal(prod)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Traspasar producto a otra sucursal"
                          id={`transfer-prod-btn-${prod.id}`}
                        >
                          <Truck className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleDeletePrompt(prod)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar Producto"
                          id={`delete-prod-btn-${prod.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    Ningún producto coincide con el filtro o búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 sm:p-4 bg-gray-50 dark:bg-slate-850/60 border-t border-gray-150 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 dark:text-slate-400 font-mono text-[11px]">
              Mostrando {filteredProducts.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredProducts.length)} de {filteredProducts.length} productos
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-gray-400 font-medium">Por página:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Página Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold font-mono text-xs border border-emerald-200/60 dark:border-emerald-800/50">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Página Siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- ADD PRODUCT MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-600" /> Crear Nuevo Producto en Catálogo
              </h3>
              <button onClick={() => { stopCamera(); setShowAddModal(false); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Nombre Comercial</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Yogurt Lala Griego 1kg"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Código de Barras / SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 750100020111"
                    value={newProduct.code}
                    onChange={(e) => setNewProduct({ ...newProduct, code: e.target.value, barcode: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Categoría</label>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {categories.filter(c => c !== "Todas").map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Subcategoría</label>
                  <input
                    type="text"
                    placeholder="Ej. Leches, Yogures, etc."
                    value={newProduct.subcategory}
                    onChange={(e) => setNewProduct({ ...newProduct, subcategory: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Marca</label>
                  <input
                    type="text"
                    placeholder="Ej. Lala, Gamesa, Bimbo"
                    value={newProduct.brand}
                    onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Unidad de Medida</label>
                  <select
                    value={newProduct.unit}
                    onChange={(e) => {
                      const u = e.target.value as any;
                      const isBulk = u === ProductUnit.KILO || u === ProductUnit.LITER;
                      setNewProduct({
                        ...newProduct,
                        unit: u,
                        ...(isBulk ? {
                          permiteVentaFraccionada: true,
                          tipoVenta: u === ProductUnit.KILO ? "peso" : "volumen",
                          gramajeBase: newProduct.gramajeBase || 1000
                        } : {})
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {Object.values(ProductUnit)
                      .filter(u => u !== ProductUnit.GRAM && u !== ProductUnit.ML)
                      .map(u => (
                        <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* --- SECCIÓN GRAMAJE Y CONVERSIÓN DE PESO / VOLUMEN --- */}
                <div className="col-span-1 sm:col-span-2 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-emerald-600" />
                      Venta por Gramaje, Peso o Fracción (Granel)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(newProduct.permiteVentaFraccionada)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewProduct({
                            ...newProduct,
                            permiteVentaFraccionada: checked,
                            tipoVenta: checked ? (newProduct.tipoVenta && newProduct.tipoVenta !== "pieza" ? newProduct.tipoVenta : "peso") : "pieza"
                          });
                        }}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                      <span>Habilitar Venta Fraccionada / Granel</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                        Gramaje / Contenido Base (ej. 1000g, 500g, 250g)
                      </label>
                      <input
                        type="number"
                        placeholder="Ej. 1000 para 1 Kg, 250 para 1/4"
                        value={newProduct.gramajeBase || ""}
                        onChange={(e) => setNewProduct({ ...newProduct, gramajeBase: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                        Tipo de Venta
                      </label>
                      <select
                        value={newProduct.tipoVenta || (newProduct.permiteVentaFraccionada ? "peso" : "pieza")}
                        onChange={(e) => {
                          const newTipo = e.target.value;
                          setNewProduct({
                            ...newProduct,
                            tipoVenta: newTipo,
                            permiteVentaFraccionada: newTipo !== "pieza" ? true : newProduct.permiteVentaFraccionada
                          });
                        }}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      >
                        <option value="pieza">Por Pieza / Empaque</option>
                        <option value="peso">Por Peso (Kilos / Gramos)</option>
                        <option value="volumen">Por Volumen (Litros / ml)</option>
                      </select>
                    </div>
                  </div>

                  {/* Informative Price Breakdown Table across all Price Tiers */}
                  {(newProduct.priceMin > 0 || newProduct.priceMed > 0 || newProduct.priceMax > 0) && (newProduct.unit === ProductUnit.KILO || newProduct.tipoVenta === "peso" || newProduct.permiteVentaFraccionada) && (
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs space-y-2">
                      <p className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center justify-between">
                        <span>💡 Tabla de Conversión x Gramaje según Precio de Venta:</span>
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-emerald-200 dark:border-emerald-800/60 text-gray-500 font-sans text-[10px]">
                              <th className="py-1 px-1.5">Esquema</th>
                              <th className="py-1 px-1.5">Precio/Kg</th>
                              <th className="py-1 px-1.5 text-emerald-600 dark:text-emerald-400">1 Gramo ($/g)</th>
                              <th className="py-1 px-1.5">1/4 Kg (250g)</th>
                              <th className="py-1 px-1.5">1/2 Kg (500g)</th>
                              <th className="py-1 px-1.5 font-bold">1 Kg (1000g)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {newProduct.priceMin > 0 && (
                              <tr className="border-b border-gray-100 dark:border-slate-800">
                                <td className="py-1 px-1.5 font-bold text-emerald-700 dark:text-emerald-400">Menudeo</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMin.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-emerald-600 dark:text-emerald-400 font-bold">${(newProduct.priceMin / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMin * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMin * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMin.toFixed(2)}</td>
                              </tr>
                            )}
                            {newProduct.priceMed > 0 && (
                              <tr className="border-b border-gray-100 dark:border-slate-800">
                                <td className="py-1 px-1.5 font-bold text-blue-700 dark:text-blue-400">Medio Mayoreo</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMed.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-blue-600 dark:text-blue-400 font-bold">${(newProduct.priceMed / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMed * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMed * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMed.toFixed(2)}</td>
                              </tr>
                            )}
                            {newProduct.priceMax > 0 && (
                              <tr>
                                <td className="py-1 px-1.5 font-bold text-amber-700 dark:text-amber-400">Mayoreo</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMax.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-amber-600 dark:text-amber-400 font-bold">${(newProduct.priceMax / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMax * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(newProduct.priceMax * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${newProduct.priceMax.toFixed(2)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Costo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={newProduct.cost === 0 ? "" : newProduct.cost}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewProduct({
                        ...newProduct,
                        cost: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Menudeo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={newProduct.priceMin === 0 ? "" : newProduct.priceMin}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewProduct({
                        ...newProduct,
                        priceMin: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(newProduct.priceMin, newProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Medio Mayoreo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={newProduct.priceMed === 0 ? "" : newProduct.priceMed}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewProduct({
                        ...newProduct,
                        priceMed: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(newProduct.priceMed, newProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Mayoreo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={newProduct.priceMax === 0 ? "" : newProduct.priceMax}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewProduct({
                        ...newProduct,
                        priceMax: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(newProduct.priceMax, newProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ej. 100"
                    value={newProduct.stock === 0 ? "" : newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Stock Mínimo (Alerta)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Ej. 10"
                    value={newProduct.stockMin === 0 ? "" : newProduct.stockMin}
                    onChange={(e) => setNewProduct({ ...newProduct, stockMin: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Ubicación en Estante</label>
                  <input
                    type="text"
                    placeholder="Ej. Pasillo 3, Estante C"
                    value={newProduct.location}
                    onChange={(e) => setNewProduct({ ...newProduct, location: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Fecha de Caducidad (Opcional)</label>
                  <input
                    type="date"
                    value={newProduct.expiryDate}
                    onChange={(e) => setNewProduct({ ...newProduct, expiryDate: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="col-span-1 sm:col-span-2 border-t border-dashed border-gray-150 dark:border-slate-800 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-gray-750 dark:text-slate-200 flex items-center gap-2">
                    <Camera className="h-4 w-4 text-emerald-600" /> Opciones de Imagen del Producto
                  </h4>
                  <p className="text-[11px] text-gray-500 leading-normal">
                    Puedes ingresar un link web directo, subir una foto de tu dispositivo o tomar una captura en tiempo real con tu cámara.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Link de Google / Internet */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-mono">1. Link de Google / Internet</span>
                      <input
                        type="url"
                        placeholder="Pegar enlace (https://...)"
                        value={newProduct.imageUrl}
                        onChange={(e) => setNewProduct({ ...newProduct, imageUrl: e.target.value.trim() })}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      />
                      <p className="text-[9px] text-gray-400 leading-tight">Pega el link directo a la imagen. Debe terminar en JPG, PNG o WEBP. Si la imagen externa no carga en la vista previa, te sugerimos subirla como archivo desde tu dispositivo.</p>
                    </div>

                    {/* Subir archivo */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider font-mono">2. Subir Archivo</span>
                        <p className="text-[9px] text-gray-400 leading-tight mt-1">Sube archivos JPG, PNG, o WEBP desde tu disco duro o galería celular.</p>
                      </div>
                      <label className="cursor-pointer flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-750 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors border border-gray-200 dark:border-slate-700 w-full mt-2">
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Elegir Archivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileChange(e, false)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Tomar Foto */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider font-mono">3. Tomar Foto (Cámara)</span>
                        <p className="text-[9px] text-gray-400 leading-tight mt-1">Usa la cámara trasera o delantera integrada para retratar el producto.</p>
                      </div>
                      {isCameraActive ? (
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 w-full mt-2 cursor-pointer"
                        >
                          Apagar Cámara
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 w-full mt-2 cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5" /> Activar Cámara
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Camera Error Message */}
                  {cameraError && (
                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-xs font-semibold mt-3 space-y-1">
                      <p className="flex items-center gap-1">⚠️ {cameraError}</p>
                    </div>
                  )}

                  {/* Camera Live Stream */}
                  {isCameraActive && (
                    <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50/10 dark:bg-amber-950/10 space-y-3 mt-3">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                        <span className="animate-pulse h-2 w-2 rounded-full bg-red-500"></span> Cámara Activa
                      </p>
                      <div className="relative mx-auto max-w-xs rounded-xl overflow-hidden border border-gray-300 bg-black aspect-video flex items-center justify-center">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => capturePhoto(false)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Tomar Foto
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preview section */}
                  {newProduct.imageUrl && (
                    <div className="flex items-center gap-3.5 p-3.5 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-xl border border-emerald-150 dark:border-emerald-900/30 w-fit">
                      <img 
                        src={newProduct.imageUrl} 
                        alt="preview" 
                        className="h-16 w-16 object-cover rounded-lg border border-gray-200 dark:border-slate-800 bg-white" 
                        referrerPolicy="no-referrer" 
                      />
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-slate-200">Vista previa cargada</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[200px]">Enlace detectado e indexado</p>
                        <button
                          type="button"
                          onClick={() => setNewProduct({ ...newProduct, imageUrl: "" })}
                          className="text-[10px] font-semibold text-red-500 hover:text-red-750 mt-1 block cursor-pointer"
                        >
                          Eliminar Imagen
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { stopCamera(); setShowAddModal(false); }}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-450 hover:bg-gray-50 dark:hover:bg-slate-850 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Registrar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADJUST STOCK MODAL --- */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850 max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <ArrowUpDown className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">
                    Ajustar Stock y Gramaje de Producto
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Búsqueda ágil, conteo físico directo y configuración de peso/unidad
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowAdjustModal(false);
                  setAdjustSearch("");
                }} 
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustInventory} className="flex-1 overflow-y-auto py-3.5 space-y-4 pr-1">
              
              {/* 1. BUSCADOR INTERACTIVO EN TIEMPO REAL */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-emerald-600" />
                  1. Buscar Producto a Ajustar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Escribe nombre, código de barras, marca o SKU..."
                    value={adjustSearch}
                    onChange={(e) => setAdjustSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                    autoFocus
                  />
                  {adjustSearch && (
                    <button
                      type="button"
                      onClick={() => setAdjustSearch("")}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Instant Suggestions Dropdown / List */}
                {adjustSearch.trim().length > 0 && !adjustment.productId && (
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-850 shadow-lg divide-y divide-gray-100 dark:divide-slate-800">
                    {(db.products || [])
                      .filter((p: Product) => {
                        const q = adjustSearch.trim().toLowerCase();
                        return (
                          (p.name || "").toLowerCase().includes(q) ||
                          (p.code || "").toLowerCase().includes(q) ||
                          (p.barcode || "").toLowerCase().includes(q) ||
                          (p.brand || "").toLowerCase().includes(q) ||
                          (p.category || "").toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8)
                      .map((prod: Product) => (
                        <div
                          key={prod.id}
                          onClick={() => selectProductForAdjustment(prod)}
                          className="p-2.5 hover:bg-emerald-50/70 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between gap-3 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover bg-white shrink-0 border border-gray-200 dark:border-slate-700" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {prod.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 truncate">
                              <p className="font-bold text-gray-900 dark:text-slate-100 truncate">{prod.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">Ref: {prod.code} • {prod.brand || prod.category}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                            Stock: {prod.stock} {prod.unit}
                          </span>
                        </div>
                      ))}
                    {(db.products || []).filter((p: Product) => {
                      const q = adjustSearch.trim().toLowerCase();
                      return (
                        (p.name || "").toLowerCase().includes(q) ||
                        (p.code || "").toLowerCase().includes(q) ||
                        (p.barcode || "").toLowerCase().includes(q)
                      );
                    }).length === 0 && (
                      <div className="p-3 text-center text-xs text-gray-400">
                        No se encontró ningún producto con "{adjustSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PRODUCT SELECTOR (OR CURRENTLY SELECTED PRODUCT CARD) */}
              {(() => {
                const currentProd = (db.products || []).find((p: Product) => p.id === adjustment.productId);

                if (!currentProd) {
                  return (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">O selecciona de la lista general:</label>
                      <select
                        value={adjustment.productId}
                        onChange={(e) => {
                          const p = (db.products || []).find((x: Product) => x.id === e.target.value);
                          if (p) selectProductForAdjustment(p);
                        }}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">-- Selecciona un producto para comenzar --</option>
                        {(db.products || []).map((p: Product) => (
                          <option key={p.id} value={p.id}>{p.name} (Stock Actual: {p.stock} {p.unit})</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                const prevStock = Number(currentProd.stock) || 0;
                let resultingStock = prevStock;
                if (adjustMode === "direct") {
                  resultingStock = Math.max(0, Number(adjustment.directStock) || 0);
                } else if (adjustMode === "add") {
                  resultingStock = prevStock + (Number(adjustment.quantity) || 0);
                } else if (adjustMode === "subtract" || adjustMode === "expired") {
                  resultingStock = Math.max(0, prevStock - (Number(adjustment.quantity) || 0));
                }

                return (
                  <div className="space-y-4">
                    
                    {/* Selected Product Card Banner */}
                    <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-850 dark:to-slate-800 rounded-xl border border-emerald-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {currentProd.imageUrl ? (
                          <img src={currentProd.imageUrl} alt="" className="h-11 w-11 rounded-lg object-cover bg-white shrink-0 border border-emerald-300 dark:border-slate-600" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="h-11 w-11 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                            {currentProd.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-xs text-gray-900 dark:text-white truncate">{currentProd.name}</h4>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">Código: {currentProd.code} • Cat: {currentProd.category}</p>
                          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Existencia Actual: {prevStock} {currentProd.unit}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustment({
                            productId: "",
                            directStock: 0,
                            quantity: 0,
                            unit: ProductUnit.PIECE,
                            permiteVentaFraccionada: false,
                            tipoVenta: "pieza",
                            gramajeBase: 0,
                            notes: ""
                          });
                          setAdjustSearch("");
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 rounded-lg border border-gray-200 dark:border-slate-600 shrink-0 cursor-pointer"
                      >
                        Cambiar Producto
                      </button>
                    </div>

                    {/* 2. MODO DE AJUSTE */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-700 dark:text-slate-300 block">
                        2. Modo de Ajuste de Stock
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setAdjustMode("direct")}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            adjustMode === "direct"
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "text-gray-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span>Fijar Conteo Físico</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustMode("add")}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            adjustMode === "add"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-gray-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span>Sumar (+)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustMode("subtract")}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            adjustMode === "subtract"
                              ? "bg-amber-600 text-white shadow-xs"
                              : "text-gray-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span>Restar (-)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustMode("expired")}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            adjustMode === "expired"
                              ? "bg-rose-600 text-white shadow-xs"
                              : "text-gray-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span>Caducidad (-)</span>
                        </button>
                      </div>

                      {/* Inputs depending on adjustMode */}
                      {adjustMode === "direct" ? (
                        <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl space-y-2">
                          <label className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block">
                            Existencia Física Real (Conteo):
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              required
                              value={adjustment.directStock === 0 ? "" : adjustment.directStock}
                              onChange={(e) => setAdjustment({ ...adjustment, directStock: parseFloat(e.target.value) || 0 })}
                              className="w-full text-sm font-bold font-mono rounded-lg border border-emerald-300 dark:border-emerald-800 p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                              placeholder="Ej. 50"
                            />
                            <span className="text-xs font-bold text-gray-500 font-mono shrink-0">{adjustment.unit}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
                          <label className="text-xs font-bold text-gray-700 dark:text-slate-300 block">
                            Cantidad a {adjustMode === "add" ? "Sumar (+)" : "Restar (-)"}:
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              required
                              value={adjustment.quantity === 0 ? "" : adjustment.quantity}
                              onChange={(e) => setAdjustment({ ...adjustment, quantity: parseFloat(e.target.value) || 0 })}
                              className="w-full text-sm font-bold font-mono rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                              placeholder="Ej. 10"
                            />
                            <span className="text-xs font-bold text-gray-500 font-mono shrink-0">{adjustment.unit}</span>
                          </div>
                          <div className="flex gap-1.5 pt-1">
                            {[1, 5, 10, 20, 50].map((num) => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setAdjustment({ ...adjustment, quantity: (adjustment.quantity || 0) + num })}
                                className="px-2 py-0.5 text-[10px] font-bold bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded hover:bg-gray-100 cursor-pointer"
                              >
                                +{num}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. EDICIÓN DE UNIDAD Y GRAMAJE (PIEZA, LITRO, KG) */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-emerald-600" />
                          3. Unidad de Medida y Gramaje
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-gray-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={Boolean(adjustment.permiteVentaFraccionada)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAdjustment({
                                ...adjustment,
                                permiteVentaFraccionada: checked,
                                tipoVenta: checked ? (adjustment.tipoVenta !== "pieza" ? adjustment.tipoVenta : "peso") : "pieza"
                              });
                            }}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                          />
                          <span>Venta a Granel / Fraccionada</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        
                        {/* Selector de Unidad */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Unidad Principal</label>
                          <select
                            value={adjustment.unit}
                            onChange={(e) => {
                              const u = e.target.value as any;
                              const isBulk = u === ProductUnit.KILO || u === ProductUnit.LITER;
                              setAdjustment({
                                ...adjustment,
                                unit: u,
                                ...(isBulk ? {
                                  permiteVentaFraccionada: true,
                                  tipoVenta: u === ProductUnit.KILO ? "peso" : "volumen",
                                  gramajeBase: adjustment.gramajeBase || 1000
                                } : {})
                              });
                            }}
                            className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white font-semibold"
                          >
                            <option value={ProductUnit.PIECE}>Pieza (Pza)</option>
                            <option value={ProductUnit.KILO}>Kilogramo (Kg)</option>
                            <option value={ProductUnit.LITER}>Litro (L)</option>
                            <option value={ProductUnit.PACKAGE}>Paquete (Paq)</option>
                            <option value={ProductUnit.BOX}>Caja</option>
                            <option value={ProductUnit.GRAM}>Gramo (g)</option>
                            <option value={ProductUnit.ML}>Mililitro (ml)</option>
                          </select>
                        </div>

                        {/* Tipo de Venta */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tipo de Venta</label>
                          <select
                            value={adjustment.tipoVenta}
                            onChange={(e) => setAdjustment({ ...adjustment, tipoVenta: e.target.value })}
                            className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                          >
                            <option value="pieza">Por Pieza / Empaque</option>
                            <option value="peso">Por Peso (Kg / Gramos)</option>
                            <option value="volumen">Por Volumen (L / ml)</option>
                          </select>
                        </div>

                        {/* Gramaje / Contenido Base */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Gramaje / Contenido Base</label>
                          <input
                            type="number"
                            placeholder="Ej. 1000g, 500g, 250g"
                            value={adjustment.gramajeBase === 0 ? "" : adjustment.gramajeBase}
                            onChange={(e) => setAdjustment({ ...adjustment, gramajeBase: parseFloat(e.target.value) || 0 })}
                            className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white font-mono"
                          />
                        </div>

                      </div>
                    </div>

                    {/* Stock Result Summary Banner */}
                    <div className="p-3 rounded-xl bg-slate-900 text-white dark:bg-black dark:border dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-gray-400 text-[10px] block">Stock Anterior:</span>
                        <span className="font-bold">{prevStock} {adjustment.unit}</span>
                      </div>
                      <ArrowUpDown className="h-4 w-4 text-emerald-400 animate-pulse" />
                      <div className="text-right">
                        <span className="text-emerald-400 text-[10px] block font-bold">Nuevo Stock Resultante:</span>
                        <span className="text-emerald-300 font-extrabold text-sm">{resultingStock} {adjustment.unit}</span>
                      </div>
                    </div>

                    {/* 4. NOTAS / MOTIVO */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 dark:text-slate-300 block">
                        4. Motivo del Ajuste / Observaciones (Opcional)
                      </label>
                      <div className="flex gap-1.5 flex-wrap pb-1">
                        {["Conteo Físico Mensual", "Ajuste por Merma / Rotura", "Salida por Caducidad", "Recepción Inicial de Stock"].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setAdjustment({ ...adjustment, notes: tag })}
                            className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded-md text-gray-700 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Ej. Conteo físico en bodega 1..."
                        value={adjustment.notes}
                        onChange={(e) => setAdjustment({ ...adjustment, notes: e.target.value })}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustModal(false);
                    setAdjustSearch("");
                  }}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!adjustment.productId}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                    adjustment.productId
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-gray-300 dark:bg-slate-800 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <Check className="h-4 w-4" /> Aplicar Ajuste de Stock
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- DETAILED DIALOG DRAWER --- */}
      {showDetailModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-250 dark:border-slate-850">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">Expediente de Producto</h3>
              <button onClick={() => { setShowDetailModal(false); setSelectedProduct(null); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="flex gap-4">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 rounded-xl object-cover border border-gray-200 dark:border-slate-850"
                />
                <div>
                  <h4 className="font-bold text-sm text-gray-800 dark:text-slate-100">{selectedProduct.name}</h4>
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">SKU: {selectedProduct.sku}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">{selectedProduct.category} &gt; {selectedProduct.subcategory}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-gray-100 dark:border-slate-850 text-xs">
                <div>
                  <p className="text-gray-400">Código Barras</p>
                  <p className="font-mono font-bold">{selectedProduct.code}</p>
                </div>
                <div>
                  <p className="text-gray-400">Ubicación</p>
                  <p className="font-bold">{selectedProduct.location || "Sin especificar"}</p>
                </div>
                <div>
                  <p className="text-gray-400">Existencia Actual</p>
                  <p className="font-bold text-emerald-600 font-mono">{selectedProduct.stock} {selectedProduct.unit}</p>
                </div>
                <div>
                  <p className="text-gray-400">Stock de Reserva</p>
                  <p className="font-bold font-mono">Mín {selectedProduct.stockMin} / Máx {selectedProduct.stockMax}</p>
                </div>
                {isAdmin ? (
                  <div>
                    <p className="text-gray-400">Costo Base</p>
                    <p className="font-mono font-bold">${formatPrice(selectedProduct.cost)} MXN</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400">Precio Medio Mayoreo</p>
                    <p className="font-mono font-bold text-teal-600">${formatPrice(selectedProduct.priceMed)} MXN</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400">Precio Menudeo</p>
                  <p className="font-mono font-bold text-emerald-700">${formatPrice(selectedProduct.priceMin)} MXN</p>
                </div>
              </div>

              {/* Movement Logs Inside detail */}
              <div className="pt-3 border-t border-gray-100 dark:border-slate-850">
                <p className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-emerald-600" /> Bitácora de Movimientos Recientes
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 font-mono text-[9px] text-gray-500">
                  {db.movements.filter((m: any) => m.productId === selectedProduct.id).map((m: any, idx: number) => (
                    <div key={idx} className="p-1.5 rounded bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-850/50 flex justify-between">
                      <div>
                        <p className="font-bold text-gray-700 dark:text-slate-400">{m.type} ({m.quantity} pzas)</p>
                        <p className="opacity-75">{m.notes}</p>
                      </div>
                      <span className="text-[8px] opacity-60 self-end">{m.date.split(" ")[0]}</span>
                    </div>
                  ))}
                  {db.movements.filter((m: any) => m.productId === selectedProduct.id).length === 0 && (
                    <p className="text-[10px] text-center text-gray-400 py-3">No hay movimientos registrados para este producto.</p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => { setShowDetailModal(false); setSelectedProduct(null); }}
              className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
            >
              Cerrar Ficha Técnica
            </button>
          </div>
        </div>
      )}

      {/* --- EDIT PRODUCT MODAL --- */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-amber-600" /> Editar Ficha de Producto
              </h3>
              <button onClick={() => { stopCamera(); setShowEditModal(false); setEditingProduct(null); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditProduct} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Nombre Comercial</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Código de Barras / SKU</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.code}
                    onChange={(e) => setEditingProduct({ ...editingProduct, code: e.target.value, barcode: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Categoría</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {categories.filter(c => c !== "Todas").map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Subcategoría</label>
                  <input
                    type="text"
                    value={editingProduct.subcategory || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, subcategory: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Marca</label>
                  <input
                    type="text"
                    value={editingProduct.brand || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Unidad de Medida</label>
                  <select
                    value={editingProduct.unit}
                    onChange={(e) => {
                      const u = e.target.value as any;
                      const isBulk = u === ProductUnit.KILO || u === ProductUnit.LITER;
                      setEditingProduct({
                        ...editingProduct,
                        unit: u,
                        ...(isBulk ? {
                          permiteVentaFraccionada: true,
                          tipoVenta: u === ProductUnit.KILO ? "peso" : "volumen",
                          gramajeBase: editingProduct.gramajeBase || 1000
                        } : {})
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {Object.values(ProductUnit)
                      .filter(u => u !== ProductUnit.GRAM && u !== ProductUnit.ML)
                      .map(u => (
                        <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* --- SECCIÓN GRAMAJE Y CONVERSIÓN DE PESO / VOLUMEN (EDIT MODAL) --- */}
                <div className="col-span-1 sm:col-span-2 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-emerald-600" />
                      Venta por Gramaje, Peso o Fracción (Granel)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.permiteVentaFraccionada)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEditingProduct({
                            ...editingProduct,
                            permiteVentaFraccionada: checked,
                            tipoVenta: checked ? (editingProduct.tipoVenta && editingProduct.tipoVenta !== "pieza" ? editingProduct.tipoVenta : "peso") : "pieza"
                          });
                        }}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                      />
                      <span>Habilitar Venta Fraccionada / Granel</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                        Gramaje / Contenido Base (ej. 1000g, 500g, 250g)
                      </label>
                      <input
                        type="number"
                        placeholder="Ej. 1000 para 1 Kg, 250 para 1/4"
                        value={editingProduct.gramajeBase || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, gramajeBase: parseFloat(e.target.value) || 0 })}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                        Tipo de Venta
                      </label>
                      <select
                        value={editingProduct.tipoVenta || (editingProduct.permiteVentaFraccionada ? "peso" : "pieza")}
                        onChange={(e) => {
                          const newTipo = e.target.value;
                          setEditingProduct({
                            ...editingProduct,
                            tipoVenta: newTipo,
                            permiteVentaFraccionada: newTipo !== "pieza" ? true : editingProduct.permiteVentaFraccionada
                          });
                        }}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      >
                        <option value="pieza">Por Pieza / Empaque</option>
                        <option value="peso">Por Peso (Kilos / Gramos)</option>
                        <option value="volumen">Por Volumen (Litros / ml)</option>
                      </select>
                    </div>
                  </div>

                  {/* Informative Price Breakdown Table across all Price Tiers */}
                  {(editingProduct.priceMin > 0 || editingProduct.priceMed > 0 || editingProduct.priceMax > 0) && (editingProduct.unit === ProductUnit.KILO || editingProduct.tipoVenta === "peso" || editingProduct.permiteVentaFraccionada) && (
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs space-y-2">
                      <p className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center justify-between">
                        <span>💡 Tabla de Conversión x Gramaje según Precio de Venta:</span>
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-emerald-200 dark:border-emerald-800/60 text-gray-500 font-sans text-[10px]">
                              <th className="py-1 px-1.5">Esquema</th>
                              <th className="py-1 px-1.5">Precio/Kg</th>
                              <th className="py-1 px-1.5 text-emerald-600 dark:text-emerald-400">1 Gramo ($/g)</th>
                              <th className="py-1 px-1.5">1/4 Kg (250g)</th>
                              <th className="py-1 px-1.5">1/2 Kg (500g)</th>
                              <th className="py-1 px-1.5 font-bold">1 Kg (1000g)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {editingProduct.priceMin > 0 && (
                              <tr className="border-b border-gray-100 dark:border-slate-800">
                                <td className="py-1 px-1.5 font-bold text-emerald-700 dark:text-emerald-400">Menudeo</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMin.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-emerald-600 dark:text-emerald-400 font-bold">${(editingProduct.priceMin / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMin * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMin * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMin.toFixed(2)}</td>
                              </tr>
                            )}
                            {editingProduct.priceMed > 0 && (
                              <tr className="border-b border-gray-100 dark:border-slate-800">
                                <td className="py-1 px-1.5 font-bold text-blue-700 dark:text-blue-400">Medio Mayoreo</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMed.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-blue-600 dark:text-blue-400 font-bold">${(editingProduct.priceMed / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMed * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMed * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMed.toFixed(2)}</td>
                              </tr>
                            )}
                            {editingProduct.priceMax > 0 && (
                              <tr>
                                <td className="py-1 px-1.5 font-bold text-amber-700 dark:text-amber-400">Mayoreo</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMax.toFixed(2)}</td>
                                <td className="py-1 px-1.5 text-amber-600 dark:text-amber-400 font-bold">${(editingProduct.priceMax / 1000).toFixed(4)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMax * 0.25).toFixed(2)}</td>
                                <td className="py-1 px-1.5">${(editingProduct.priceMax * 0.50).toFixed(2)}</td>
                                <td className="py-1 px-1.5 font-bold">${editingProduct.priceMax.toFixed(2)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Costo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingProduct.cost || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEditingProduct({
                        ...editingProduct,
                        cost: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Menudeo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingProduct.priceMin || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEditingProduct({
                        ...editingProduct,
                        priceMin: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(editingProduct.priceMin, editingProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Medio Mayoreo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingProduct.priceMed || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEditingProduct({
                        ...editingProduct,
                        priceMed: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(editingProduct.priceMed, editingProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">
                    Precio Mayoreo ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingProduct.priceMax || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEditingProduct({
                        ...editingProduct,
                        priceMax: val
                      });
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                  {(() => {
                    const util = getUtilityMarkup(editingProduct.priceMax, editingProduct.cost);
                    return util ? (
                      <span className={`text-[10px] font-bold font-mono block mt-1 ${util.isPositive ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
                        Margen Utilidad: {util.isPositive ? '+' : ''}{util.percent}% (+${util.amount} MXN)
                      </span>
                    ) : null;
                  })()}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Stock de Reserva (Alerta Mínimo)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingProduct.stockMin || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stockMin: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Ubicación en Estante</label>
                  <input
                    type="text"
                    value={editingProduct.location || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, location: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Fecha de Caducidad (Opcional)</label>
                  <input
                    type="date"
                    value={editingProduct.expiryDate || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, expiryDate: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Existencia / Stock Actual</label>
                  <input
                    type="number"
                    step="any"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">Reabastecer / Sumar (+ Existencia)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej. 10, 20, 50..."
                    value={restockQty || ""}
                    onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-emerald-300 dark:border-emerald-800 p-2.5 bg-emerald-50/25 dark:bg-emerald-950/15 text-slate-900 dark:text-white font-bold focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="col-span-1 sm:col-span-2 border-t border-dashed border-gray-150 dark:border-slate-800 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-gray-750 dark:text-slate-200 flex items-center gap-2">
                    <Camera className="h-4 w-4 text-emerald-600" /> Opciones de Imagen del Producto
                  </h4>
                  <p className="text-[11px] text-gray-500 leading-normal">
                    Puedes ingresar un link web directo, subir una foto de tu dispositivo o tomar una captura en tiempo real con tu cámara.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Link de Google / Internet */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-mono">1. Link de Google / Internet</span>
                      <input
                        type="url"
                        placeholder="Pegar enlace (https://...)"
                        value={editingProduct.imageUrl || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, imageUrl: e.target.value.trim() })}
                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-800 dark:text-white"
                      />
                      <p className="text-[9px] text-gray-400 leading-tight">Pega el link directo a la imagen. Debe terminar en JPG, PNG o WEBP. Si la imagen externa no carga en la vista previa, te sugerimos subirla como archivo desde tu dispositivo.</p>
                    </div>

                    {/* Subir archivo */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider font-mono">2. Subir Archivo</span>
                        <p className="text-[9px] text-gray-400 leading-tight mt-1">Sube archivos JPG, PNG, o WEBP desde tu disco duro o galería celular.</p>
                      </div>
                      <label className="cursor-pointer flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-750 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors border border-gray-200 dark:border-slate-700 w-full mt-2">
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Elegir Archivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageFileChange(e, true)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Tomar Foto */}
                    <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 space-y-2 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider font-mono">3. Tomar Foto (Cámara)</span>
                        <p className="text-[9px] text-gray-400 leading-tight mt-1">Usa la cámara trasera o delantera integrada para retratar el producto.</p>
                      </div>
                      {isCameraActive ? (
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 w-full mt-2 cursor-pointer"
                        >
                          Apagar Cámara
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 w-full mt-2 cursor-pointer"
                        >
                          <Camera className="h-3.5 w-3.5" /> Activar Cámara
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Camera Error Message */}
                  {cameraError && (
                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-xs font-semibold mt-3 space-y-1">
                      <p className="flex items-center gap-1">⚠️ {cameraError}</p>
                    </div>
                  )}

                  {/* Camera Live Stream */}
                  {isCameraActive && (
                    <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50/10 dark:bg-amber-950/10 space-y-3 mt-3">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                        <span className="animate-pulse h-2 w-2 rounded-full bg-red-500"></span> Cámara Activa
                      </p>
                      <div className="relative mx-auto max-w-xs rounded-xl overflow-hidden border border-gray-300 bg-black aspect-video flex items-center justify-center">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => capturePhoto(true)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Tomar Foto
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preview section */}
                  {editingProduct.imageUrl && (
                    <div className="flex items-center gap-3.5 p-3.5 bg-emerald-50/20 dark:bg-emerald-950/10 rounded-xl border border-emerald-150 dark:border-emerald-900/30 w-fit">
                      <img 
                        src={editingProduct.imageUrl} 
                        alt="preview" 
                        className="h-16 w-16 object-cover rounded-lg border border-gray-200 dark:border-slate-800 bg-white" 
                        referrerPolicy="no-referrer" 
                      />
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-slate-200">Vista previa cargada</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[200px]">Enlace detectado e indexado</p>
                        <button
                          type="button"
                          onClick={() => setEditingProduct({ ...editingProduct, imageUrl: "" })}
                          className="text-[10px] font-semibold text-red-500 hover:text-red-750 mt-1 block cursor-pointer"
                        >
                          Eliminar Imagen
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { stopCamera(); setShowEditModal(false); setEditingProduct(null); }}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-450 hover:bg-gray-50 dark:hover:bg-slate-850 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE PRODUCT AUTHORIZATION MODAL */}
      {showDeleteModal && productToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-150 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="p-2 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 dark:text-slate-200">Autorización Requerida</h3>
                <p className="text-xs text-gray-400">Eliminación definitiva de producto</p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-950/20 p-3.5 rounded-xl border border-red-150 dark:border-red-900/30 text-xs text-red-800 dark:text-red-400 leading-normal space-y-1.5">
              <p className="font-bold">¿Estás seguro de eliminar el siguiente producto?</p>
              <div className="font-mono text-[11px] bg-white dark:bg-slate-950/60 p-2 rounded border border-red-200/50">
                <p><strong>Nombre:</strong> {productToDelete.name}</p>
                <p><strong>Código:</strong> {productToDelete.code}</p>
                <p><strong>Categoría:</strong> {productToDelete.category}</p>
                <p><strong>Existencias:</strong> {productToDelete.stock} {productToDelete.unit}</p>
              </div>
              <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold pt-1">
                ⚠️ Esta acción es irreversible y afectará el catálogo general. Se requiere la clave de acceso de un administrador.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-slate-300 block">
                Contraseña de Administrador:
              </label>
              <input
                type="password"
                placeholder="Ingresa la contraseña..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleDeleteConfirm();
                  }
                }}
                className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono tracking-widest"
                autoFocus
              />
              {deleteError && (
                <p className="text-[11px] font-bold text-red-600 dark:text-red-400 animate-pulse mt-1">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setProductToDelete(null);
                  setAdminPassword("");
                  setDeleteError("");
                }}
                className="px-4 py-2 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-450 hover:bg-gray-50 dark:hover:bg-slate-850 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                Eliminar Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRASPASAR PRODUCTO A OTRA SUCURSAL */}
      {showTransferModal && transferProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-extrabold text-gray-800 dark:text-slate-100">Despachar Traspaso Inter-Sucursal</h3>
              </div>
              <button 
                onClick={() => { setShowTransferModal(false); setTransferProduct(null); }} 
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <p className="font-bold">{transferProduct.name}</p>
              <p className="font-mono text-[10px]">Código: {transferProduct.code} | Stock Actual Disponible: {transferProduct.stock} {transferProduct.unit}</p>
            </div>

            <form onSubmit={handleExecutePendingTransfer} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-gray-600 dark:text-slate-400 block">Sucursal Origen</label>
                  <select
                    value={transferForm.fromBranch}
                    onChange={(e) => setTransferForm({ ...transferForm, fromBranch: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-transparent text-gray-800 dark:text-slate-100 font-bold"
                  >
                    <option value="Norte">MAZAL 1 (Principal)</option>
                    <option value="Sur">MAZAL 2 (Secundaria)</option>
                    <option value="Matriz">Matriz Central</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-600 dark:text-slate-400 block">Sucursal Destino</label>
                  <select
                    value={transferForm.toBranch}
                    onChange={(e) => setTransferForm({ ...transferForm, toBranch: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-transparent text-gray-800 dark:text-slate-100 font-bold"
                  >
                    <option value="Sur">MAZAL 2 (Secundaria)</option>
                    <option value="Norte">MAZAL 1 (Principal)</option>
                    <option value="Matriz">Matriz Central</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-600 dark:text-slate-400 block">Cantidad a Transferir ({transferProduct.unit})</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  max={transferProduct.stock}
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-transparent font-mono font-bold text-gray-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-600 dark:text-slate-400 block">Observaciones / Folio de Envío</label>
                <input
                  type="text"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  placeholder="Ej. Surtido directo inter-sucursal"
                  className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-transparent text-gray-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {isTransferring ? "Despachando..." : "Despachar y Solicitar Confirmación"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTransferModal(false); setTransferProduct(null); }}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
