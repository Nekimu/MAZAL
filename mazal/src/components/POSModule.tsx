/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { jsPDF } from "jspdf";
import { 
  Search, 
  ShoppingCart, 
  User, 
  Tag, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Receipt, 
  QrCode, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  TrendingDown,
  DollarSign,
  Info,
  X,
  Printer,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Clock,
  RefreshCw
} from "lucide-react";
import { 
  Product, 
  Customer, 
  PaymentMethod, 
  CustomerRole, 
  CartItem, 
  Sale, 
  CashSession,
  ProductUnit,
  UserRole,
  formatPrice
} from "../types";
import { calculateCashSessionMetrics, getExpenseTimestamp } from "../domain/finance/cashSessionCalculations";
import { 
  getDatabase, 
  saveDatabase, 
  logAction, 
  registerMovement,
  subscribeToDb,
  saveSaleToMySQL,
  saveProductToMySQL,
  updateStockInMySQL,
  saveCustomerToMySQL,
  saveCashSessionToMySQL,
  saveSaleToSupabase,
  saveProductToSupabase,
  saveCustomerToSupabase,
  saveCashSessionToSupabase,
  activeBranch
} from "../data";
import { MovementType } from "../types";
import { 
  isWeighed, 
  getUnitLabel, 
  formatQuantity, 
  formatQuantityWithUnit, 
  calculateSubtotal, 
  getInformativePricePerGram,
  gramsToKg,
  kgToGrams,
  mlToLiter,
  literToMl,
  WeightUnit
} from "../utils/WeightService";
import { 
  printThermalTicket, 
  generateTicketPDF, 
  calculateTotalArticles, 
  formatItemQuantityLine,
  printCorteDeCajaTicket,
  generateCortePDF
} from "../utils/TicketPrinter";

interface POSModuleProps {
  currentUser: { name: string; role: string };
  cashSessionActive: boolean;
  onOpenCashSession: () => void;
  onlyPOSMode?: boolean;
  onSaleComplete?: () => void;
}

