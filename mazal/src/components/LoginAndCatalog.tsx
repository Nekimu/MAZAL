/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShoppingBag, 
  Info, 
  Package, 
  BadgePercent, 
  Tag, 
  Store, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Barcode, 
  Compass, 
  Users, 
  Grid, 
  Sparkles, 
  Sun,
  Moon,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Layers,
  ShieldCheck,
  Zap,
  TrendingDown
} from "lucide-react";
import { Product, User, UserRole, ProductUnit, formatPrice } from "../types";
import { getDatabase, logAction } from "../data";
import { MazalLogo } from "./MazalLogo";

interface LoginAndCatalogProps {
  currentBranch?: string;
  onBranchChange?: (branch: "Norte" | "Sur") => void;
  onLoginSuccess: (user: { name: string; role: UserRole }, onlyPOS?: boolean) => void;
  onBackToBranch?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}

const ITEMS_PER_PAGE = 24;

export default function LoginAndCatalog({ 
  currentBranch = "Norte",
  onBranchChange,
  onLoginSuccess, 
  onBackToBranch, 
  theme = "light", 
  onToggleTheme 
}: LoginAndCatalogProps) {
  const db = getDatabase();
  const products: Product[] = Array.isArray(db?.products) ? db.products : [];
  const users: User[] = Array.isArray(db?.users) ? db.users : [];

  // Drawer state for Employee / Staff login
  const [showStaffDrawer, setShowStaffDrawer] = useState(false);

  // Catalog Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("Todos");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedUnitType, setSelectedUnitType] = useState("Todos");
  const [sortBy, setSortBy] = useState<"name-asc" | "price-asc" | "price-desc" | "stock-desc">("name-asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Login State inside Drawer
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Derived Departments list (Unique & Sorted)
  const departments = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.departamento && p.departamento.trim()) {
        set.add(p.departamento.trim());
      }
    });
    return ["Todos", ...Array.from(set).sort()];
  }, [products]);

  // Derived Categories list based on department
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      const matchesDept = selectedDepartment === "Todos" || (p.departamento || "General") === selectedDepartment;
      if (matchesDept && p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return ["Todos", ...Array.from(set).sort()];
  }, [products, selectedDepartment]);

  // Reset category if not in selected department
  useEffect(() => {
    if (selectedCategory !== "Todos" && !categories.includes(selectedCategory)) {
      setSelectedCategory("Todos");
    }
  }, [selectedDepartment, selectedCategory, categories]);

  // Reset page on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, selectedCategory, selectedUnitType, sortBy]);

  // Fast Memoized Product Filtering and Sorting
  const filteredAndSortedProducts = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();

    const filtered = products.filter(p => {
      if (!p) return false;

      // Text search
      if (cleanSearch) {
        const name = (p.name || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        const category = (p.category || "").toLowerCase();
        const dept = (p.departamento || "").toLowerCase();

        const matches = 
          name.includes(cleanSearch) || 
          brand.includes(cleanSearch) || 
          barcode.includes(cleanSearch) || 
          category.includes(cleanSearch) || 
          dept.includes(cleanSearch);

        if (!matches) return false;
      }

      // Department filter
      if (selectedDepartment !== "Todos") {
        const pDept = p.departamento || "General";
        if (pDept !== selectedDepartment) return false;
      }

      // Category filter
      if (selectedCategory !== "Todos") {
        if (p.category !== selectedCategory) return false;
      }

      // Unit filter
      if (selectedUnitType !== "Todos") {
        const u = (p.unit || p.unidad || "").toLowerCase();
        const t = (p.tipoVenta || "").toLowerCase();
        if (selectedUnitType === "Pieza") {
          if (!u.includes("pza") && !u.includes("ud") && !t.includes("pieza")) return false;
        } else if (selectedUnitType === "Kilo") {
          if (!u.includes("kg") && !u.includes("gram") && !u.includes("g") && !t.includes("peso")) return false;
        } else if (selectedUnitType === "Paquete") {
          if (!u.includes("paq") && !u.includes("caja") && !t.includes("paquete") && !u.includes("paquete")) return false;
        }
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === "price-asc") {
        return (a.priceMin || 0) - (b.priceMin || 0);
      }
      if (sortBy === "price-desc") {
        return (b.priceMin || 0) - (a.priceMin || 0);
      }
      if (sortBy === "stock-desc") {
        return (b.stock || 0) - (a.stock || 0);
      }
      // default: name-asc
      return (a.name || "").localeCompare(b.name || "");
    });

    return filtered;
  }, [products, searchTerm, selectedDepartment, selectedCategory, selectedUnitType, sortBy]);

  // Paginated Slice for 60fps instant UI
  const totalItems = filteredAndSortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedProducts, currentPage]);

  // Handle Login submission in Slide Drawer
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!username.trim() || !password.trim()) {
      setErrorMsg("Por favor, ingresa tu usuario y contraseña.");
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = users.find(
      u => (u.username || "").toLowerCase() === cleanUsername && u.password === password.trim()
    );

    if (!user) {
      setErrorMsg("Usuario o contraseña incorrectos. Verifica tus credenciales.");
      return;
    }

    if (user.status === "Inactivo") {
      setErrorMsg("Tu cuenta se encuentra inactiva. Comunícate con el Administrador.");
      return;
    }

    logAction(
      user.name,
      user.role,
      "Inicio de Sesión",
      `El colaborador @${user.username} ingresó al ERP central desde el portal de inicio.`
    );

    setSuccessMsg(`¡Bienvenido de vuelta, ${user.name}! Redireccionando...`);
    
    setTimeout(() => {
      setShowStaffDrawer(false);
      onLoginSuccess({
        name: user.name,
        role: user.role
      });
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#f4f6f0] dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300" id="login-and-catalog-container">
       {/* ========================================================================= */}
      {/* 1. TOP NAVBAR / HEADER */}
      {/* ========================================================================= */}
      <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 py-2.5 px-3 sm:px-6 sticky top-0 z-40 shadow-xs">
        <div className="max-w-[1720px] mx-auto w-full flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-3 sm:gap-4">
            <MazalLogo size="md" showSubtitle={false} />
            <div className="flex flex-col border-l border-gray-200 dark:border-slate-800 pl-3 sm:pl-4">
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-[11px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider font-mono flex items-center gap-1.5 border border-emerald-200/60 dark:border-emerald-800/60 shadow-2xs">
                  <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  {currentBranch === "Sur" ? "Mazal 2" : "Mazal 1"} &bull; Catálogo Mayorista
                </span>
              </h1>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 hidden sm:block">Precios transparentes de menudeo, medio mayoreo y mayoreo para clientes</p>
            </div>
          </div>
          
          {/* Responsive adaptive action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            
            {/* Theme switcher */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                id="catalog-theme-toggle"
                className="h-9 px-3 min-w-[125px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold border border-gray-200 dark:border-slate-750 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
                aria-label="Alternar modo claro/oscuro"
              >
                {theme === "light" ? (
                  <>
                    <Moon className="h-4 w-4 text-slate-700" />
                    <span>Modo Oscuro</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-4 w-4 text-amber-400" />
                    <span>Modo Claro</span>
                  </>
                )}
              </button>
            )}

            {/* Original Cambiar Sucursal button that opens the BranchGate modal */}
            {onBackToBranch && (
              <button
                onClick={onBackToBranch}
                id="btn-cambiar-sucursal"
                className="h-9 px-2.5 sm:px-3.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold rounded-xl border border-emerald-200 dark:border-emerald-800/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                title="Cambiar sucursal con contraseña de acceso"
              >
                <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">Cambiar Sucursal</span>
              </button>
            )}

            {/* Quick POS action */}
            <button
              onClick={() => {
                const quickUser = { name: "Caja Rápida", role: UserRole.CASHIER };
                logAction(quickUser.name, quickUser.role, "Acceso Rápido POS", "Inició sesión directa en modo exclusivo de Punto de Venta.");
                onLoginSuccess(quickUser, true);
              }}
              className="h-9 px-2.5 sm:px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-750 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
              title="Acceso directo a terminal de cobro"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Punto de Venta</span>
            </button>

            {/* SLIDE-OVER STAFF DRAWER TRIGGER BUTTON */}
            <button
              onClick={() => setShowStaffDrawer(true)}
              id="open-staff-drawer-btn"
              className="h-9 px-3 sm:px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:from-emerald-800 active:to-teal-900 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ring-2 ring-emerald-500/20 hover:ring-emerald-500/40 shrink-0"
            >
              <Lock className="h-3.5 w-3.5 text-emerald-200" />
              <span>Acceso Colaboradores</span>
              <ArrowRight className="h-3 w-3 text-emerald-300 hidden sm:inline" />
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH CLIENT-CENTRIC STOREFRONT */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-[1720px] mx-auto w-full p-4 md:p-6 space-y-5">
        
        {/* Welcome / Wholesale Promotional Banner */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 p-6 md:p-8 rounded-3xl text-white relative overflow-hidden shadow-sm">
          <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
            <ShoppingBag className="h-64 w-64" />
          </div>
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-xs">
                <Zap className="h-3.5 w-3.5 fill-current" /> Precios de Mayoreo Activos
              </span>
              <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-bold text-white">
                <Store className="h-3.5 w-3.5 text-emerald-300" /> {products.length} Productos en Catálogo
              </span>
            </div>
            
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight leading-tight text-white">
              Consulta Precios, Existencias y Ahorra por Mayoreo
            </h2>
            <p className="text-xs md:text-sm text-white leading-relaxed font-semibold drop-shadow-xs">
              Consulta en tiempo real nuestro surtido para tiendas, negocios y familias. Precios especiales automáticos al llevar desde <strong className="text-amber-300 font-extrabold underline decoration-amber-400">12 piezas (Medio Mayoreo)</strong> o <strong className="text-amber-300 font-extrabold underline decoration-amber-400">50 piezas (Mayoreo Especial)</strong>.
            </p>
          </div>
        </div>

        {/* 1. Main Search Bar - STICKY ONLY TO SEARCH BAR WITH SAFE VERTICAL PADDING */}
        <div className="sticky top-[56px] sm:top-[62px] z-30 py-2 -my-2 bg-[#f4f6f0]/95 dark:bg-slate-950/95 backdrop-blur-md transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-md">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="¿Qué producto buscas hoy? Escribe nombre, marca o código de barras..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs md:text-sm pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                  id="catalog-search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Quick Result Counter */}
              <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xs font-bold text-center shrink-0 flex items-center justify-center gap-2">
                <Grid className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>{totalItems} artículos encontrados</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Filters Row - NON STICKY (Omitidos del sticky) */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-2xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            
            {/* Department Select */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800">
              <span className="font-extrabold text-gray-500 dark:text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Depto:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full bg-transparent font-bold border-none focus:outline-none text-slate-800 dark:text-white cursor-pointer text-xs"
              >
                <option value="Todos" className="bg-white dark:bg-slate-900">Todos ({departments.length - 1})</option>
                {departments.filter(d => d !== "Todos").map((dept) => (
                  <option key={dept} value={dept} className="bg-white dark:bg-slate-900">{dept}</option>
                ))}
              </select>
            </div>

            {/* Category Select */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800">
              <span className="font-extrabold text-gray-500 dark:text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Categoría:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-transparent font-bold border-none focus:outline-none text-slate-800 dark:text-white cursor-pointer text-xs"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-white dark:bg-slate-900">{cat === "Todos" ? `Todas (${categories.length - 1})` : cat}</option>
                ))}
              </select>
            </div>

            {/* Unit Select */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800">
              <span className="font-extrabold text-gray-500 dark:text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Unidad:</span>
              <select
                value={selectedUnitType}
                onChange={(e) => setSelectedUnitType(e.target.value)}
                className="w-full bg-transparent font-bold border-none focus:outline-none text-slate-800 dark:text-white cursor-pointer text-xs"
              >
                <option value="Todos" className="bg-white dark:bg-slate-900">Todas las Unidades</option>
                <option value="Pieza" className="bg-white dark:bg-slate-900">Pieza / Unidad</option>
                <option value="Kilo" className="bg-white dark:bg-slate-900">Kilo / Granel</option>
                <option value="Paquete" className="bg-white dark:bg-slate-900">Paquete / Caja</option>
              </select>
            </div>

            {/* Sort Order Select */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-800">
              <span className="font-extrabold text-gray-500 dark:text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-transparent font-bold border-none focus:outline-none text-slate-800 dark:text-white cursor-pointer text-xs"
              >
                <option value="name-asc" className="bg-white dark:bg-slate-900">Nombre (A - Z)</option>
                <option value="price-asc" className="bg-white dark:bg-slate-900">Precio: Menor a Mayor</option>
                <option value="price-desc" className="bg-white dark:bg-slate-900">Precio: Mayor a Menor</option>
                <option value="stock-desc" className="bg-white dark:bg-slate-900">Mayor Existencia</option>
              </select>
            </div>
          </div>

          {/* Active Filter Badges */}
          {(searchTerm || selectedDepartment !== "Todos" || selectedCategory !== "Todos" || selectedUnitType !== "Todos") && (
            <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-gray-100 dark:border-slate-800 text-xs">
              <span className="text-[11px] text-gray-400 font-medium">Filtros activos:</span>
              {searchTerm && (
                <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-lg font-semibold flex items-center gap-1">
                  Búsqueda: "{searchTerm}"
                  <button onClick={() => setSearchTerm("")} className="hover:text-emerald-900">✕</button>
                </span>
              )}
              {selectedDepartment !== "Todos" && (
                <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg font-semibold flex items-center gap-1">
                  Depto: {selectedDepartment}
                  <button onClick={() => setSelectedDepartment("Todos")} className="hover:text-blue-900">✕</button>
                </span>
              )}
              {selectedCategory !== "Todos" && (
                <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 rounded-lg font-semibold flex items-center gap-1">
                  Categoría: {selectedCategory}
                  <button onClick={() => setSelectedCategory("Todos")} className="hover:text-purple-900">✕</button>
                </span>
              )}
              {selectedUnitType !== "Todos" && (
                <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-lg font-semibold flex items-center gap-1">
                  Unidad: {selectedUnitType}
                  <button onClick={() => setSelectedUnitType("Todos")} className="hover:text-amber-900">✕</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedDepartment("Todos");
                  setSelectedCategory("Todos");
                  setSelectedUnitType("Todos");
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline ml-2"
              >
                Limpiar todo
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. PRODUCT CARDS GRID (Optimized Batches) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {paginatedProducts.map((p) => {
            const stockNum = Number(p.stock) || 0;
            let stockIcon = <CheckCircle className="h-3 w-3 text-emerald-500" />;
            let stockLabel = "En Existencia";
            let stockBg = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/40";
            
            if (stockNum <= 0) {
              stockIcon = <XCircle className="h-3 w-3 text-rose-500" />;
              stockLabel = "Agotado Temporal";
              stockBg = "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40";
            } else if (stockNum <= 10) {
              stockIcon = <AlertTriangle className="h-3 w-3 text-amber-500" />;
              stockLabel = `Últimas ${stockNum} pzas`;
              stockBg = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40";
            }

            return (
              <div 
                key={p.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-3.5 flex flex-col justify-between hover:border-emerald-400 dark:hover:border-emerald-500/50 transition-all hover:shadow-md group relative"
                id={`public-card-${p.id}`}
              >
                <div className="space-y-2.5">
                  {/* Image & Badge Container */}
                  <div className="relative h-28 bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-gray-150 dark:border-slate-800">
                    {p.imageUrl ? (
                      <img 
                        src={p.imageUrl} 
                        alt={p.name} 
                        referrerPolicy="no-referrer"
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300 relative z-10"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 z-0">
                      <ShoppingBag className="h-8 w-8 stroke-[1.5]" />
                      <span className="text-[9px] uppercase font-bold mt-1 font-mono">{p.unit || "Pza"}</span>
                    </div>
                    
                    {/* Category floating chip */}
                    <span className="absolute top-2 left-2 bg-slate-900/85 backdrop-blur-xs text-white text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider z-20">
                      {p.category || "General"}
                    </span>
                  </div>

                  {/* Stock status pill */}
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${stockBg}`}>
                    {stockIcon}
                    <span>{stockLabel}</span>
                  </div>

                  {/* Brand and Name */}
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-extrabold text-gray-400 dark:text-slate-400 uppercase tracking-wider truncate">
                      {p.brand || "Distribución"}
                    </p>
                    <h3 className="font-bold text-xs text-slate-850 dark:text-white line-clamp-2 h-8 leading-snug" title={p.name}>
                      {p.name}
                    </h3>
                  </div>

                  {/* Tiered Price Matrix */}
                  <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-slate-800">
                    
                    {/* Retail Primary Price */}
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                      <span className="text-[9px] font-bold text-emerald-800 dark:text-emerald-400 uppercase">Menudeo:</span>
                      <strong className="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">
                        ${formatPrice(p.priceMin)}
                      </strong>
                    </div>

                    {/* Wholesale Tiers (12+ and 50+) */}
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
                      <div className="bg-slate-50 dark:bg-slate-950/60 p-1 rounded border border-gray-100 dark:border-slate-800 text-center">
                        <span className="text-gray-400 block text-[8px]">12+ pzas</span>
                        <strong className="text-teal-600 dark:text-teal-400 font-bold">${formatPrice(p.priceMed)}</strong>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/60 p-1 rounded border border-gray-100 dark:border-slate-800 text-center">
                        <span className="text-gray-400 block text-[8px]">50+ pzas</span>
                        <strong className="text-amber-600 dark:text-amber-400 font-bold">${formatPrice(p.priceMax)}</strong>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Footer card action */}
                <div className="pt-2.5 mt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-gray-400 flex items-center gap-1">
                    <Barcode className="h-3 w-3" />
                    {p.barcode || "S/C"}
                  </span>
                  
                  <button
                    onClick={() => setSelectedProduct(p)}
                    className="text-[9px] font-extrabold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-emerald-200/60 dark:border-slate-700 cursor-pointer transition-colors"
                  >
                    <Info className="h-3 w-3" />
                    Ver Ficha
                  </button>
                </div>
              </div>
            );
          })}

          {paginatedProducts.length === 0 && (
            <div className="col-span-full py-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-gray-200 dark:border-slate-800">
              <Compass className="h-10 w-10 text-gray-300 mx-auto animate-spin" style={{ animationDuration: "10s" }} />
              <p className="text-gray-500 font-bold text-sm">No se encontraron productos que coincidan con la búsqueda.</p>
              <p className="text-gray-400 text-xs">Intenta buscando otras palabras clave o seleccionando otra categoría.</p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedDepartment("Todos");
                  setSelectedCategory("Todos");
                  setSelectedUnitType("Todos");
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. PAGINATION BAR */}
        {/* ========================================================================= */}
        {totalPages > 1 && (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Mostrando página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({totalItems} artículos en total)
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 rounded-lg border border-gray-200 dark:border-slate-750 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>

              {/* Number buttons */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      currentPage === pageNum
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-gray-200 dark:border-slate-750 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 rounded-lg border border-gray-200 dark:border-slate-750 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* 5. FOOTER */}
      {/* ========================================================================= */}
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 py-4 px-6 text-center text-xs text-gray-400 dark:text-slate-500 mt-auto">
        <p>Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026</p>
      </footer>

      {/* ========================================================================= */}
      {/* 6. SLIDE-OVER STAFF / COLLABORATORS DRAWER (Panel Deslizable Oculto) */}
      {/* ========================================================================= */}
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity duration-300 ${
          showStaffDrawer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setShowStaffDrawer(false)}
      />

      {/* Drawer Container */}
      <aside 
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out ${
          showStaffDrawer ? "translate-x-0" : "translate-x-full"
        }`}
        id="staff-login-drawer"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-gray-150 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                Portal de Colaboradores
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                Ingreso al sistema administrativo
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowStaffDrawer(false)}
            className="h-8 w-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
            <p className="font-bold flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Sucursal: {currentBranch === "Sur" ? "MAZAL 2 (Sur)" : "MAZAL 1 (Norte)"}
            </p>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1">
              Acceso seguro para personal autorizado.
            </p>
          </div>

          {/* Feedback banners */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs font-semibold text-center animate-fadeIn">
              {successMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-semibold text-center animate-fadeIn">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4" autoComplete="off">
            
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-gray-500 dark:text-slate-400 uppercase block tracking-wider">
                Nombre de Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuario"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white font-mono"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-gray-500 dark:text-slate-400 uppercase block tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full text-xs p-3 pr-10 bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Validar e Ingresar</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick POS express action */}
          <div className="pt-4 border-t border-gray-150 dark:border-slate-800 space-y-3">
            <span className="text-[10px] font-extrabold text-gray-400 dark:text-slate-500 uppercase tracking-widest block text-center">
              Acceso Rápido Directo
            </span>

            <button
              type="button"
              onClick={() => {
                setShowStaffDrawer(false);
                const quickUser = { name: "Caja Rápida", role: UserRole.CASHIER };
                logAction(quickUser.name, quickUser.role, "Acceso Rápido POS", "Inició sesión directa en modo exclusivo de Punto de Venta.");
                onLoginSuccess(quickUser, true);
              }}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer border border-gray-200 dark:border-slate-750"
            >
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
              <span>Abrir Modo Punto de Venta (Solo Caja)</span>
            </button>
          </div>

        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-gray-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-center">
          <p className="text-[10px] text-gray-400 dark:text-slate-500">
            Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026
          </p>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 7. PRODUCT DETAIL MODAL */}
      {/* ========================================================================= */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-gray-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl animate-zoomIn relative">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-300 flex items-center justify-center font-bold border border-gray-200 dark:border-slate-700 cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-1.5">
              <span className="text-[9px] uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 font-black px-2.5 py-0.5 rounded-full">
                {selectedProduct.category || "General"}
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                {selectedProduct.name}
              </h3>
              <p className="text-xs text-gray-400">Marca: <strong>{selectedProduct.brand || "Distribución"}</strong></p>
            </div>

            {/* Wholesale Price Hierarchy Box */}
            <div className="grid grid-cols-3 gap-2.5 pt-2">
              <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-gray-100 dark:border-slate-850 space-y-1 text-center">
                <span className="text-[8px] font-extrabold uppercase text-gray-400 block leading-none">Menudeo<br />(1-11 pzas)</span>
                <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-black block">${formatPrice(selectedProduct.priceMin)}</strong>
                <p className="text-[8px] text-gray-400 font-medium">Por {selectedProduct.unit || "Pza"}</p>
              </div>

              <div className="bg-teal-50/40 dark:bg-teal-950/20 p-2.5 rounded-xl border border-teal-100/50 dark:border-teal-900/30 space-y-1 text-center">
                <span className="text-[8px] font-extrabold uppercase text-teal-700 dark:text-teal-400 block leading-none">Medio Mayoreo<br />(12-49 pzas)</span>
                <strong className="text-teal-600 dark:text-teal-300 text-sm font-black block">${formatPrice(selectedProduct.priceMed)}</strong>
                <p className="text-[8px] text-teal-500 font-medium">Ahorro activo</p>
              </div>

              <div className="bg-amber-50/40 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-100/50 dark:border-amber-900/30 space-y-1 text-center">
                <span className="text-[8px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block leading-none">Mayoreo Especial<br />(50+ pzas)</span>
                <strong className="text-amber-600 dark:text-amber-300 text-sm font-black block">${formatPrice(selectedProduct.priceMax)}</strong>
                <p className="text-[8px] text-amber-500 font-medium">Súper ahorro</p>
              </div>
            </div>

            {/* Spec details */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-gray-150 dark:border-slate-850 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-slate-800">
                <span className="text-gray-500 flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" /> Unidad de Medida:
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-300">{selectedProduct.unit || "Pza"}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-slate-800">
                <span className="text-gray-500 flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5" /> Departamento:
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-300">{selectedProduct.departamento || "General"}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-slate-800">
                <span className="text-gray-500 flex items-center gap-1">
                  <Barcode className="h-3.5 w-3.5" /> Código de Barras / SKU:
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-300">{selectedProduct.barcode || selectedProduct.sku || "S/C"}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Existencias estimadas:
                </span>
                <span className={`font-bold px-2 py-0.5 rounded-md ${
                  (Number(selectedProduct.stock) || 0) <= 0 
                    ? "bg-rose-50 text-rose-600" 
                    : (Number(selectedProduct.stock) || 0) <= 10 
                    ? "bg-amber-50 text-amber-600" 
                    : "bg-emerald-50 text-emerald-600"
                }`}>
                  {(Number(selectedProduct.stock) || 0) <= 0 ? "Agotado Temporal" : `${selectedProduct.stock} ${selectedProduct.unit || "unidades"}`}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 text-center italic">
              * Los precios de mayoreo aplican de forma automática en caja al totalizar el volumen correspondiente.
            </p>

            <button
              onClick={() => setSelectedProduct(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cerrar Ficha
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
