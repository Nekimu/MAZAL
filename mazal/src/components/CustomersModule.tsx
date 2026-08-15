import React, { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Plus, 
  CreditCard, 
  DollarSign, 
  AlertCircle, 
  TrendingUp, 
  CheckCircle2, 
  Phone, 
  MapPin, 
  Mail,
  X,
  FileText,
  ArrowRightLeft,
  Trash2,
  Edit3,
  Lock,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { Customer, CustomerRole, formatPrice } from "../types";
import { getDatabase, saveDatabase, logAction, subscribeToDb } from "../data";

interface CustomersModuleProps {
  currentUser: { name: string; role: string };
}

export default function CustomersModule({ currentUser }: CustomersModuleProps) {
  const [db, setDb] = useState(getDatabase());
  const roleUpper = String(currentUser?.role || "").toUpperCase();
  const isAdmin = roleUpper === "ADMIN" || roleUpper === "ADMINISTRADOR" || roleUpper.includes("ADMIN") || currentUser?.role === UserRole.ADMIN;
  
  useEffect(() => {
    return subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  // Credit Action States inside the management modal
  const [creditActionType, setCreditActionType] = useState<"abono" | "liquida" | "cargo" | "quita" | "none">("none");
  const [creditActionAmount, setCreditActionAmount] = useState<number>(0);
  const [creditActionNotes, setCreditActionNotes] = useState<string>("");

  // New customer form
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    rfc: "",
    role: CustomerRole.NORMAL,
    creditLimit: 1000,
    creditDays: 15,
    notes: "",
    status: "Activo" as "Activo" | "Inactivo"
  });

  // Credit deposit payment form
  const [creditPayment, setCreditPayment] = useState({
    amount: 0,
    notes: ""
  });

  const customersList: Customer[] = Array.isArray(db?.customers) ? db.customers : [];

  const filteredCustomers = customersList.filter((c: Customer) => {
    if (!c) return false;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;

    const name = (c.name || "").toLowerCase();
    const id = (c.id || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    const address = (c.address || "").toLowerCase();
    const rfc = (c.rfc || "").toLowerCase();
    const email = (c.email || "").toLowerCase();

    return (
      name.includes(term) ||
      id.includes(term) ||
      phone.includes(term) ||
      address.includes(term) ||
      rfc.includes(term) ||
      email.includes(term)
    );
  });

  // KPI calculations with complete defensive checks
  const totalRegistered = customersList.length;
  const totalCreditLimit = customersList.reduce((sum: number, c: any) => sum + (Number(c?.creditLimit) || 0), 0);
  const totalCreditUsed = customersList.reduce((sum: number, c: any) => sum + (Number(c?.creditUsed) || 0), 0);
  const totalCreditAvailable = customersList.reduce((sum: number, c: any) => sum + Math.max(0, (Number(c?.creditLimit) || 0) - (Number(c?.creditUsed) || 0)), 0);

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const database = getDatabase();
    if (!Array.isArray(database.customers)) {
      database.customers = [];
    }

    const created: Customer = {
      ...newCustomer,
      id: "CLI_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      creditUsed: 0,
      creditLimit: Number(newCustomer.creditLimit) || 0,
      creditDays: Number(newCustomer.creditDays) || 15
    };

    database.customers.push(created);
    saveDatabase(database);
    setDb(database);
    setShowAddModal(false);

    // Reset Form
    setNewCustomer({
      name: "",
      phone: "",
      email: "",
      address: "",
      rfc: "",
      role: CustomerRole.NORMAL,
      creditLimit: 1000,
      creditDays: 15,
      notes: "",
      status: "Activo"
    });

    logAction(
      currentUser.name,
      currentUser.role,
      "Cliente Creado",
      `Registró el cliente: ${created.name} con tarifa ${created.role}`
    );
  };

  const handleDeleteCustomer = (cust: Customer) => {
    if (!isAdmin) {
      alert("🔒 Permiso Denegado: Únicamente los usuarios con rol de Administrador pueden eliminar clientes del sistema.");
      return;
    }

    const debt = Number(cust?.creditUsed) || 0;
    if (debt > 0) {
      alert(`⚠️ No es posible eliminar al cliente "${cust.name}" porque tiene un saldo pendiente de pago de $${formatPrice(debt)} MXN.\n\nPor favor registre la liquidación o ajuste de la deuda antes de eliminarlo.`);
      return;
    }

    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar permanentemente al cliente "${cust.name}" (RFC: ${cust.rfc || "Sin RFC"})?\n\nEsta acción no se puede deshacer.`);
    if (!confirmed) return;

    const database = getDatabase();
    database.customers = (database.customers || []).filter((c: Customer) => c.id !== cust.id);
    saveDatabase(database);
    setDb(database);

    if (selectedCustomer?.id === cust.id) {
      setSelectedCustomer(null);
      setShowEditModal(false);
      setEditingCustomer(null);
    }

    logAction(
      currentUser.name,
      currentUser.role,
      "Cliente Eliminado",
      `Eliminó permanentemente al cliente: ${cust.name} (ID: ${cust.id})`
    );
  };

  const handleSaveCustomerDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    if (!isAdmin) {
      alert("🔒 Permiso Denegado: Únicamente los usuarios con rol de Administrador pueden modificar los datos del cliente.");
      return;
    }

    const database = getDatabase();
    if (!Array.isArray(database.customers)) {
      database.customers = [];
    }

    const custIndex = database.customers.findIndex((c: Customer) => c.id === editingCustomer.id);
    if (custIndex === -1) return;

    const previousCust = database.customers[custIndex];
    const previousCreditUsed = Number(previousCust?.creditUsed) || 0;
    const newCreditUsed = Number(editingCustomer.creditUsed) || 0;
    const balanceDiff = newCreditUsed - previousCreditUsed;

    if (balanceDiff !== 0) {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().split(" ")[0];
      
      const adjustmentEntry = {
        id: "CREDM_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        customerId: previousCust.id,
        customerName: previousCust.name,
        date: dateStr,
        time: timeStr,
        user: currentUser.name,
        amount: Math.abs(balanceDiff),
        type: balanceDiff > 0 ? "Aumento de Crédito (Ajuste Manual)" : "Reducción de Crédito (Ajuste Manual)",
        notes: "Ajuste manual de saldo desde edición de cliente.",
        previousBalance: previousCreditUsed,
        newBalance: newCreditUsed
      };
      
      database.creditHistory = database.creditHistory || [];
      database.creditHistory.unshift(adjustmentEntry);
    }

    database.customers[custIndex] = {
      ...previousCust,
      name: editingCustomer.name || "Cliente",
      phone: editingCustomer.phone || "",
      email: editingCustomer.email || "",
      address: editingCustomer.address || "",
      rfc: editingCustomer.rfc || "",
      notes: editingCustomer.notes || "",
      creditLimit: Number(editingCustomer.creditLimit) || 0,
      creditUsed: newCreditUsed,
      role: editingCustomer.role || CustomerRole.NORMAL,
      status: editingCustomer.status || "Activo"
    };

    saveDatabase(database);
    setDb(database);
    setShowEditModal(false);
    setSelectedCustomer(null);
    setEditingCustomer(null);

    logAction(
      currentUser.name,
      currentUser.role,
      "Cliente Modificado",
      `Actualizó detalles del cliente: ${editingCustomer.name} (Tarifa: ${editingCustomer.role}, Límite: $${editingCustomer.creditLimit})`
    );
  };

  const handleApplyCreditAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || creditActionType === "none") return;

    const database = getDatabase();
    if (!Array.isArray(database.customers)) {
      database.customers = [];
    }

    const custIndex = database.customers.findIndex((c: Customer) => c.id === selectedCustomer.id);
    if (custIndex === -1) return;

    const previousCust = database.customers[custIndex];
    const prevUsed = Number(previousCust.creditUsed) || 0;
    let amount = Number(creditActionAmount) || 0;
    let typeName = "";
    let newUsed = prevUsed;

    if (creditActionType === "abono") {
      if (amount <= 0 || amount > prevUsed) {
        alert("El monto de abono debe ser mayor a 0 y menor o igual al saldo pendiente.");
        return;
      }
      newUsed = Math.max(0, prevUsed - amount);
      typeName = "Abono Parcial";
    } else if (creditActionType === "liquida") {
      amount = prevUsed;
      if (amount <= 0) {
        alert("El cliente no tiene saldo pendiente por liquidar.");
        return;
      }
      newUsed = 0;
      typeName = "Liquidación de Crédito";
    } else if (creditActionType === "cargo") {
      if (amount <= 0) {
        alert("El monto de cargo debe ser mayor a 0.");
        return;
      }
      newUsed = prevUsed + amount;
      typeName = "Aumento de Crédito (Cargo)";
    } else if (creditActionType === "quita") {
      if (amount <= 0) {
        alert("El monto de quita debe ser mayor a 0.");
        return;
      }
      newUsed = Math.max(0, prevUsed - amount);
      typeName = "Reducción de Crédito (Quita)";
    }

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().split(" ")[0];

    const movementEntry = {
      id: "CREDM_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
      customerId: previousCust.id,
      customerName: previousCust.name,
      date: dateStr,
      time: timeStr,
      user: currentUser.name,
      amount,
      type: typeName,
      notes: creditActionNotes || `Movimiento registrado por ${currentUser.name}`,
      previousBalance: prevUsed,
      newBalance: newUsed
    };

    database.customers[custIndex].creditUsed = newUsed;
    database.creditHistory = database.creditHistory || [];
    database.creditHistory.unshift(movementEntry);

    // If it's a payment/abono/liquida, optionally add to open cash session
    if ((creditActionType === "abono" || creditActionType === "liquida") && Array.isArray(database.cashSessions) && database.cashSessions.length > 0) {
      const activeSess = database.cashSessions.find((s: any) => s.status === "Abierta");
      if (activeSess) {
        activeSess.salesTotal = (activeSess.salesTotal || 0) + amount;
      }
    }

    saveDatabase(database);
    setDb(database);
    
    // Refresh modal states
    setSelectedCustomer(database.customers[custIndex]);
    setEditingCustomer({ ...database.customers[custIndex] });
    setCreditActionAmount(0);
    setCreditActionNotes("");
    setCreditActionType("none");

    logAction(
      currentUser.name,
      currentUser.role,
      "Transacción de Crédito Registrada",
      `${typeName} de $${formatPrice(amount)} MXN para el cliente ${previousCust.name}`
    );
  };

  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || creditPayment.amount <= 0) return;

    const database = getDatabase();
    if (!Array.isArray(database.customers)) {
      database.customers = [];
    }

    const custIndex = database.customers.findIndex((c: Customer) => c.id === selectedCustomer.id);
    if (custIndex === -1) return;

    const currentUsed = Number(database.customers[custIndex].creditUsed) || 0;
    const finalUsed = Math.max(0, currentUsed - creditPayment.amount);

    database.customers[custIndex].creditUsed = finalUsed;

    if (Array.isArray(database.cashSessions) && database.cashSessions.length > 0) {
      const activeSess = database.cashSessions.find((s: any) => s.status === "Abierta");
      if (activeSess) {
        activeSess.salesTotal = (activeSess.salesTotal || 0) + creditPayment.amount;
      }
    }

    saveDatabase(database);
    setDb(database);
    setShowPayModal(false);
    setSelectedCustomer(null);
    setCreditPayment({ amount: 0, notes: "" });

    logAction(
      currentUser.name,
      currentUser.role,
      "Abono a Crédito",
      `Abonó $${formatPrice(creditPayment.amount)} MXN a la cuenta de ${selectedCustomer.name}`
    );
  };

  return (
    <div className="space-y-6" id="customers-module-container">
      
      {/* Overview stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Clientes Registrados</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1">{totalRegistered}</h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-slate-850 text-amber-600 dark:text-amber-400">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Crédito Total Otorgado</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1 font-mono">
              ${formatPrice(totalCreditLimit)} MXN
            </h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Cuentas por Cobrar Activas</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1 font-mono">
              ${formatPrice(totalCreditUsed)} MXN
            </h4>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-lg bg-teal-50 dark:bg-slate-850 text-teal-600 dark:text-teal-400">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-mono">Crédito Disponible Tienda</p>
            <h4 className="text-xl font-extrabold text-gray-800 dark:text-slate-100 mt-1 font-mono">
              ${formatPrice(totalCreditAvailable)} MXN
            </h4>
          </div>
        </div>

      </div>

      {/* Filter and action bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, RFC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            id="customer-search-input"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          id="add-customer-btn"
        >
          <Plus className="h-4 w-4" /> Nuevo Cliente
        </button>

      </div>

      {/* Customers List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCustomers.map((cust) => {
          const creditLimit = Number(cust?.creditLimit) || 0;
          const creditUsed = Number(cust?.creditUsed) || 0;
          const availableCredit = Math.max(0, creditLimit - creditUsed);
          const usagePercent = creditLimit > 0 ? Math.min(100, (creditUsed / creditLimit) * 100) : 0;
          const hasDebt = creditUsed > 0;

          return (
            <div 
              key={cust.id}
              className="p-4 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl hover:shadow-xs transition-all flex flex-col justify-between"
              id={`customer-card-${cust.id}`}
            >
              
              {/* Card top */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-mono">
                      {cust.role || "Normal"}
                    </span>
                    <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm mt-1.5">{cust.name}</h3>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">RFC: {cust.rfc || "XAXX010101000"}</p>
                  </div>

                  {/* Quick Outstanding Alert badge */}
                  {hasDebt && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-950/20 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" /> Saldo Pendiente
                    </span>
                  )}
                </div>

                {/* Contact data */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{cust.phone || "Sin Teléfono"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{cust.email || "Sin Correo"}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{cust.address || "Dirección no provista"}</span>
                  </div>
                </div>
              </div>

              {/* Credit Status Ledger area */}
              <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-slate-850 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Estado de Crédito</span>
                  <span className="font-mono text-[11px]">
                    <strong className={hasDebt ? "text-red-600" : "text-emerald-600"}>${formatPrice(creditUsed)}</strong> / ${formatPrice(creditLimit)} MXN
                  </span>
                </div>

                {/* Micro visual progress bar */}
                <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${usagePercent >= 80 ? "bg-red-500" : "bg-emerald-600"}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Disponible:</span>
                  <span className={`font-mono font-bold ${availableCredit <= 100 ? "text-amber-600" : "text-emerald-700 dark:text-emerald-400"}`}>
                    ${formatPrice(availableCredit)} MXN
                  </span>
                </div>

                {/* Action buttons with Admin Protection */}
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setEditingCustomer({
                        ...cust,
                        notes: cust.notes || "",
                        status: cust.status || "Activo"
                      });
                      setShowEditModal(true);
                    }}
                    className="py-2 px-2 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs border border-gray-200 dark:border-slate-750 cursor-pointer"
                    id={`credit-btn-${cust.id}`}
                    title="Registrar abonos, liquidaciones y ver historial de crédito"
                  >
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:text-white" /> Crédito
                  </button>

                  <button
                    onClick={() => {
                      if (!isAdmin) {
                        alert("🔒 Solo los usuarios con rol de Administrador pueden modificar los datos del cliente.");
                        return;
                      }
                      setSelectedCustomer(cust);
                      setEditingCustomer({
                        ...cust,
                        notes: cust.notes || "",
                        status: cust.status || "Activo"
                      });
                      setShowEditModal(true);
                    }}
                    className={`py-2 px-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs border cursor-pointer ${
                      isAdmin
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-600 hover:text-white"
                        : "bg-gray-100 dark:bg-slate-800 text-gray-400 border-gray-200 dark:border-slate-700 hover:bg-gray-200 opacity-80"
                    }`}
                    id={`edit-cust-btn-${cust.id}`}
                    title={isAdmin ? "Modificar datos del cliente" : "Solo Administrador puede modificar"}
                  >
                    {isAdmin ? <Edit3 className="h-3.5 w-3.5 text-blue-600" /> : <Lock className="h-3.5 w-3.5 text-gray-400" />} Modificar
                  </button>

                  <button
                    onClick={() => handleDeleteCustomer(cust)}
                    className={`py-2 px-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs border cursor-pointer ${
                      isAdmin
                        ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-600 hover:text-white"
                        : "bg-gray-100 dark:bg-slate-800 text-gray-400 border-gray-200 dark:border-slate-700 hover:bg-gray-200 opacity-80"
                    }`}
                    id={`del-cust-btn-${cust.id}`}
                    title={isAdmin ? "Eliminar cliente del sistema" : "Solo Administrador puede eliminar"}
                  >
                    {isAdmin ? <Trash2 className="h-3.5 w-3.5 text-rose-600" /> : <Lock className="h-3.5 w-3.5 text-gray-400" />} Eliminar
                  </button>
                </div>
              </div>

            </div>
          );
        })}

        {filteredCustomers.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            Ningún cliente coincide con la búsqueda.
          </div>
        )}
      </div>

      {/* --- ADD CUSTOMER MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" /> Registrar Nuevo Cliente
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="py-4 space-y-4">
              
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. María de los Ángeles López"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    placeholder="Ej. 555-1234"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">RFC</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={newCustomer.rfc}
                    onChange={(e) => setNewCustomer({ ...newCustomer, rfc: e.target.value })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Dirección</label>
                <input
                  type="text"
                  placeholder="Calle, número, Col., alcaldía"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Rol de Cliente</label>
                  <select
                    value={newCustomer.role}
                    onChange={(e) => setNewCustomer({ ...newCustomer, role: e.target.value as any })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {Object.values(CustomerRole).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Límite de Crédito ($)</label>
                  <input
                    type="number"
                    value={newCustomer.creditLimit === 0 ? "" : newCustomer.creditLimit}
                    onChange={(e) => setNewCustomer({ ...newCustomer, creditLimit: parseInt(e.target.value) || 0 })}
                    className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PAY/DEPOSIT CREDIT MODAL --- */}
      {showPayModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">Registrar Abono a Cuenta</h3>
              <button onClick={() => { setShowPayModal(false); setSelectedCustomer(null); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterPayment} className="py-4 space-y-4">
              
              <div className="p-3 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-850 text-xs text-gray-600">
                <p>Cliente: <strong>{selectedCustomer.name}</strong></p>
                <p className="mt-1">Deuda Vigente: <strong className="text-red-600">${formatPrice(selectedCustomer.creditUsed)} MXN</strong></p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Monto del Abono ($ MXN)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  max={selectedCustomer.creditUsed || 0}
                  placeholder={`Ej. ${formatPrice(selectedCustomer.creditUsed)}`}
                  value={creditPayment.amount || ""}
                  onChange={(e) => setCreditPayment({ ...creditPayment, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1">Concepto / Comentario</label>
                <input
                  type="text"
                  placeholder="Ej. Pago parcial quincenal..."
                  value={creditPayment.notes}
                  onChange={(e) => setCreditPayment({ ...creditPayment, notes: e.target.value })}
                  className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPayModal(false); setSelectedCustomer(null); }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Aplicar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADVANCED EDIT & CREDIT HISTORY MANAGEMENT MODAL --- */}
      {showEditModal && selectedCustomer && editingCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-850 flex flex-col my-8 max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-150 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-gray-800 dark:text-slate-100">
                      Administrar Cuenta y Crédito: {selectedCustomer.name}
                    </h3>
                    {isAdmin ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Administrador
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Modo Consulta
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID del Cliente: {selectedCustomer.id}</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowEditModal(false); setSelectedCustomer(null); setEditingCustomer(null); }} 
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scrollable Body Content */}
            <div className="flex-1 overflow-y-auto py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 pr-1">
              
              {/* Left Column - Profile Details Form */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-gray-50/50 dark:bg-slate-950/40 rounded-xl border border-gray-100 dark:border-slate-850">
                  <div className="flex items-center justify-between mb-3.5">
                    <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-emerald-600" /> Datos Generales y Tarifas
                    </h4>
                    {!isAdmin && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Solo Admin
                      </span>
                    )}
                  </div>
                  
                  <form onSubmit={handleSaveCustomerDetails} className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Nombre Completo</label>
                      <input
                        type="text"
                        required
                        disabled={!isAdmin}
                        value={editingCustomer.name || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                        className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-medium ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Teléfono</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={editingCustomer.phone || ""}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">RFC</label>
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={editingCustomer.rfc || ""}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, rfc: e.target.value })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Correo Electrónico</label>
                      <input
                        type="email"
                        disabled={!isAdmin}
                        value={editingCustomer.email || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                        className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Dirección Física</label>
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={editingCustomer.address || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                        className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Notas Internas</label>
                      <textarea
                        disabled={!isAdmin}
                        value={editingCustomer.notes || ""}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                        rows={2}
                        placeholder="Observaciones de cobranza, referencias..."
                        className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white resize-none ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Rol de Cliente</label>
                        <select
                          disabled={!isAdmin}
                          value={editingCustomer.role || CustomerRole.NORMAL}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, role: e.target.value as any })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        >
                          {Object.values(CustomerRole).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Estatus</label>
                        <select
                          disabled={!isAdmin}
                          value={editingCustomer.status || "Activo"}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, status: e.target.value as any })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-800 dark:text-white ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        >
                          <option value="Activo">Activo</option>
                          <option value="Inactivo">Inactivo</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Límite Crédito ($)</label>
                        <input
                          type="number"
                          disabled={!isAdmin}
                          value={editingCustomer.creditLimit || 0}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, creditLimit: parseFloat(e.target.value) || 0 })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-850 dark:text-white font-mono font-bold text-slate-800 ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 block mb-1">Saldo Deuda ($)</label>
                        <input
                          type="number"
                          disabled={!isAdmin}
                          value={editingCustomer.creditUsed || 0}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, creditUsed: parseFloat(e.target.value) || 0 })}
                          className={`w-full text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2.5 bg-white dark:bg-slate-850 dark:text-white font-mono font-bold text-red-600 ${!isAdmin ? "opacity-70 bg-gray-100 cursor-not-allowed" : ""}`}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-150 dark:border-slate-850 flex justify-end">
                      {isAdmin ? (
                        <button
                          type="submit"
                          className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Guardar Cambios
                        </button>
                      ) : (
                        <div className="text-[11px] text-gray-400 italic flex items-center gap-1">
                          <Lock className="h-3.5 w-3.5" /> Solo Administrador puede guardar cambios
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Right Column - Credit Operations & History Ledger */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* Panel: Live Balance Overview */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/20 border border-gray-150 dark:border-slate-850 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Límite</p>
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mt-1 font-mono">${formatPrice(selectedCustomer.creditLimit)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/20 text-center">
                    <p className="text-[10px] text-rose-500 uppercase tracking-wider font-semibold">Deuda</p>
                    <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-1 font-mono">${formatPrice(selectedCustomer.creditUsed)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/20 text-center">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold">Disponible</p>
                    <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">${formatPrice(Math.max(0, (Number(selectedCustomer.creditLimit) || 0) - (Number(selectedCustomer.creditUsed) || 0)))}</p>
                  </div>
                </div>

                {/* Pane: Credit Quick Operations */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-gray-150 dark:border-slate-850 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowRightLeft className="h-4 w-4 text-amber-500" /> Operación de Crédito Rápida
                  </h4>
                  
                  <form onSubmit={handleApplyCreditAction} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Elegir Operación</label>
                        <select
                          value={creditActionType}
                          onChange={(e) => {
                            const act = e.target.value as any;
                            setCreditActionType(act);
                            if (act === "liquida") {
                              setCreditActionAmount(Number(selectedCustomer.creditUsed) || 0);
                            } else {
                              setCreditActionAmount(0);
                            }
                          }}
                          className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                        >
                          <option value="none">-- Selecciona acción --</option>
                          <option value="abono">Registrar Abono Parcial</option>
                          <option value="liquida">Liquidar Deuda Total (${formatPrice(selectedCustomer.creditUsed)})</option>
                          <option value="cargo">Aumentar Crédito (Cargo/Préstamo)</option>
                          <option value="quita">Reducir Crédito (Ajuste/Quita)</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Monto ($ MXN)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={creditActionType === "none" || creditActionType === "liquida"}
                          value={creditActionAmount || ""}
                          placeholder={creditActionType === "liquida" ? `${formatPrice(selectedCustomer.creditUsed)}` : "Ej. 150"}
                          onChange={(e) => setCreditActionAmount(parseFloat(e.target.value) || 0)}
                          className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-800 dark:text-white font-mono"
                        />
                      </div>
                    </div>

                    {creditActionType !== "none" && (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-8">
                          <label className="text-[10px] font-semibold text-gray-500 block mb-1">Observaciones / Comentario</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Pago efectuado en efectivo sucursal..."
                            value={creditActionNotes}
                            onChange={(e) => setCreditActionNotes(e.target.value)}
                            className="w-full text-xs rounded-lg border border-gray-200 dark:border-slate-800 p-2.5 bg-white dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <button
                            type="submit"
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs shrink-0"
                          >
                            Aplicar Movimiento
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </div>

                {/* Pane: Audit Ledger (Movimientos) */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-emerald-600" /> Historial de Movimientos de Crédito
                  </h4>
                  
                  <div className="overflow-x-auto border border-gray-150 dark:border-slate-850 rounded-xl max-h-[220px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-slate-850 text-[10px] text-gray-400 font-mono uppercase tracking-wider border-b border-gray-150 dark:border-slate-800">
                          <th className="p-2">Fecha/Hora</th>
                          <th className="p-2">Tipo</th>
                          <th className="p-2 text-right">Monto</th>
                          <th className="p-2">Usuario</th>
                          <th className="p-2">Saldos</th>
                          <th className="p-2">Comentarios</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-850 text-[11px]">
                        {(db.creditHistory || [])
                          .filter((h: any) => h && h.customerId === selectedCustomer.id)
                          .map((entry: any) => {
                            const isNegative = String(entry.type || "").includes("Abono") || String(entry.type || "").includes("Liquidación") || String(entry.type || "").includes("Reducción");
                            return (
                              <tr key={entry.id} className="hover:bg-slate-50/50">
                                <td className="p-2 whitespace-nowrap text-gray-400 font-mono text-[10px]">
                                  {entry.date} <br/> {entry.time}
                                </td>
                                <td className="p-2 whitespace-nowrap font-semibold">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    isNegative 
                                      ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" 
                                      : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                                  }`}>
                                    {entry.type}
                                  </span>
                                </td>
                                <td className={`p-2 text-right font-mono font-extrabold whitespace-nowrap ${isNegative ? "text-emerald-600" : "text-red-600"}`}>
                                  {isNegative ? "-" : "+"}${formatPrice(entry.amount)}
                                </td>
                                <td className="p-2 whitespace-nowrap text-gray-500 font-medium">{entry.user || "Sistema"}</td>
                                <td className="p-2 whitespace-nowrap font-mono text-[10px] text-gray-400">
                                  ${formatPrice(entry.previousBalance)} &rarr; ${formatPrice(entry.newBalance)}
                                </td>
                                <td className="p-2 max-w-[150px] truncate text-gray-500 italic" title={entry.notes}>
                                  {entry.notes}
                                </td>
                              </tr>
                            );
                          })}
                        
                        {(db.creditHistory || []).filter((h: any) => h && h.customerId === selectedCustomer.id).length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-gray-400 italic">
                              No hay movimientos de crédito registrados para este cliente.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>

            {/* Footer buttons */}
            <div className="pt-4 border-t border-gray-150 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomer(selectedCustomer)}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" /> Eliminar Cliente
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowEditModal(false); setSelectedCustomer(null); setEditingCustomer(null); }}
                className="px-5 py-2 border border-gray-200 dark:border-slate-750 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cerrar Panel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