function getSearchRelevance(p: Product, query: string): number {
  if (!query) return 0;
  const q = (query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!q) return 0;

  const name = (p.name || p.descripcion || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const code = (p.code || p.codigo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const barcode = (p.barcode || p.codigoBarras || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const sku = (p.sku || p.codigoInterno || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const brand = (p.brand || p.marca || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // 1. Coincidencia exacta en nombre o clave
  if (name === q || code === q || barcode === q) return 1000;

  // 2. El nombre empieza con el término (ej. "Pasta Espacial" al buscar "Pasta")
  if (name.startsWith(q)) return 800;

  // 3. Alguna palabra del nombre empieza con el término
  const words = name.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return 600;

  // 4. Clave o código de barras empieza con el término
  if (code.startsWith(q) || barcode.startsWith(q) || sku.startsWith(q)) return 500;

  // 5. El nombre contiene el término en cualquier parte
  if (name.includes(q)) return 400;

  // 6. Coincidencia de múltiples palabras escritas
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const fullText = `${name} ${code} ${barcode} ${brand}`;
    if (tokens.every(tok => fullText.includes(tok))) return 350;
  }

  // 7. El código o barcode contiene el término
  if (code.includes(q) || barcode.includes(q) || sku.includes(q)) return 300;

  // 8. La marca contiene el término
  if (brand && (brand === q || brand.includes(q))) return 200;

  return 0;
}

export default function POSModule({ 
  currentUser, 
  cashSessionActive, 
  onOpenCashSession,
  onlyPOSMode = false,
  onSaleComplete
}: POSModuleProps) {
  // Database load
  const [db, setDb] = useState(getDatabase());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("Todos");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedUnitType, setSelectedUnitType] = useState("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [rawAmountPaid, setRawAmountPaid] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 24;

  const handleRawAmountPaidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9.]/g, "");
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }
    if (parts[1] && parts[1].length > 2) {
      val = parts[0] + "." + parts[1].substring(0, 2);
    }
    setRawAmountPaid(val);
    setAmountPaid(parseFloat(val) || 0);
  };
  
  // Scanners / fast entry
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState({ text: "", type: "" });

  // Receipt modal
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [infoProduct, setInfoProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<"catalog" | "sales">("catalog");
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({});

  // Cash Session State & Modals
  const [showOpenCajaModal, setShowOpenCajaModal] = useState(false);
  const [showCloseCajaModal, setShowCloseCajaModal] = useState(false);
  const [openCajaFund, setOpenCajaFund] = useState("1000");
  const [closeCajaPhysicalCash, setCloseCajaPhysicalCash] = useState("");
  const [closeCajaNotes, setCloseCajaNotes] = useState("");
  const [lastClosedSession, setLastClosedSession] = useState<any | null>(null);
  const [showCorteReceiptModal, setShowCorteReceiptModal] = useState(false);

  // Active Session and Calculations
  const activeCashSession = useMemo(() => {
    return (db.cashSessions || []).find((s: any) => s.status === "Abierta");
  }, [db.cashSessions]);

  const isCajaOpen = Boolean(activeCashSession);

  const sessionMetrics = useMemo(() => {
    return calculateCashSessionMetrics(
      activeCashSession,
      db.sales || [],
      db.expenses || [],
      closeCajaPhysicalCash !== "" ? parseFloat(closeCajaPhysicalCash) : undefined
    );
  }, [activeCashSession, db.sales, db.expenses, closeCajaPhysicalCash]);

  const cashSalesTotal = sessionMetrics.cashSalesTotal;
  const otherSalesTotal = sessionMetrics.cardSalesTotal + sessionMetrics.transferSalesTotal + sessionMetrics.creditSalesTotal;
  const sessionExpensesTotal = sessionMetrics.expensesTotal;
  const expectedCashInDrawer = sessionMetrics.expectedFinalCash;

  const handleOpenCajaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCashSession) {
      alert(`Ya existe una sesión de caja abierta iniciada el ${activeCashSession.startTime} por ${activeCashSession.openedBy}. Debe realizar el corte antes de abrir una nueva.`);
      setShowOpenCajaModal(false);
      return;
    }

    const fund = parseFloat(openCajaFund);
    if (isNaN(fund) || fund < 0) {
      alert("Introduce un monto de fondo inicial válido mayor o igual a 0.");
      return;
    }

    if (!window.confirm(`¿Confirmas abrir la caja con un fondo inicial de $${fund.toFixed(2)} MXN a nombre de "${currentUser.name}"?`)) {
      return;
    }

    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    const newSess: CashSession = {
      id: "SESS_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      startTime: nowStr,
      openedBy: currentUser.name,
      initialCash: fund,
      status: "Abierta",
      salesTotal: 0,
      expensesTotal: 0,
      expectedFinalCash: fund
    };

    const currentBranch = activeBranch || "Norte";
    const nextDb = { ...db };
    if (!Array.isArray(nextDb.cashSessions)) nextDb.cashSessions = [];
    nextDb.cashSessions = [newSess, ...nextDb.cashSessions];

    try {
      saveCashSessionToMySQL(newSess, currentBranch).catch((err) => console.warn("Error guardando sesión en MySQL:", err));
      saveDatabase(nextDb).catch(() => {});
      logAction(currentUser.name, currentUser.role, "Apertura de Caja", `Apertura de turno de caja con fondo inicial de $${fund.toFixed(2)} MXN`).catch(() => {});
      setShowOpenCajaModal(false);
    } catch (err) {
      console.error("Error al abrir caja:", err);
      alert("Ocurrió un error al registrar la apertura de caja. Intente nuevamente.");
    }
  };

  const handleCloseCajaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCashSession) return;

    const realCash = parseFloat(closeCajaPhysicalCash);
    if (isNaN(realCash) || realCash < 0) {
      alert("Por favor introduce el monto físico contado en caja.");
      return;
    }

    const expected = expectedCashInDrawer;
    const diff = realCash - expected;
    const diffMsg = Math.abs(diff) < 0.01 
      ? "Cuadre Exacto ($0.00)" 
      : (diff > 0 ? `Sobrante (+${diff.toFixed(2)} MXN)` : `Faltante (-${Math.abs(diff).toFixed(2)} MXN)`);

    if (!window.confirm(
      `¿Confirmas cerrar la caja y realizar el corte definitivo?\n\n` +
      `• Responsable: ${activeCashSession.openedBy}\n` +
      `• Fondo Inicial: $${activeCashSession.initialCash.toFixed(2)} MXN\n` +
      `• Total Ventas Efectivo: +$${cashSalesTotal.toFixed(2)} MXN\n` +
      `• Total Gastos: -$${sessionExpensesTotal.toFixed(2)} MXN\n` +
      `• Efectivo Esperado: $${expected.toFixed(2)} MXN\n` +
      `• Efectivo Físico Contado: $${realCash.toFixed(2)} MXN\n` +
      `• Resultado Arqueo: ${diffMsg}`
    )) {
      return;
    }

    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    const closedSess: CashSession = {
      ...activeCashSession,
      status: "Cerrada",
      endTime: nowStr,
      finalCash: realCash,
      salesTotal: cashSalesTotal,
      expensesTotal: sessionExpensesTotal,
      expectedFinalCash: expected,
      notes: closeCajaNotes || activeCashSession.notes
    };

    const currentBranch = activeBranch || "Norte";
    const nextDb = { ...db };
    nextDb.cashSessions = (db.cashSessions || []).map((s: CashSession) => s.id === activeCashSession.id ? closedSess : s);

    try {
      saveCashSessionToMySQL(closedSess, currentBranch).catch((err) => console.warn("Error guardando corte en MySQL:", err));
      await saveDatabase(nextDb);
      logAction(currentUser.name, currentUser.role, "Cierre de Caja", `Corte realizado. Esperado: $${expected.toFixed(2)} | Contado: $${realCash.toFixed(2)} | Dif: ${diffMsg}`).catch(() => {});

      setShowCloseCajaModal(false);
      setLastClosedSession(closedSess);
      setShowCorteReceiptModal(true);
      if (onSaleComplete) onSaleComplete();
    } catch (err) {
      console.error("Error al guardar corte de caja:", err);
      // Fallback: update in-memory and proceed to let user see/print the receipt
      setShowCloseCajaModal(false);
      setLastClosedSession(closedSess);
      setShowCorteReceiptModal(true);
    }
  };

  useEffect(() => {
    if (onlyPOSMode) {
      setViewMode("catalog");
    }
  }, [onlyPOSMode]);

  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);

  const departments: string[] = ["Todos", ...(Array.from(new Set(db.products.map((p: Product) => p.departamento || "Sin clasificar").filter(Boolean))) as string[]).sort()];

  const categories: string[] = ["Todos", ...(Array.from(new Set(
    db.products
      .filter((p: Product) => selectedDepartment === "Todos" || (p.departamento || "Sin clasificar") === selectedDepartment)
      .map((p: Product) => p.category)
      .filter(Boolean)
  )) as string[]).sort()];

  useEffect(() => {
    if (selectedCategory !== "Todos" && !categories.includes(selectedCategory)) {
      setSelectedCategory("Todos");
    }
  }, [selectedDepartment, selectedCategory, categories]);

  const handlePrint = () => {
    if (!lastCompletedSale) return;
    const active = localStorage.getItem("mazal_active_branch");
    const branchName = (lastCompletedSale as any).branch || (active === "Sur" ? "MAZAL 2" : "MAZAL 1");
    printThermalTicket(lastCompletedSale, branchName, db.products);
  };

  const downloadReceiptPDF = () => {
    if (!lastCompletedSale) return;
    const active = localStorage.getItem("mazal_active_branch");
    const branchName = (lastCompletedSale as any).branch || (active === "Sur" ? "MAZAL 2" : "MAZAL 1");
    generateTicketPDF(lastCompletedSale, branchName, db.products);
  };

  // Search filter
  const filteredProducts = db.products.filter((product: Product) => {
    if (searchTerm) {
      const score = getSearchRelevance(product, searchTerm);
      if (score <= 0) return false;
    }

    const pDept = product.departamento || "Sin clasificar";
    const matchesDepartment = selectedDepartment === "Todos" || pDept === selectedDepartment;
    const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory || product.categoria === selectedCategory;

    let matchesUnitType = true;
    if (selectedUnitType !== "Todos") {
      const u = (product.unit || product.unidad || "").toLowerCase();
      const t = (product.tipoVenta || "").toLowerCase();
      if (selectedUnitType === "Pieza") {
        matchesUnitType = u.includes("pz") || u.includes("pza") || u.includes("ud") || t.includes("pieza");
      } else if (selectedUnitType === "Kilo") {
        matchesUnitType = u.includes("kg") || u.includes("gram") || u.includes("g") || t.includes("peso");
      } else if (selectedUnitType === "Paquete") {
        matchesUnitType = u.includes("paq") || u.includes("caja") || t.includes("paquete") || u.includes("paquete");
      }
    }

    return matchesDepartment && matchesCategory && matchesUnitType;
  });

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, selectedCategory, selectedUnitType]);

  // Sort by relevance if search term is active, otherwise by name
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (searchTerm) {
      list.sort((a, b) => {
        const scoreA = getSearchRelevance(a, searchTerm);
        const scoreB = getSearchRelevance(b, searchTerm);
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return (a.name || "").localeCompare(b.name || "");
      });
    }
    return list;
  }, [filteredProducts, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / ITEMS_PER_PAGE));
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Calculate dynamic price based on rules
  const getDynamicPrice = (product: Product, quantity: number, customer: Customer | null): { price: number; type: string } => {
    const pMin = Number(product.priceMin ?? (product as any).precioMenudeo ?? 0);
    const pMed = Number(product.priceMed ?? (product as any).precioMedioMayoreo ?? pMin);
    const pMax = Number(product.priceMax ?? (product as any).precioMayoreo ?? pMed);
    const pSpecial = Number(product.priceSpecial ?? (product as any).precioEspecial ?? pMax);

    // Wholesaler or Distributor clients get wholesale rates immediately
    if (customer) {
      if (customer.role === CustomerRole.DISTRIBUTOR) {
        return { price: pSpecial, type: "Mayoreo" };
      }
      if (customer.role === CustomerRole.WHOLESALER) {
        return { price: pMax, type: "Mayoreo" };
      }
      if (customer.role === CustomerRole.FREQUENT) {
        return { price: pMed, type: "Medio Mayoreo" };
      }
    }

    // Volume breaks
    if (quantity >= 50) {
      return { price: pMax, type: "Mayoreo" };
    }
    if (quantity >= 12) {
      return { price: pMed, type: "Medio Mayoreo" };
    }
    return { price: pMin, type: "Menudeo" };
  };

  // Add item to cart
  const addToCart = (product: Product, forcedPriceType?: "Menudeo" | "Medio Mayoreo" | "Mayoreo") => {
    if (!cashSessionActive) {
      alert("Por favor abre la caja registradora en el Dashboard antes de realizar ventas.");
      return;
    }

    const availableStock = Number(product.stock) || 0;
    if (availableStock <= 0) {
      setScanMessage({ text: `⚠️ ¡Sin existencias de ${product.name}! (Stock: 0)`, type: "error" });
      setTimeout(() => setScanMessage({ text: "", type: "" }), 3500);
      return;
    }

    setCart((prevCart) => {
      // Calculate current total quantity of this product across all lines in cart
      const currentTotalInCart = prevCart
        .filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (currentTotalInCart + 1 > availableStock) {
        setScanMessage({ 
          text: `⚠️ Límite de existencias alcanzado para ${product.name}. Stock disponible: ${availableStock}`, 
          type: "error" 
        });
        setTimeout(() => setScanMessage({ text: "", type: "" }), 3500);
        return prevCart;
      }

      let initialPriceType = forcedPriceType;
      if (!initialPriceType) {
        const priceInfo = getDynamicPrice(product, 1, selectedCustomer);
        initialPriceType = priceInfo.type as any;
      }

      // Check if an item already exists in the cart with the SAME product.id AND SAME priceType
      const existing = prevCart.find(
        (item) => item.product.id === product.id && item.priceType === initialPriceType
      );

      let updatedCart;
      if (existing) {
        const newQty = existing.quantity + 1;
        updatedCart = prevCart.map((item) =>
          item.product.id === product.id && item.priceType === initialPriceType
            ? { ...item, quantity: newQty }
            : item
        );
      } else {
        let price = product.priceMin;
        if (initialPriceType === "Medio Mayoreo") {
          price = product.priceMed;
        } else if (initialPriceType === "Mayoreo") {
          price = product.priceMax;
        }

        updatedCart = [
          ...prevCart,
          {
            product,
            quantity: 1,
            priceType: initialPriceType as any,
            selectedPrice: price,
            discount: 0,
          },
        ];
      }
      return updatedCart;
    });
  };

  // Triggered when client changes -> Recalculate all cart prices!
  const handleCustomerChange = (customerId: string) => {
    const cust = db.customers.find((c: Customer) => c.id === customerId) || null;
    setSelectedCustomer(cust);

    // If client is wholesale/credit-only, adjust payments or alert
    if (cust && cust.role === CustomerRole.WHOLESALER) {
      setPaymentMethod(PaymentMethod.CREDIT);
    } else {
      setPaymentMethod(PaymentMethod.CASH);
    }

    setCart((prevCart) => {
      const updated = prevCart.map((item) => {
        const priceInfo = getDynamicPrice(item.product, item.quantity, cust);
        return {
          ...item,
          selectedPrice: priceInfo.price,
          priceType: priceInfo.type as any,
        };
      });

      const merged: CartItem[] = [];
      updated.forEach((item) => {
        const existing = merged.find(
          (m) => m.product.id === item.product.id && m.priceType === item.priceType
        );
        if (existing) {
          const availableStock = Number(item.product.stock) || 0;
          existing.quantity = Math.min(availableStock, existing.quantity + item.quantity);
        } else {
          merged.push({ ...item });
        }
      });
      return merged;
    });
  };

  const getUnitStep = (unit: ProductUnit) => {
    if (unit === ProductUnit.KILO || unit === ProductUnit.LITER) return 0.05; // 50g increments/decrements
    return 1;
  };

  const updateCartItemUnit = (productId: string, priceType: string, newUnit: string) => {
    // Clear local typing buffer for this cart item
    const key = `${productId}-${priceType}`;
    setLocalQuantities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setCart((prevCart) =>
      prevCart.map((i) =>
        i.product.id === productId && i.priceType === priceType
          ? { ...i, inputUnit: newUnit }
          : i
      )
    );
  };

  // Explicitly remove product from cart
  const removeFromCart = (productId: string, priceType: string) => {
    const key = `${productId}-${priceType}`;
    setLocalQuantities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCart((prev) => prev.filter((i) => !(i.product.id === productId && i.priceType === priceType)));
  };

  // Update quantity in cart (+ / - buttons)
  const updateQuantity = (productId: string, priceType: string, delta: number) => {
    // Clear local typing state for this item so it re-syncs
    const key = `${productId}-${priceType}`;
    setLocalQuantities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setCart((prevCart) => {
      const item = prevCart.find((i) => i.product.id === productId && i.priceType === priceType);
      if (!item) return prevCart;

      const itemUnit = item.inputUnit || (isWeighed(item.product) ? (getUnitLabel(item.product) === 'L' ? 'L' : 'kg') : item.product.unit);
      let step = 1;

      if (isWeighed(item.product)) {
        if (itemUnit === 'g' || itemUnit === 'ml') {
          step = 0.050; // 50g / 50ml step
        } else {
          step = 0.050; // 0.050 kg step
        }
      }

      const actualDelta = delta > 0 ? step : -step;
      const newQty = Number((item.quantity + actualDelta).toFixed(6));

      if (newQty <= 0) {
        return prevCart.filter((i) => !(i.product.id === productId && i.priceType === priceType));
      }

      const availableStock = Number(item.product.stock) || 0;
      const otherLinesQty = prevCart
        .filter((i) => i.product.id === productId && i.priceType !== priceType)
        .reduce((sum, i) => sum + i.quantity, 0);

      // Stock ceiling check
      if (newQty + otherLinesQty > availableStock) {
        alert(`⚠️ Existencias insuficientes: Solo hay ${availableStock} unidad(es) de "${item.product.name}" en existencia.`);
        return prevCart;
      }

      return prevCart.map((i) =>
        i.product.id === productId && i.priceType === priceType
          ? { ...i, quantity: newQty }
          : i
      );
    });
  };

  const updateCartItemQuantityDirectly = (
    productId: string, 
    priceType: string, 
    userEnteredVal: number,
    overrideUnit?: string
  ) => {
    if (userEnteredVal <= 0) {
      setCart((prev) => prev.filter((i) => !(i.product.id === productId && i.priceType === priceType)));
      return;
    }
    setCart((prevCart) => {
      const item = prevCart.find((i) => i.product.id === productId && i.priceType === priceType);
      if (!item) return prevCart;

      const unitToUse = overrideUnit || item.inputUnit || (getUnitLabel(item.product) === 'L' ? 'L' : 'kg');
      let qtyInBaseUnit = userEnteredVal;

      if (isWeighed(item.product)) {
        if (unitToUse === 'g') {
          qtyInBaseUnit = gramsToKg(userEnteredVal);
        } else if (unitToUse === 'ml') {
          qtyInBaseUnit = mlToLiter(userEnteredVal);
        }
      }

      const availableStock = Number(item.product.stock) || 0;
      const otherLinesQty = prevCart
        .filter((i) => i.product.id === productId && i.priceType !== priceType)
        .reduce((sum, i) => sum + i.quantity, 0);

      if (qtyInBaseUnit + otherLinesQty > availableStock) {
        alert(`⚠️ Existencias insuficientes: Solo hay ${availableStock} en existencia de "${item.product.name}".`);
        return prevCart;
      }

      return prevCart.map((i) =>
        i.product.id === productId && i.priceType === priceType
          ? { ...i, quantity: Number(qtyInBaseUnit.toFixed(6)), inputUnit: unitToUse }
          : i
      );
    });
  };

  // Update manual price type for a specific product in the cart
  const updateCartItemPriceType = (productId: string, oldPriceType: string, newPriceType: 'Menudeo' | 'Medio Mayoreo' | 'Mayoreo') => {
    setCart((prevCart) => {
      const itemToChange = prevCart.find((i) => i.product.id === productId && i.priceType === oldPriceType);
      if (!itemToChange) return prevCart;

      let price = itemToChange.product.priceMin;
      if (newPriceType === 'Medio Mayoreo') {
        price = itemToChange.product.priceMed;
      } else if (newPriceType === 'Mayoreo') {
        price = itemToChange.product.priceMax;
      }

      // Check if there is ALREADY an item in the cart with the target newPriceType.
      // If there is, merge quantities; otherwise, update in-place.
      const existingNew = prevCart.find((i) => i.product.id === productId && i.priceType === newPriceType);

      if (existingNew) {
        return prevCart
          .map((i) => {
            if (i.product.id === productId && i.priceType === newPriceType) {
              return { ...i, quantity: i.quantity + itemToChange.quantity };
            }
            return i;
          })
          .filter((i) => !(i.product.id === productId && i.priceType === oldPriceType));
      } else {
        return prevCart.map((i) =>
          i.product.id === productId && i.priceType === oldPriceType
            ? { ...i, priceType: newPriceType as any, selectedPrice: price }
            : i
        );
      }
    });
  };

  // Handle barcode fast input
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCode.trim()) return;
    const found = db.products.find(
      (p: Product) => p.barcode === scanCode.trim() || p.code === scanCode.trim()
    );
    if (found) {
      addToCart(found);
      setScanMessage({ text: `Escaneado: ${found.name}`, type: "success" });
      setScanCode("");
    } else {
      setScanMessage({ text: `Código "${scanCode}" no encontrado`, type: "error" });
    }
    setTimeout(() => setScanMessage({ text: "", type: "" }), 3000);
  };

  // Calculate cart totals
  const subtotal = cart.reduce((acc, item) => acc + calculateSubtotal(item.quantity, item.selectedPrice), 0);
  const total = subtotal; // can add custom promo discount or tax if needed

  // Checkout process
  const handleCheckout = () => {
    setCheckoutError("");
    if (cart.length === 0) {
      setCheckoutError("El carrito está vacío.");
      return;
    }

    // Cash check
    if (!cashSessionActive) {
      setCheckoutError("No hay una sesión de caja abierta.");
      return;
    }

    const database = getDatabase();

    // Check credit limits if credit is used
    if (paymentMethod === PaymentMethod.CREDIT) {
      if (!selectedCustomer) {
        setCheckoutError("Debes seleccionar un cliente para aplicar venta a crédito.");
        return;
      }
      const availableCredit = selectedCustomer.creditLimit - selectedCustomer.creditUsed;
      if (total > availableCredit) {
        setCheckoutError(
          `Límite de crédito superado. Disponible: $${availableCredit.toFixed(
            2
          )} MXN. Total Compra: $${total.toFixed(2)} MXN.`
        );
        return;
      }
    }

    // Validate live stock before finalizing sale
    for (const item of cart) {
      const liveProd = database.products.find((p: Product) => p.id === item.product.id);
      const available = Number(liveProd?.stock) || 0;
      const totalSoldForProd = cart
        .filter((c) => c.product.id === item.product.id)
        .reduce((sum, c) => sum + c.quantity, 0);

      if (totalSoldForProd > available) {
        setCheckoutError(
          `⚠️ No hay suficiente inventario de "${item.product.name}". En existencia: ${available}, Solicitado en venta: ${totalSoldForProd}. Ajusta el carrito antes de cobrar.`
        );
        return;
      }
    }

    if (!window.confirm(`¿Confirmas procesar la venta por un total de $${total.toFixed(2)} MXN con método de pago "${paymentMethod}"?`)) {
      return;
    }

    // 1. Prepare folio and sale date
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const nextTicketNum = `TK-${Y}${M}${D}-${h}${m}`;
    const saleDate = `${Y}-${M}-${D} ${h}:${m}`;

    // 2. Process and update stock
    const updatedProducts = database.products.map((prod: Product) => {
      const totalSoldForProd = cart
        .filter((item) => item.product.id === prod.id)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (totalSoldForProd > 0) {
        const previousStock = Number(prod.stock) || 0;
        const newStock = Math.max(0, previousStock - totalSoldForProd);
        
        // Push movement to memory
        if (!Array.isArray(database.movements)) database.movements = [];
        database.movements.unshift({
          id: "MOV_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
          productId: prod.id,
          productName: prod.name,
          type: MovementType.EXIT_SALE,
          quantity: totalSoldForProd,
          previousStock,
          newStock,
          date: saleDate,
          user: currentUser.name,
          notes: `Venta ticket ${nextTicketNum}`
        });
        
        return { ...prod, stock: newStock };
      }
      return prod;
    });

    // 3. If credit, update customer outstanding used credit balance
    let updatedCustomers = database.customers;
    if (paymentMethod === PaymentMethod.CREDIT && selectedCustomer) {
      updatedCustomers = database.customers.map((c: Customer) => {
        if (c.id === selectedCustomer.id) {
          const newCreditUsed = c.creditUsed + total;
          return { ...c, creditUsed: newCreditUsed };
        }
        return c;
      });
    }

    // 4. Register transaction
    const costTotal = cart.reduce((acc, item) => acc + item.product.cost * item.quantity, 0);
    const profit = total - costTotal;

    const newSale: Sale = {
      id: "SALE_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      ticketNumber: nextTicketNum,
      items: cart.map((item) => {
        const itemTotal = calculateSubtotal(item.quantity, item.selectedPrice);
        const itemCostTotal = Number((item.product.cost * item.quantity).toFixed(2));
        const baseLabel = getUnitLabel(item.product);
        const activeUnit = item.inputUnit || (isWeighed(item.product) ? (baseLabel === 'L' ? (item.quantity < 1 ? 'ml' : 'L') : (item.quantity < 1 ? 'g' : 'kg')) : baseLabel);
        return {
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          displayUnit: activeUnit,
          unitPrice: item.selectedPrice,
          totalPrice: itemTotal,
          profit: Number((itemTotal - itemCostTotal).toFixed(2)),
        };
      }),
      total,
      profit,
      costTotal,
      date: saleDate,
      paymentMethod,
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || null,
      userId: currentUser.name,
      userName: currentUser.name,
      amountPaid: paymentMethod === PaymentMethod.CASH ? (amountPaid || total) : total,
      change: paymentMethod === PaymentMethod.CASH ? Math.max(0, (amountPaid || total) - total) : 0,
    };

    database.sales.unshift(newSale);
    database.products = updatedProducts;
    database.customers = updatedCustomers;

    const currentBranch = activeBranch || "Norte";

    // 4. Save directly in local MySQL
    saveSaleToMySQL(newSale, currentBranch).catch((err) => {
      console.warn("Aviso al guardar venta en MySQL:", err);
    });

    // Update stock in local MySQL
    cart.forEach((item) => {
      const prod = updatedProducts.find((p: Product) => p.id === item.product.id);
      if (prod) {
        updateStockInMySQL(prod.id, prod.stock, currentBranch).catch(() => {});
        saveProductToMySQL(prod, currentBranch).catch(() => {});
      }
    });

    // If credit, update customer in local MySQL
    if (paymentMethod === PaymentMethod.CREDIT && selectedCustomer) {
      const custObj = updatedCustomers.find((c: Customer) => c.id === selectedCustomer.id);
      if (custObj) {
        saveCustomerToMySQL(custObj, currentBranch).catch(() => {});
      }
    }

    // Adjust active cash session totals
    if (database.cashSessions.length > 0) {
      const activeSess = database.cashSessions.find((s: any) => s.status === "Abierta");
      if (activeSess) {
        activeSess.salesTotal = (activeSess.salesTotal || 0) + total;
        saveCashSessionToMySQL(activeSess, currentBranch).catch(() => {});
      }
    }

    // Save full in-memory state
    saveDatabase(database).catch(() => {});
    
    // Log action
    logAction(
      currentUser.name,
      currentUser.role,
      "Venta Registrada",
      `Generó ticket ${nextTicketNum} por $${total.toFixed(2)} MXN (${paymentMethod})`
    ).catch(() => {});

    // SHOW RECEIPT MODAL IMMEDIATELY & CLEAR CART
    setLastCompletedSale(newSale);
    setShowReceipt(true);
    setCart([]);
    setAmountPaid(0);
    setRawAmountPaid("");
  };

  return (
    <div className="space-y-4" id="pos-module-root">
      {/* CASH SESSION STATUS BAR */}
      <div className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
        isCajaOpen
          ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-850"
          : "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${
            isCajaOpen 
              ? "bg-emerald-600 text-white shadow-xs" 
              : "bg-amber-500 text-white shadow-xs"
          }`}>
            {isCajaOpen ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
                isCajaOpen
                  ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200"
                  : "bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
              }`}>
                {isCajaOpen ? "🟢 Turno de Caja Abierto" : "🔒 Caja Cerrada"}
              </span>
              {isCajaOpen && activeCashSession && (
                <span className="text-xs text-gray-500 dark:text-slate-400 font-mono">
                  (Iniciada: {activeCashSession.startTime.substring(11, 16)} por <strong className="uppercase">{activeCashSession.openedBy}</strong>)
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-300 mt-0.5">
              {isCajaOpen && activeCashSession
                ? `Fondo inicial: $${activeCashSession.initialCash.toFixed(2)} | Ventas Efvo: +$${cashSalesTotal.toFixed(2)} | Gastos: -$${sessionExpensesTotal.toFixed(2)} | En Caja: $${expectedCashInDrawer.toFixed(2)} MXN`
                : "Es obligatorio abrir el turno de caja con un fondo inicial para poder registrar ventas y cobrar en el POS."}
            </p>
          </div>
        </div>

        <div>
          {isCajaOpen && activeCashSession ? (
            <button
              onClick={() => {
                setCloseCajaPhysicalCash("");
                setCloseCajaNotes("");
                setShowCloseCajaModal(true);
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Lock className="h-4 w-4" /> Realizar Corte y Cerrar Caja
            </button>
          ) : (
            <button
              onClick={() => {
                setOpenCajaFund("1000");
                setShowOpenCajaModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
            >
              <Unlock className="h-4 w-4" /> Abrir Caja con Fondo Inicial
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
      
      {/* LEFT: Product Catalog & Fast Scanner OR Recent Sales List */}
      <div className="flex-1 space-y-4">
        
        {/* Navigation Tabs for Catalog vs Recent Sales */}
        {!onlyPOSMode && (
          <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl border border-gray-200 dark:border-slate-800 gap-1.5 font-semibold">
            <button
              onClick={() => setViewMode("catalog")}
              className={`flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-2 font-bold cursor-pointer ${
                viewMode === "catalog"
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
              }`}
            >
              <Tag className="h-3.5 w-3.5" /> Catálogo de Productos
            </button>
            <button
              onClick={() => setViewMode("sales")}
              className={`flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-2 font-bold cursor-pointer ${
                viewMode === "sales"
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" /> Ventas Recientes / Historial de Hoy
            </button>
          </div>
        )}

        {viewMode === "sales" ? (
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs p-4 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-gray-800 dark:text-slate-200">Historial de Ventas</h3>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">Ventas procesadas en este dispositivo.</p>
              </div>
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold px-2.5 py-1 rounded-full font-mono">
                {db.sales.length} Ventas Totales
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-gray-500 dark:text-slate-400 font-bold border-b border-gray-100 dark:border-slate-800">
                    <th className="p-2.5">Folio</th>
                    <th className="p-2.5">Fecha/Hora</th>
                    <th className="p-2.5">Cliente</th>
                    <th className="p-2.5">Pago</th>
                    <th className="p-2.5 text-right">Total</th>
                    <th className="p-2.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {db.sales.map((sale: Sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 font-mono">
                      <td className="p-2.5 font-bold text-gray-800 dark:text-slate-200">{sale.ticketNumber}</td>
                      <td className="p-2.5 text-gray-500 text-[10px]">{sale.date}</td>
                      <td className="p-2.5 truncate max-w-[120px] uppercase text-gray-600 dark:text-slate-350">{sale.customerName || "Contado"}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          sale.paymentMethod === PaymentMethod.CREDIT 
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-455"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-455"
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-extrabold text-gray-900 dark:text-slate-100">${sale.total.toFixed(2)}</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => {
                            setLastCompletedSale(sale);
                            setShowReceipt(true);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 rounded text-[10px] font-bold transition-all cursor-pointer"
                        >
                          Ver Ticket
                        </button>
                      </td>
                    </tr>
                  ))}
                  {db.sales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400 font-mono">
                        No se han realizado ventas hoy. ¡Comienza a vender!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* SEARCH AND CATEGORY FILTER */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs space-y-3.5">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código de barras, marca o SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  id="pos-search-input"
                />
              </div>

              {/* Ultra-compact Classification Toolbar */}
              <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-gray-100 dark:border-slate-800/60 text-[11px]">
                {/* Depto Select */}
                <div className="flex-1 min-w-[110px] flex items-center gap-1.5 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded-lg border border-blue-100/60 dark:border-blue-900/30">
                  <span className="font-extrabold text-blue-600 dark:text-blue-400 uppercase text-[9px] tracking-wider shrink-0">Depto:</span>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-transparent font-bold border-none focus:outline-none focus:ring-0 text-slate-800 dark:text-white cursor-pointer py-0 text-[11px]"
                  >
                    <option value="Todos" className="bg-white dark:bg-slate-900">Todos</option>
                    {departments.filter(d => d !== "Todos").map((dept) => (
                      <option key={dept} value={dept} className="bg-white dark:bg-slate-900">{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Categoria Select */}
                <div className="flex-1 min-w-[110px] flex items-center gap-1.5 bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-1 rounded-lg border border-emerald-100/60 dark:border-emerald-900/30">
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-450 uppercase text-[9px] tracking-wider shrink-0">Línea:</span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-transparent font-bold border-none focus:outline-none focus:ring-0 text-slate-800 dark:text-white cursor-pointer py-0 text-[11px]"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat} className="bg-white dark:bg-slate-900">{cat === "Todos" ? "Todas" : cat}</option>
                    ))}
                  </select>
                </div>

                {/* Unidad Select */}
                <div className="flex-1 min-w-[110px] flex items-center gap-1.5 bg-purple-50/50 dark:bg-purple-950/20 px-2 py-1 rounded-lg border border-purple-100/60 dark:border-purple-900/30">
                  <span className="font-extrabold text-purple-600 dark:text-purple-400 uppercase text-[9px] tracking-wider shrink-0">Unidad:</span>
                  <select
                    value={selectedUnitType}
                    onChange={(e) => setSelectedUnitType(e.target.value)}
                    className="w-full bg-transparent font-bold border-none focus:outline-none focus:ring-0 text-slate-800 dark:text-white cursor-pointer py-0 text-[11px]"
                  >
                    <option value="Todos" className="bg-white dark:bg-slate-900">Todas</option>
                    <option value="Pieza" className="bg-white dark:bg-slate-900">Pieza</option>
                    <option value="Kilo" className="bg-white dark:bg-slate-900">Kilo</option>
                    <option value="Paquete" className="bg-white dark:bg-slate-900">Paquete</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Catalog Grid View */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto max-h-[60vh] lg:max-h-[66vh] pr-1">
              {paginatedProducts.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="group cursor-pointer p-2 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl hover:border-emerald-500/50 hover:shadow-md transition-all flex flex-col justify-between relative"
                  id={`catalog-card-${prod.id}`}
                >
                  <div>
                    {/* Product image rendering */}
                    <div className="w-full h-16 mb-1.5 bg-gray-50 dark:bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100 dark:border-slate-850 relative">
                      {prod.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={prod.name} 
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400 font-mono">Sin Foto</span>
                      )}

                      {/* Badge Stock Alert inside image */}
                      {prod.stock <= prod.stockMin ? (
                        <span className="absolute top-1 right-1 px-1 py-0.5 rounded text-[7px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-600 border border-amber-200/45 animate-pulse">
                          Bajo: {prod.stock}
                        </span>
                      ) : (
                        <span className="absolute top-1 right-1 px-1 py-0.5 rounded text-[7px] font-mono bg-slate-900/60 text-white font-bold">
                          Stock: {prod.stock}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold text-gray-400 uppercase font-mono">{prod.category}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInfoProduct(prod);
                        }}
                        className="p-0.5 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Ver Ficha Técnica"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </div>

                    <h4 className="font-bold text-[11px] text-gray-800 dark:text-slate-200 mt-0.5 truncate group-hover:text-emerald-600 transition-colors" title={prod.name}>
                      {prod.name}
                    </h4>
                    <p className="text-[9px] text-gray-400 mt-0.5 truncate">{prod.brand} | Cod: {prod.code}</p>
                    
                    {/* Compact Pricing with Direct Price Scheme Selectors */}
                    <div className="mt-1.5 space-y-1 text-[10px]">
                      <div 
                        onClick={(e) => { e.stopPropagation(); addToCart(prod, "Menudeo"); }}
                        className="flex justify-between items-center bg-emerald-500/5 dark:bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-1 rounded border border-emerald-500/20 cursor-pointer transition-colors"
                        title="Clic para agregar a precio de Menudeo"
                      >
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[8.5px] uppercase tracking-wider">Menudeo:</span>
                        <div className="text-right">
                          <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold text-[11px]">
                            ${formatPrice(prod.priceMin)}/{getUnitLabel(prod)}
                          </strong>
                          {isWeighed(prod) && (
                            <span className="text-[7.5px] text-gray-500 dark:text-slate-400 block -mt-0.5 font-mono">
                              (${(prod.priceMin / 1000).toFixed(4)}/g)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1 pt-0.5">
                        {prod.priceMed > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addToCart(prod, "Medio Mayoreo"); }}
                            className="text-[8.5px] font-mono px-1 py-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-center cursor-pointer flex flex-col items-center justify-center"
                            title="Clic para agregar a precio Medio Mayoreo"
                          >
                            <span className="text-[7.5px] text-blue-600 dark:text-blue-400 font-sans font-semibold">Med. Mayo:</span>
                            <strong className="font-extrabold">${formatPrice(prod.priceMed)}</strong>
                          </button>
                        ) : (
                          <div className="text-[8px] text-gray-300 dark:text-slate-700 text-center py-0.5 font-mono">Sin Med. Mayo</div>
                        )}

                        {prod.priceMax > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addToCart(prod, "Mayoreo"); }}
                            className="text-[8.5px] font-mono px-1 py-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-center cursor-pointer flex flex-col items-center justify-center"
                            title="Clic para agregar a precio Mayoreo"
                          >
                            <span className="text-[7.5px] text-amber-600 dark:text-amber-400 font-sans font-semibold">Mayoreo:</span>
                            <strong className="font-extrabold">${formatPrice(prod.priceMax)}</strong>
                          </button>
                        ) : (
                          <div className="text-[8px] text-gray-300 dark:text-slate-700 text-center py-0.5 font-mono">Sin Mayoreo</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Volume scale previews */}
                  <div className="mt-1.5 pt-1 border-t border-gray-100 dark:border-slate-850 flex items-center justify-between text-[8px] text-gray-400">
                    <span className="text-[7.5px] uppercase tracking-wider font-semibold font-mono bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded text-gray-500">
                      {prod.unit}
                    </span>
                    <span>Ubicación: <strong className="text-slate-600 dark:text-slate-300">{prod.location || "N/A"}</strong></span>
                  </div>
                </div>
              ))}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-12 flex flex-col items-center text-center text-gray-400">
                  <AlertCircle className="h-10 w-10 text-gray-350 dark:text-slate-700 mb-3" />
                  <p className="text-sm">No encontramos ningún producto para tu búsqueda.</p>
                  <button 
                    onClick={() => { setSearchTerm(""); setSelectedCategory("Todas"); }}
                    className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold font-bold"
                  >
                    Ver todos los productos
                  </button>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl text-xs">
                <span className="text-gray-500 dark:text-slate-400 font-mono text-[11px]">
                  Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} de {filteredProducts.length} productos
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer"
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
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                    title="Página Siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* RIGHT: Active Shopping Cart Area */}
      <div className="w-full lg:w-96 flex flex-col gap-4">
        
        <div className="flex-1 flex flex-col p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-sm min-h-[450px]">
          
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-bold text-gray-800 dark:text-slate-100">Carrito de Venta</h2>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
              {cart.reduce((sum, i) => sum + i.quantity, 0)} items
            </span>
          </div>

          {/* CUSTOMER SELECTOR */}
          <div className="mb-4 space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-emerald-600" /> Cliente / Perfil Comercial
            </label>
            <select
              onChange={(e) => handleCustomerChange(e.target.value)}
              value={selectedCustomer?.id || ""}
              className="w-full text-xs rounded-lg border border-gray-250 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              id="pos-customer-select"
            >
              <option value="">Venta de Público General (Menudeo)</option>
              {db.customers.map((c: Customer) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>

            {/* If specialized wholesaler chosen, show positive banner */}
            {selectedCustomer && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-slate-850/60 border border-amber-200 dark:border-slate-850 text-[10px] text-amber-800 dark:text-amber-400 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Tarifa aplicada: {selectedCustomer.role}</p>
                  <p className="opacity-80">Crédito disp: ${(selectedCustomer.creditLimit - selectedCustomer.creditUsed).toFixed(2)} MXN</p>
                </div>
                <TrendingDown className="h-4 w-4 text-emerald-600" />
              </div>
            )}
          </div>

          {/* Cart items scrollable list */}
          <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2.5 pr-1">
            {cart.map((item) => {
              const profitPerPza = item.selectedPrice - item.product.cost;
              const profitPct = item.product.cost > 0 ? (profitPerPza / item.product.cost) * 100 : 0;
              const uniqueKey = `${item.product.id}-${item.priceType}`;
              return (
                <div 
                  key={uniqueKey}
                  className="p-2.5 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex flex-col gap-1.5"
                  id={`cart-item-${item.product.id}-${item.priceType}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-gray-800 dark:text-slate-200 leading-tight">
                        {item.product.name}
                      </h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Cod: {item.product.code} | Unit: {item.product.unit}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id, item.priceType)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                      title="Remover producto del carrito"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Manual price switcher per product */}
                  <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-dashed border-gray-200 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-gray-500">Esquema de Precio:</span>
                      <select
                        value={item.priceType}
                        onChange={(e) => updateCartItemPriceType(item.product.id, item.priceType, e.target.value as any)}
                        className="text-[10px] font-bold rounded bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 px-1.5 py-0.5 text-gray-750 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="Menudeo">
                          Menudeo (${formatPrice(item.product.priceMin)}/{item.product.unit})
                        </option>
                        <option value="Medio Mayoreo">
                          Medio Mayoreo (${formatPrice(item.product.priceMed)}/{item.product.unit})
                        </option>
                        <option value="Mayoreo">
                          Mayoreo (${formatPrice(item.product.priceMax)}/{item.product.unit})
                        </option>
                      </select>
                    </div>
                    
                    {/* Profit margin (Admin Only) */}
                    {currentUser.role === UserRole.ADMIN && (
                      <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50/50 dark:bg-emerald-950/10 px-2 py-1 rounded">
                        <span>Ganancia x pieza:</span>
                        <span className="font-mono font-bold">
                          ${formatPrice(profitPerPza)} ({profitPct.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2.5 pt-1 border-t border-gray-150/40 dark:border-slate-850">
                    {/* Quantity adjustment buttons */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 px-1 py-0.5">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.priceType, -1)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 cursor-pointer"
                        title="Disminuir"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const baseLabel = getUnitLabel(item.product);
                          const activeUnit = item.inputUnit || (isWeighed(item.product) ? (baseLabel === 'L' ? 'L' : 'kg') : item.product.unit);
                          
                          let defaultValStr = item.quantity.toString();
                          if (isWeighed(item.product)) {
                            if (activeUnit === 'g') {
                              defaultValStr = kgToGrams(item.quantity).toString();
                            } else if (activeUnit === 'ml') {
                              defaultValStr = literToMl(item.quantity).toString();
                            } else {
                              defaultValStr = Number(item.quantity.toFixed(3)).toString();
                            }
                          }

                          const key = `${item.product.id}-${item.priceType}`;
                          const currentInputValue = localQuantities[key] !== undefined ? localQuantities[key] : defaultValStr;

                          return (
                            <input
                              type="number"
                              step="any"
                              className="text-xs font-mono font-bold w-14 text-center text-gray-800 dark:text-slate-200 bg-transparent border-none focus:outline-none focus:ring-0 focus:border-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={currentInputValue}
                              onChange={(e) => {
                                const text = e.target.value;
                                setLocalQuantities((prev) => ({ ...prev, [key]: text }));
                                
                                const val = parseFloat(text);
                                if (!isNaN(val) && val > 0) {
                                  updateCartItemQuantityDirectly(item.product.id, item.priceType, val, activeUnit);
                                }
                              }}
                              onBlur={() => {
                                const text = localQuantities[key];
                                if (text !== undefined) {
                                  const val = parseFloat(text);
                                  if (isNaN(val) || val <= 0) {
                                    setCart((prev) => prev.filter((i) => !(i.product.id === item.product.id && i.priceType === item.priceType)));
                                  }
                                  setLocalQuantities((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                          );
                        })()}

                        {isWeighed(item.product) ? (
                          <select
                            value={item.inputUnit || (getUnitLabel(item.product) === 'L' ? 'L' : 'kg')}
                            onChange={(e) => updateCartItemUnit(item.product.id, item.priceType, e.target.value)}
                            className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded px-1 py-0.5 focus:outline-none cursor-pointer"
                          >
                            {getUnitLabel(item.product) === 'L' ? (
                              <>
                                <option value="L">L</option>
                                <option value="ml">ml</option>
                              </>
                            ) : (
                              <>
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                              </>
                            )}
                          </select>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-semibold select-none pr-1">
                            {getUnitLabel(item.product)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.priceType, 1)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded text-gray-500 cursor-pointer"
                        title="Incrementar"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Price display and calculations */}
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-xs font-bold text-gray-800 dark:text-slate-200 font-mono">
                          ${formatPrice(calculateSubtotal(item.quantity, item.selectedPrice))}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 block">
                        c/{getUnitLabel(item.product)}: ${formatPrice(item.selectedPrice)}
                      </span>
                      {isWeighed(item.product) && (
                        <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 block font-bold mt-0.5">
                          ({kgToGrams(item.quantity)}g × ${getInformativePricePerGram(item.selectedPrice).toFixed(4)}/g)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Preset Buttons for Weighed / Gramaje Products */}
                  {isWeighed(item.product) && (
                    <div className="flex flex-wrap items-center gap-1 mt-1 pt-1 border-t border-dotted border-gray-200 dark:border-slate-800">
                      <span className="text-[9px] text-gray-400 font-semibold mr-1">Rápido (Gramaje):</span>
                      <button
                        type="button"
                        onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, 100, "g")}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        100g
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, 250, "g")}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        250g (1/4)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, 500, "g")}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        500g (1/2)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, 750, "g")}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        750g (3/4)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, 1, "kg")}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
                      >
                        1 Kg
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetMoneyStr = prompt(`¿Cuántos pesos ($) desea vender de ${item.product.name}? (Precio: $${item.selectedPrice}/${getUnitLabel(item.product)})`, "170");
                          if (targetMoneyStr) {
                            const money = parseFloat(targetMoneyStr);
                            if (!isNaN(money) && money > 0 && item.selectedPrice > 0) {
                              const calcKg = Number((money / item.selectedPrice).toFixed(3));
                              updateCartItemQuantityDirectly(item.product.id, item.priceType, calcKg, "kg");
                            }
                          }
                        }}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer flex items-center gap-0.5"
                        title="Vender por importe en dinero ($ MXN)"
                      >
                        <DollarSign className="h-2.5 w-2.5" />
                        Vender $
                      </button>
                      {item.product.gramajeBase && item.product.gramajeBase > 0 && (
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantityDirectly(item.product.id, item.priceType, item.product.gramajeBase!, "g")}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          Pres. ({item.product.gramajeBase}g)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {cart.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-gray-400">
                <ShoppingCart className="h-10 w-10 text-gray-350 dark:text-slate-800 mb-2.5" />
                <p className="text-xs">El carrito está vacío.</p>
                <p className="text-[10px] text-gray-400 mt-1 max-w-[200px]">
                  Haz clic en los productos del catálogo o introduce un código para vender.
                </p>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1.5">
              Forma de Pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod(PaymentMethod.CASH)}
                className={`
                  p-2 rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all
                  ${paymentMethod === PaymentMethod.CASH 
                    ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-500" 
                    : "bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:bg-gray-50"
                  }
                `}
                id="payment-method-cash-btn"
              >
                <DollarSign className="h-4.5 w-4.5" />
                Efectivo
              </button>
              <button
                onClick={() => {
                  if (!selectedCustomer) {
                    alert("Por favor selecciona un Cliente para poder fiar la venta a crédito.");
                    return;
                  }
                  setPaymentMethod(PaymentMethod.CREDIT);
                }}
                className={`
                  p-2 rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all
                  ${paymentMethod === PaymentMethod.CREDIT 
                    ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-500" 
                    : "bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:bg-gray-50"
                  }
                `}
                id="payment-method-credit-btn"
              >
                <CreditCard className="h-4.5 w-4.5" />
                Fiado (Crédito)
              </button>
            </div>

            {paymentMethod === PaymentMethod.CASH && (
              <div className="mt-3.5 space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/20 border border-gray-150 dark:border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold">Monto Recibido:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const exactStr = total.toFixed(2);
                        setRawAmountPaid(exactStr);
                        setAmountPaid(total);
                      }}
                      className="px-1.5 py-1 text-[9px] font-bold rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 transition-colors cursor-pointer"
                      title="Cobro exacto sin cambio"
                    >
                      Exacto
                    </button>
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1.5 font-mono text-[11px] text-gray-400">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={rawAmountPaid}
                        onChange={handleRawAmountPaidChange}
                        className="w-full text-right pl-6 pr-2 py-1.5 text-xs font-mono font-bold rounded bg-white dark:bg-slate-850 dark:text-white border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
                {amountPaid > 0 && (
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-dashed border-gray-200 dark:border-slate-800">
                    <span className="text-gray-500">Cambio:</span>
                    <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                      ${Math.max(0, amountPaid - total).toFixed(2)} MXN
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Checkout Error Messaging */}
          {checkoutError && (
            <div className="mt-3.5 p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-950/30 text-[10px] text-rose-700 dark:text-rose-400 font-semibold rounded-lg flex items-start gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{checkoutError}</span>
            </div>
          )}

          {/* Checkout pricing sum list */}
          <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-slate-800 space-y-1 text-xs">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal:</span>
              <span className="font-mono font-bold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-900 dark:text-white font-extrabold text-sm pt-1">
              <span>Monto Total:</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">${total.toFixed(2)} MXN</span>
            </div>
          </div>

          {/* Main Action Button */}
          {!isCajaOpen ? (
            <button
              onClick={() => {
                setOpenCajaFund("1000");
                setShowOpenCajaModal(true);
              }}
              id="checkout-open-caja-btn"
              className="w-full mt-3.5 py-3 rounded-xl font-bold text-sm shadow-md transition-all text-center flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white cursor-pointer active:scale-98 animate-pulse"
            >
              <Unlock className="h-4.5 w-4.5" />
              <span>Abrir Turno de Caja para Cobrar</span>
            </button>
          ) : (
            <button
              onClick={handleCheckout}
              id="checkout-trigger-btn"
              disabled={cart.length === 0}
              className={`
                w-full mt-3.5 py-3 rounded-xl font-bold text-sm shadow-xs transition-all text-center flex items-center justify-center gap-2
                ${cart.length > 0 
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white cursor-pointer active:scale-98" 
                  : "bg-gray-100 dark:bg-slate-850 text-gray-400 dark:text-slate-600 cursor-not-allowed"
                }
              `}
            >
              <Receipt className="h-4.5 w-4.5" />
              <span>Vender Ahora (Cobrar)</span>
            </button>
          )}
        </div>
      </div>
    </div>

      {/* TICKET RECEIPT MODAL */}
      {showReceipt && lastCompletedSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-255 dark:border-slate-850 overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="text-center pb-2 border-b border-dashed border-gray-200">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 mb-2">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-gray-800 dark:text-slate-200">¡Venta Exitosa!</h3>
              <p className="text-xs text-gray-500 mt-0.5">Ticket generado exitosamente</p>
            </div>

            {/* Receipt Body Frame (Simulated Thermal Printout) */}
            <div className="flex-1 overflow-y-auto my-4 bg-white p-7 rounded-xl border border-gray-200 font-mono text-[12px] text-gray-900 leading-relaxed shadow-sm printable-area">
              
              {/* Header Info */}
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-gray-400">
                <div className="flex justify-center items-center gap-1.5 text-emerald-800 font-bold mb-1">
                  <span className="text-base font-black tracking-wider">M A Z A L</span>
                </div>
                <p className="font-extrabold text-[11px] text-gray-800 uppercase">Distribuidor de productos desechables, plásticos y comestibles</p>
                <p className="text-[10px] text-gray-500">Manzana 008, 50830 Jiquipilco, Méx.</p>
                <p className="text-[10px] text-gray-500">Teléfono: 7121110085</p>
              </div>

              {/* Meta details */}
              <div className="py-2.5 border-b border-dashed border-gray-400 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span><strong>FOLIO / TICKET:</strong></span>
                  <span className="font-bold">{lastCompletedSale.ticketNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span><strong>FECHA/HORA:</strong></span>
                  <span>{lastCompletedSale.date}</span>
                </div>
                <div className="flex justify-between">
                  <span><strong>LE ATENDIÓ:</strong></span>
                  <span className="uppercase">{lastCompletedSale.userName}</span>
                </div>
                <div className="flex justify-between border-t border-dotted border-gray-300 pt-1 mt-1">
                  <span><strong>CLIENTE:</strong></span>
                  <span className="uppercase font-semibold">{lastCompletedSale.customerName || "VENTA AL PÚBLICO GENERAL"}</span>
                </div>
              </div>

              {/* Product items list */}
              <div className="py-3 border-b border-dashed border-gray-400 space-y-2">
                <div className="flex justify-between font-extrabold text-[11px] border-b border-gray-300 pb-1.5 uppercase tracking-wider">
                  <span>Detalle de Artículos</span>
                  <span>Total</span>
                </div>
                {lastCompletedSale.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5 text-[11.5px]">
                    <div className="font-bold text-gray-900 leading-tight">
                      {item.productName}
                    </div>
                    {(() => {
                      const prod = db.products.find((p) => p.id === item.productId);
                      const isW = isWeighed(prod) || (item.displayUnit && ['kg', 'g', 'l', 'ml'].includes(String(item.displayUnit).toLowerCase()));
                      const unitLabel = getUnitLabel(prod) || (item.displayUnit === 'g' ? 'Kg' : (item.displayUnit || 'pz'));
                      
                      let qtyStr = `${item.quantity} ${unitLabel}`;
                      if (isW) {
                        if (item.displayUnit === 'g' || (item.quantity < 1 && unitLabel === 'Kg')) {
                          qtyStr = `${kgToGrams(item.quantity)} g`;
                        } else if (item.displayUnit === 'ml' || (item.quantity < 1 && unitLabel === 'L')) {
                          qtyStr = `${literToMl(item.quantity)} ml`;
                        } else {
                          qtyStr = `${item.quantity.toFixed(3)} ${unitLabel}`;
                        }
                        qtyStr = `${qtyStr} x $${formatPrice(item.unitPrice)}/${unitLabel}`;
                      } else {
                        qtyStr = `${item.quantity} ${unitLabel} x $${formatPrice(item.unitPrice)}`;
                      }

                      return (
                        <div className="flex justify-between text-gray-500 text-[10.5px] pl-1">
                          <span>{qtyStr}</span>
                          <span className="font-bold text-gray-800">${formatPrice(item.totalPrice)}</span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {/* Financial calculations breakdown */}
              <div className="py-3 text-[11.5px] space-y-1.5 border-b border-dashed border-gray-400">
                <div className="flex justify-between text-gray-600">
                  <span>TOTAL DE ARTÍCULOS:</span>
                  <span className="font-bold">{calculateTotalArticles(lastCompletedSale.items, db.products)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-black pt-1.5 border-t border-dotted border-gray-300">
                  <span>TOTAL A PAGAR:</span>
                  <span>${lastCompletedSale.total.toFixed(2)} MXN</span>
                </div>
              </div>

              {/* Payment details */}
              <div className="py-2.5 text-[11px] space-y-1 bg-gray-50/50 p-2.5 rounded-lg mt-2 border border-gray-100">
                <div className="flex justify-between">
                  <span>MÉTODO DE PAGO:</span>
                  <span className="font-bold uppercase">{lastCompletedSale.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span>EFECTIVO RECIBIDO:</span>
                  <span>${(lastCompletedSale.amountPaid || lastCompletedSale.total).toFixed(2)} MXN</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-extrabold">
                  <span>SU CAMBIO:</span>
                  <span>${(lastCompletedSale.change || 0).toFixed(2)} MXN</span>
                </div>
              </div>

              {/* Footer messages */}
              <div className="text-center pt-2.5 border-t border-dashed border-gray-400 space-y-1 text-[9px] text-gray-500">
                <p className="font-semibold text-gray-800 text-[10px]">¡GRACIAS POR SU COMPRA!</p>
                <p>Conserve este ticket para devoluciones o aclaraciones</p>
                <p className="text-[7.5px] text-gray-400 mt-1 uppercase font-mono">{lastCompletedSale.ticketNumber}</p>
              </div>
            </div>

            {/* Modal Controls */}
            <div className="grid grid-cols-3 gap-2 mt-1 shrink-0 print:hidden">
              <button
                onClick={handlePrint}
                className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
                id="print-receipt-btn"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
              <button
                onClick={downloadReceiptPDF}
                className="py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
                id="download-receipt-pdf-btn"
              >
                <Receipt className="h-3.5 w-3.5" /> PDF
              </button>
              <button
                onClick={() => { 
                  setShowReceipt(false); 
                  setLastCompletedSale(null); 
                  if (onSaleComplete) onSaleComplete();
                }}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer text-center flex items-center justify-center"
                id="close-receipt-btn"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PRODUCT DETAIL / TECHNICAL CARD MODAL --- */}
      {infoProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3.5 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Info className="h-5 w-5 text-emerald-600" /> Ficha Técnica del Producto
              </h3>
              <button 
                onClick={() => setInfoProduct(null)} 
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Image Banner */}
              <div className="w-full h-48 bg-gray-50 dark:bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-gray-100 dark:border-slate-850">
                {infoProduct.imageUrl ? (
                  <img src={infoProduct.imageUrl} alt={infoProduct.name} className="h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-xs text-gray-400 font-mono">Sin imagen disponible</span>
                )}
              </div>

              {/* General details */}
              <div className="space-y-1">
                <span className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded-md bg-emerald-50 dark:bg-emerald-950/45 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                  {infoProduct.category}
                </span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1.5">{infoProduct.name}</h2>
                <p className="text-xs text-gray-500">{infoProduct.brand} | Unidad: {infoProduct.unit}</p>
              </div>

              {/* Technical identifiers Grid */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-slate-950 p-3 rounded-xl border border-gray-150 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px]">Código de Barras</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">{infoProduct.barcode || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">SKU</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">{infoProduct.sku || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Existencia Actual</span>
                  <strong className={`font-bold ${infoProduct.stock <= infoProduct.stockMin ? "text-amber-600" : "text-emerald-600"}`}>
                    {infoProduct.stock} unidades
                  </strong>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Ubicación en Tienda</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-bold">{infoProduct.location || "Sin asignar"}</strong>
                </div>
                {infoProduct.expiryDate && (
                  <div className="col-span-2">
                    <span className="text-gray-400 block text-[10px]">Fecha de Caducidad</span>
                    <strong className="text-rose-600 dark:text-rose-400 font-bold">{infoProduct.expiryDate}</strong>
                  </div>
                )}
              </div>

              {/* Multi-Price Schedule */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Esquema de Precios de Venta</h4>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-col justify-between min-h-[64px]">
                    <span className="text-gray-400 block text-[9px] uppercase font-bold">Menudeo</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 text-xs font-black">
                      ${formatPrice(infoProduct.priceMin)}/{getUnitLabel(infoProduct)}
                    </strong>
                    {isWeighed(infoProduct) && (
                      <span className="text-[8px] text-gray-500 font-semibold block">
                        (${formatPrice(getInformativePricePerGram(infoProduct.priceMin))}/g)
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-col justify-between min-h-[64px]">
                    <span className="text-gray-400 block text-[9px] uppercase font-bold font-semibold leading-tight">Med. Mayoreo (12+)</span>
                    <strong className="text-slate-700 dark:text-slate-200 text-xs font-black">
                      ${formatPrice(infoProduct.priceMed)}/{getUnitLabel(infoProduct)}
                    </strong>
                    {isWeighed(infoProduct) && (
                      <span className="text-[8px] text-gray-500 font-semibold block">
                        (${formatPrice(getInformativePricePerGram(infoProduct.priceMed))}/g)
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-col justify-between min-h-[64px]">
                    <span className="text-gray-400 block text-[9px] uppercase font-bold font-semibold leading-tight">Mayoreo (50+)</span>
                    <strong className="text-slate-700 dark:text-slate-200 text-xs font-black">
                      ${formatPrice(infoProduct.priceMax)}/{getUnitLabel(infoProduct)}
                    </strong>
                    {isWeighed(infoProduct) && (
                      <span className="text-[8px] text-gray-500 font-semibold block">
                        (${formatPrice(getInformativePricePerGram(infoProduct.priceMax))}/g)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => {
                  addToCart(infoProduct);
                  setInfoProduct(null);
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Agregar al Carrito de Ventas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 1. OPEN CAJA MODAL --- */}
      {showOpenCajaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
                  <Unlock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Apertura de Caja (Turno)</h3>
                  <p className="text-xs text-gray-500">Inicia tu turno para poder procesar ventas</p>
                </div>
              </div>
              <button onClick={() => setShowOpenCajaModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleOpenCajaSubmit} className="mt-4 space-y-4">
              <div className="bg-gray-50 dark:bg-slate-950/50 p-3 rounded-xl border border-gray-100 dark:border-slate-800 space-y-1.5 text-xs text-gray-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Responsable:</span>
                  <span className="font-bold text-gray-900 dark:text-white uppercase">{currentUser.name} ({currentUser.role})</span>
                </div>
                <div className="flex justify-between">
                  <span>Sucursal:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{activeBranch || "Norte"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fecha y Hora:</span>
                  <span className="font-mono">{new Date().toLocaleString("es-MX")}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Fondo Inicial de Efectivo en Caja ($ MXN)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openCajaFund}
                    onChange={(e) => setOpenCajaFund(e.target.value)}
                    placeholder="1000.00"
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Efectivo con el que inicias para dar cambio a los clientes.</p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOpenCajaModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1"
                >
                  <Unlock className="h-4 w-4" /> Confirmar Apertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 2. CLOSE CAJA / CORTE MODAL --- */}
      {showCloseCajaModal && activeCashSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 animate-scaleIn flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Corte y Cierre de Caja</h3>
                  <p className="text-xs text-gray-500">Arqueo final del turno {activeCashSession.id}</p>
                </div>
              </div>
              <button onClick={() => setShowCloseCajaModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleCloseCajaSubmit} className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Financial breakdown */}
              <div className="bg-gray-50 dark:bg-slate-950/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600 dark:text-slate-400">
                  <span>(+) Fondo Inicial de Apertura:</span>
                  <span className="font-bold text-gray-900 dark:text-white">${activeCashSession.initialCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>(+) Total Ventas en Efectivo:</span>
                  <span className="font-bold">+${cashSalesTotal.toFixed(2)}</span>
                </div>
                {otherSalesTotal > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>(Info) Ventas Tarjeta / Transfer / Crédito:</span>
                    <span>${otherSalesTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>(-) Total Gastos / Salidas en Efectivo:</span>
                  <span className="font-bold">-${sessionExpensesTotal.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-dashed border-gray-300 dark:border-slate-700 flex justify-between text-sm font-black text-gray-900 dark:text-white">
                  <span>(=) TOTAL EFECTIVO ESPERADO EN CAJA:</span>
                  <span className="text-emerald-700 dark:text-emerald-400">${expectedCashInDrawer.toFixed(2)} MXN</span>
                </div>
              </div>

              {/* Physical Cash Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Efectivo Físico Arqueado / Contado ($ MXN) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={closeCajaPhysicalCash}
                    onChange={(e) => setCloseCajaPhysicalCash(e.target.value)}
                    placeholder="Monto real contado en el cajón"
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-bold text-lg focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Live difference preview */}
                {closeCajaPhysicalCash !== "" && (
                  (() => {
                    const counted = parseFloat(closeCajaPhysicalCash) || 0;
                    const diff = counted - expectedCashInDrawer;
                    return (
                      <div className={`mt-2 p-2.5 rounded-xl border text-xs font-bold flex justify-between items-center ${
                        Math.abs(diff) < 0.01 
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : diff > 0 
                            ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                            : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}>
                        <span>Resultado del Arqueo:</span>
                        <span>
                          {Math.abs(diff) < 0.01 
                            ? "🟢 Cuadre Exacto ($0.00)" 
                            : diff > 0 
                              ? `🔵 Sobrante (+${diff.toFixed(2)} MXN)` 
                              : `🔴 Faltante (-${Math.abs(diff).toFixed(2)} MXN)`}
                        </span>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Observaciones / Comentarios del Corte
                </label>
                <textarea
                  rows={2}
                  value={closeCajaNotes}
                  onChange={(e) => setCloseCajaNotes(e.target.value)}
                  placeholder="Turno sin incidentes, entrega de valores a gerencia..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCloseCajaModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 font-bold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1"
                >
                  <Lock className="h-4 w-4" /> Confirmar Cierre y Corte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 3. CORTE RECEIPT / PRINT MODAL --- */}
      {showCorteReceiptModal && lastClosedSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 animate-scaleIn flex flex-col max-h-[90vh]">
            <div className="text-center pb-2 border-b border-dashed border-gray-200">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 mb-2">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-gray-800 dark:text-slate-200">¡Corte de Caja Finalizado!</h3>
              <p className="text-xs text-gray-500 mt-0.5">La sesión de caja ha sido cerrada y guardada en MySQL</p>
            </div>

            <div className="flex-1 overflow-y-auto my-4 bg-white p-6 rounded-xl border border-gray-200 font-mono text-[11px] text-gray-900 leading-relaxed shadow-sm">
              <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-400">
                <span className="text-base font-black tracking-wider">M A Z A L</span>
                <p className="font-bold text-[10px]">CORTE Y ARQUEO DE CAJA</p>
              </div>

              <div className="py-2 border-b border-dashed border-gray-400 space-y-1">
                <div className="flex justify-between"><span>FOLIO:</span><span className="font-bold">{lastClosedSession.id}</span></div>
                <div className="flex justify-between"><span>RESPONSABLE:</span><span className="font-bold uppercase">{lastClosedSession.openedBy}</span></div>
                <div className="flex justify-between"><span>APERTURA:</span><span>{lastClosedSession.startTime}</span></div>
                <div className="flex justify-between"><span>CIERRE:</span><span>{lastClosedSession.endTime}</span></div>
              </div>

              <div className="py-2 space-y-1 border-b border-dashed border-gray-400">
                <div className="flex justify-between"><span>(+) Fondo Inicial:</span><span>${lastClosedSession.initialCash.toFixed(2)}</span></div>
                <div className="flex justify-between text-emerald-700 font-bold"><span>(+) Ventas Efectivo:</span><span>${(lastClosedSession.salesTotal || 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-rose-700"><span>(-) Gastos/Salidas:</span><span>-${(lastClosedSession.expensesTotal || 0).toFixed(2)}</span></div>
              </div>

              <div className="py-2 space-y-1.5 border-b border-dashed border-gray-400">
                <div className="flex justify-between font-bold"><span>EFECTIVO ESPERADO:</span><span>${(lastClosedSession.expectedFinalCash || 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-emerald-800"><span>EFECTIVO CONTADO:</span><span>${(lastClosedSession.finalCash || 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-black pt-1 border-t border-dotted border-gray-300">
                  <span>DIFERENCIA:</span>
                  <span>{((lastClosedSession.finalCash || 0) - (lastClosedSession.expectedFinalCash || 0)) >= 0 ? "+" : ""}${((lastClosedSession.finalCash || 0) - (lastClosedSession.expectedFinalCash || 0)).toFixed(2)} MXN</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-1">
              <button
                onClick={() => {
                  const active = localStorage.getItem("mazal_active_branch");
                  const bName = active === "Sur" ? "MAZAL 2" : "MAZAL 1";
                  printCorteDeCajaTicket(lastClosedSession, bName);
                }}
                className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
              <button
                onClick={() => {
                  const active = localStorage.getItem("mazal_active_branch");
                  const bName = active === "Sur" ? "MAZAL 2" : "MAZAL 1";
                  generateCortePDF(lastClosedSession, bName);
                }}
                className="py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
              >
                <Receipt className="h-3.5 w-3.5" /> PDF
              </button>
              <button
                onClick={() => {
                  setShowCorteReceiptModal(false);
                  setLastClosedSession(null);
                }}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-xl shadow-xs transition-all cursor-pointer text-center flex items-center justify-center"
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
