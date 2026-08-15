/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Search, 
  UserCheck, 
  Clock, 
  MapPin, 
  Terminal, 
  Database,
  Lock,
  Unlock,
  RefreshCw,
  UserPlus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Activity,
  User as UserIcon,
  ShoppingCart,
  Package,
  ArrowRight,
  ShieldAlert,
  Coins,
  Key,
  Wifi,
  WifiOff,
  Download,
  Upload,
  FileText,
  Store
} from "lucide-react";
import { AuditLog, UserRole, User, StockMovement, Sale, MovementType, RolePermissions, fetchRolePermissionsFromDB, saveRolePermissionsToDB } from "../types";
import { getDatabase, logAction, saveDatabase, subscribeToDb, resetDatabaseToFactory, saveUserToMySQL, deleteUserFromMySQL } from "../data";
import { migrateProducts, normalizePrice } from "../utils/migration";
import { getBranchPasswords, saveBranchPasswords } from "../utils/BranchPasswordService";
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, addDoc } from "firebase/firestore";
import { firestore } from "../firebase";

interface SecurityModuleProps {
  currentUser: { name: string; role: UserRole };
  onChangeRole: (newRole: UserRole, name: string) => void;
}

export default function SecurityModule({ currentUser, onChangeRole }: SecurityModuleProps) {
  const [db, setDb] = useState(getDatabase());
  const [backups, setBackups] = useState<any[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [selectedImportCol, setSelectedImportCol] = useState("products");
  const [importStrategy, setImportStrategy] = useState("upsert");
  const [importProgress, setImportProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    successCount: 0,
    errorCount: 0,
    currentItemName: ""
  });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [deleteDocInputs, setDeleteDocInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubDb = subscribeToDb((updatedDb) => {
      setDb({ ...updatedDb });
    });

    const q = query(collection(firestore, "backups"), orderBy("timestamp", "desc"));
    const unsubBackups = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setBackups(list);
    }, (error) => {
      console.warn("Error loading backups snapshot:", error);
    });

    return () => {
      unsubDb();
      unsubBackups();
    };
  }, []);

  const [activeTab, setActiveTab] = useState<"users" | "audit" | "login" | "branches" | "database">("users");
  const [showManualExport, setShowManualExport] = useState(false);
  const [pasteInput, setPasteInput] = useState("");
  const [isPasteLoading, setIsPasteLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [purgeConfirmStep, setPurgeConfirmStep] = useState(0); // 0: inactive, 1: step 1, 2: step 2
  const [purgeInputText, setPurgeInputText] = useState("");
  const [manualExportText, setManualExportText] = useState("");

  // Branch passwords state
  const [branchPasswords, setBranchPasswords] = useState(() => getBranchPasswords());
  const [showBranchPassMap, setShowBranchPassMap] = useState<Record<string, boolean>>({});
  const [branchPassSuccess, setBranchPassSuccess] = useState("");

  const [showFormPassword, setShowFormPassword] = useState(false);

  // State for user management form
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    username: "",
    password: "",
    role: UserRole.CASHIER,
    status: "Activo" as "Activo" | "Inactivo"
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [userSearch, setUserSearch] = useState("");
  const [userSuccessMessage, setUserSuccessMessage] = useState("");
  const [userErrorMessage, setUserErrorMessage] = useState("");

  // Custom Firebase configuration states
  const [customFirebaseConfig, setCustomFirebaseConfig] = useState(() => {
    try {
      const cached = localStorage.getItem("custom_firebase_config");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error(e);
    }
    return {
      projectId: "",
      appId: "",
      apiKey: "",
      authDomain: "",
      firestoreDatabaseId: "",
      storageBucket: "",
      messagingSenderId: ""
    };
  });
  const [isFirebaseOverridden, setIsFirebaseOverridden] = useState(() => {
    return !!localStorage.getItem("custom_firebase_config");
  });
  const [firebaseSuccessMsg, setFirebaseSuccessMsg] = useState("");
  const [firebaseErrorMsg, setFirebaseErrorMsg] = useState("");

  const handleSaveCustomFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseSuccessMsg("");
    setFirebaseErrorMsg("");

    if (!customFirebaseConfig.projectId || !customFirebaseConfig.apiKey || !customFirebaseConfig.appId) {
      setFirebaseErrorMsg("Por favor, ingresa al menos el ID del Proyecto (Project ID), la Clave de API (API Key) y el ID de la Aplicación (App ID).");
      return;
    }

    try {
      const cleanedConfig = {
        projectId: customFirebaseConfig.projectId.trim(),
        appId: customFirebaseConfig.appId.trim(),
        apiKey: customFirebaseConfig.apiKey.trim(),
        authDomain: customFirebaseConfig.authDomain?.trim() || `${customFirebaseConfig.projectId.trim()}.firebaseapp.com`,
        firestoreDatabaseId: customFirebaseConfig.firestoreDatabaseId?.trim() || "(default)",
        storageBucket: customFirebaseConfig.storageBucket?.trim() || `${customFirebaseConfig.projectId.trim()}.firebasestorage.app`,
        messagingSenderId: customFirebaseConfig.messagingSenderId?.trim() || ""
      };

      localStorage.setItem("custom_firebase_config", JSON.stringify(cleanedConfig));
      setFirebaseSuccessMsg("¡Configuración de base de datos guardada exitosamente! El sistema se reiniciará en 2 segundos para aplicar los cambios.");
      setIsFirebaseOverridden(true);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setFirebaseErrorMsg("Error al guardar la configuración: " + err.message);
    }
  };

  const handleResetFirebaseToDefault = () => {
    localStorage.removeItem("custom_firebase_config");
    setFirebaseSuccessMsg("Restableciendo a la base de datos predeterminada de Google AI Studio... El sistema se reiniciará en 2 segundos.");
    setIsFirebaseOverridden(false);
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  // State for consolidated audit timeline
  const [selectedUserFilter, setSelectedUserFilter] = useState("Todos");
  const [selectedActionType, setSelectedActionType] = useState("Todos");
  const [auditSearch, setAuditSearch] = useState("");

  // State for interactive simulator login form
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  // Toggle showing password for a user row
  const toggleShowPassword = (userId: string) => {
    setShowPasswordMap(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  // User Management Handlers
  const handleUserInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMessage("");
    setUserSuccessMessage("");

    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      setUserErrorMessage("Por favor, completa todos los campos del usuario.");
      return;
    }

    const currentDb = getDatabase();
    const cleanUsername = (formData.username || "").trim().toLowerCase();

    // Check for duplicate username (excluding the user being edited)
    const isDuplicate = (currentDb.users || []).some(
      (u: User) => (u.username || "").toLowerCase() === cleanUsername && u.id !== formData.id
    );

    if (isDuplicate) {
      setUserErrorMessage(`El nombre de usuario "${formData.username}" ya está registrado.`);
      return;
    }

    let updatedUsers = [...currentDb.users];

    if (isEditing) {
      // Edit User
      updatedUsers = currentDb.users.map((u: User) => {
        if (u.id === formData.id) {
          return {
            ...u,
            name: formData.name.trim(),
            username: cleanUsername,
            password: formData.password,
            role: formData.role,
            status: formData.status
          };
        }
        return u;
      });

      logAction(
        currentUser.name,
        currentUser.role,
        "Usuario Modificado",
        `Se actualizó el perfil de: ${formData.name} (@${cleanUsername}) como ${formData.role}`
      );
      setUserSuccessMessage("Usuario actualizado correctamente.");
    } else {
      // Add User
      const newUser: User = {
        id: "USER_" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        name: formData.name.trim(),
        username: cleanUsername,
        password: formData.password,
        role: formData.role,
        status: formData.status
      };

      updatedUsers.unshift(newUser);

      logAction(
        currentUser.name,
        currentUser.role,
        "Usuario Creado",
        `Se creó la cuenta del colaborador: ${newUser.name} (@${newUser.username}) con rol ${newUser.role}`
      );
      setUserSuccessMessage("Nuevo usuario registrado correctamente.");
    }

    // Persist directly to MySQL database
    saveUserToMySQL({
      name: formData.name.trim(),
      username: cleanUsername,
      password: formData.password,
      role: formData.role
    }).catch(err => console.warn("Error saving user to MySQL:", err));

    currentDb.users = updatedUsers;
    saveDatabase(currentDb);
    setDb(currentDb);

    // Reset form
    setFormData({
      id: "",
      name: "",
      username: "",
      password: "",
      role: UserRole.CASHIER,
      status: "Activo"
    });
    setIsEditing(false);
  };

  const handleEditClick = (user: User) => {
    setFormData({
      id: user.id,
      name: user.name,
      username: user.username,
      password: user.password || "",
      role: user.role,
      status: user.status
    });
    setIsEditing(true);
    setUserSuccessMessage("");
    setUserErrorMessage("");
  };

  const handleDeleteUser = (userId: string, username: string, name: string) => {
    // Prevent deleting oneself
    const currentDb = getDatabase();
    const userToDelete = currentDb.users.find((u: User) => u.id === userId);
    
    if (userToDelete && userToDelete.name === currentUser.name) {
      alert("No puedes eliminar la cuenta con la que tienes iniciada la sesión activa.");
      return;
    }

    if (window.confirm(`¿Estás seguro de que deseas eliminar al colaborador ${name} (@${username})?`)) {
      // Delete from MySQL database
      deleteUserFromMySQL(username).catch(err => console.warn("Error deleting user from MySQL:", err));

      const updatedUsers = currentDb.users.filter((u: User) => u.id !== userId);
      currentDb.users = updatedUsers;
      saveDatabase(currentDb);
      setDb(currentDb);

      logAction(
        currentUser.name,
        currentUser.role,
        "Usuario Eliminado",
        `Se eliminó permanentemente la cuenta de: ${name} (@${username})`
      );
      setUserSuccessMessage(`Usuario @${username} eliminado correctamente.`);
    }
  };

  const handleToggleStatus = (userId: string) => {
    const currentDb = getDatabase();
    const user = currentDb.users.find((u: User) => u.id === userId);
    if (!user) return;

    if (user.name === currentUser.name) {
      alert("No puedes desactivar tu propia cuenta activa de sesión.");
      return;
    }

    const newStatus = user.status === "Activo" ? "Inactivo" : "Activo";
    
    currentDb.users = currentDb.users.map((u: User) => {
      if (u.id === userId) {
        return { ...u, status: newStatus };
      }
      return u;
    });

    saveDatabase(currentDb);
    setDb(currentDb);

    logAction(
      currentUser.name,
      currentUser.role,
      "Estado Modificado",
      `Se cambió el estado de la cuenta de ${user.name} (@${user.username}) a ${newStatus}`
    );
    setUserSuccessMessage(`Estado de @${user.username} cambiado a ${newStatus}.`);
  };

  // Interactive login handler
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginSuccess("");

    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError("Por favor ingresa usuario y contraseña.");
      return;
    }

    const currentDb = getDatabase();
    const targetUser = (currentDb.users || []).find(
      (u: User) => 
        (u.username || "").toLowerCase() === loginUsername.trim().toLowerCase() && 
        u.password === loginPassword.trim()
    );

    if (!targetUser) {
      setLoginError("Usuario o contraseña incorrectos.");
      return;
    }

    if (targetUser.status === "Inactivo") {
      setLoginError("Esta cuenta de colaborador se encuentra inactiva. Contacta al Administrador.");
      return;
    }

    // Success login simulation
    onChangeRole(targetUser.role, targetUser.name);
    
    // Register event log
    logAction(
      targetUser.name,
      targetUser.role,
      "Inicio de Sesión",
      `El colaborador @${targetUser.username} ingresó al sistema exitosamente.`
    );

    setLoginSuccess(`¡Bienvenido, ${targetUser.name}! Has iniciado sesión con el rol: ${targetUser.role}.`);
    setLoginUsername("");
    setLoginPassword("");
    
    // Trigger timeline refresh
    setTimeout(() => window.location.reload(), 150);
  };

  // CONSOLIDATED TIMELINE logic: "ver quien ingreso que movio y todo eso"
  // Let's build a timeline of:
  // 1. Audit logs (including logins, settings changes)
  // 2. Stock movements (what they moved in inventory)
  // 3. Sales (what they registered in POS)
  interface TimelineEvent {
    id: string;
    date: string;
    user: string;
    role: string;
    action: string;
    details: string;
    type: "audit" | "movement" | "sale";
    metadata?: any;
  }

  const consolidatedTimeline: TimelineEvent[] = [];

  // Add audit logs
  (db.auditLogs || []).forEach((log: AuditLog) => {
    consolidatedTimeline.push({
      id: log.id || Math.random().toString(),
      date: log.timestamp || new Date().toISOString(),
      user: log.user || "Sistema",
      role: log.role || "Operador",
      action: log.action || "Evento",
      details: log.details || "",
      type: "audit"
    });
  });

  // Add stock movements ("que movio")
  (db.movements || []).forEach((mov: StockMovement) => {
    consolidatedTimeline.push({
      id: mov.id || Math.random().toString(),
      date: mov.date || new Date().toISOString(),
      user: mov.user || "Operador",
      role: "Operador",
      action: mov.type || "Movimiento de Stock",
      details: `Ajustó almacén para "${mov.productName || 'Producto'}": Cantidad: ${mov.quantity || 0}. Stock anterior: ${mov.previousStock || 0} -> Nuevo stock: ${mov.newStock || 0}. Notas: ${mov.notes || "S/N"}`,
      type: "movement",
      metadata: mov
    });
  });

  // Add sales ("quien vendió")
  (db.sales || []).forEach((sale: Sale) => {
    consolidatedTimeline.push({
      id: sale.id || Math.random().toString(),
      date: sale.date || new Date().toISOString(),
      user: sale.userName || "Cajero",
      role: "Cajero",
      action: "Venta Registrada",
      details: `Procesó ticket de venta ${sale.ticketNumber || 'S/N'} por un total de $${(Number(sale.total) || 0).toFixed(2)} MXN (${sale.paymentMethod || 'Efectivo'}). Ganancia estimada: $${(Number(sale.profit) || 0).toFixed(2)} MXN.`,
      type: "sale",
      metadata: sale
    });
  });

  // Sort consolidated timeline descending by date
  consolidatedTimeline.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Filter consolidated timeline
  const filteredTimeline = consolidatedTimeline.filter(event => {
    // Filter by specific user
    const evUser = (event.user || "").toLowerCase();
    const selFilter = (selectedUserFilter || "").toLowerCase();
    const matchesUser = selectedUserFilter === "Todos" || evUser === selFilter;

    // Filter by category action
    let matchesAction = true;
    const evAction = event.action || "";
    if (selectedActionType !== "Todos") {
      if (selectedActionType === "Sesiones") {
        matchesAction = evAction.includes("Sesión") || evAction.includes("Ingreso") || evAction.includes("Login");
      } else if (selectedActionType === "Inventario") {
        matchesAction = event.type === "movement" || evAction.includes("Stock") || evAction.includes("Inventario") || evAction.includes("Ajuste");
      } else if (selectedActionType === "Ventas") {
        matchesAction = event.type === "sale" || evAction.includes("Venta") || evAction.includes("Cobro");
      } else if (selectedActionType === "Caja") {
        matchesAction = evAction.includes("Caja") || evAction.includes("Gasto");
      } else if (selectedActionType === "Seguridad") {
        matchesAction = evAction.includes("Usuario") || evAction.includes("Contraseña") || evAction.includes("Permisos") || evAction.includes("Rol");
      }
    }

    // Filter by text search
    const cleanSearch = (auditSearch || "").toLowerCase();
    const matchesSearch = !cleanSearch ||
      (event.user || "").toLowerCase().includes(cleanSearch) ||
      (event.action || "").toLowerCase().includes(cleanSearch) ||
      (event.details || "").toLowerCase().includes(cleanSearch);

    return matchesUser && matchesAction && matchesSearch;
  });

  // Role permissions state with localStorage persistence
  const DEFAULT_PERMISSIONS: Record<UserRole, { pos: boolean; inventory: boolean; customers: boolean; purchases: boolean; reports: boolean; security: boolean }> = {
    [UserRole.CASHIER]: { pos: true, inventory: false, customers: true, purchases: false, reports: false, security: false },
    [UserRole.WAREHOUSE]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
    [UserRole.PURCHASING]: { pos: false, inventory: true, customers: false, purchases: true, reports: false, security: false },
    [UserRole.ACCOUNTANT]: { pos: false, inventory: false, customers: true, purchases: true, reports: true, security: false },
    [UserRole.MANAGER]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: false },
    [UserRole.ADMIN]: { pos: true, inventory: true, customers: true, purchases: true, reports: true, security: true }
  };

  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermissions>>(() => {
    try {
      const saved = localStorage.getItem("mazal_role_permissions");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error al cargar la matriz de permisos guardada:", e);
    }
    return DEFAULT_PERMISSIONS;
  });

  const [hasUnsavedPerms, setHasUnsavedPerms] = useState(false);
  const [permsSaveSuccess, setPermsSaveSuccess] = useState("");
  const [isSavingDb, setIsSavingDb] = useState(false);

  // Sincronización automática con la base de datos MySQL (mazal_bd) al cargar
  useEffect(() => {
    let isMounted = true;
    fetchRolePermissionsFromDB().then((dbPerms) => {
      if (isMounted && dbPerms) {
        setRolePermissions(dbPerms);
      }
    }).catch((e) => {
      console.warn("Aviso al consultar mazal_bd.roles_permisos:", e);
    });
    return () => { isMounted = false; };
  }, []);

  const isAdmin = currentUser.role === UserRole.ADMIN;

  const handleTogglePermission = (roleKey: UserRole, moduleKey: "pos" | "inventory" | "customers" | "purchases" | "reports" | "security") => {
    if (!isAdmin) {
      alert("🔒 Únicamente el usuario con rol de Administrador puede modificar los roles de la Matriz de Permisos.");
      return;
    }

    if (roleKey === UserRole.ADMIN) {
      alert("🛡️ El rol de Administrador mantiene todos los permisos activos y protegidos para evitar la pérdida del acceso al panel de control.");
      return;
    }

    setRolePermissions(prev => {
      const rolePerms = prev[roleKey] || { pos: false, inventory: false, customers: false, purchases: false, reports: false, security: false };
      return {
        ...prev,
        [roleKey]: {
          ...rolePerms,
          [moduleKey]: !rolePerms[moduleKey]
        }
      };
    });
    setHasUnsavedPerms(true);
    setPermsSaveSuccess("");
  };

  const handleSavePermissions = async () => {
    if (!isAdmin) return;
    if (window.confirm("¿Estás seguro de guardar los cambios realizados en la Matriz de Permisos por Rol?")) {
      setIsSavingDb(true);
      try {
        const res = await saveRolePermissionsToDB(rolePermissions);
        logAction(
          currentUser.name,
          currentUser.role as UserRole,
          "MATRIZ_PERMISOS_GUARDADA",
          "Se actualizaron y guardaron los permisos por rol en el sistema."
        );
        setHasUnsavedPerms(false);
        setPermsSaveSuccess(res.message || "¡Matriz de Permisos guardada con éxito!");
        setTimeout(() => setPermsSaveSuccess(""), 5000);
      } catch (err) {
        alert("Error al guardar la matriz de permisos: " + String(err));
      } finally {
        setIsSavingDb(false);
      }
    }
  };

  // Database Management Helpers
  const COLLECTIONS = [
    "products",
    "customers",
    "suppliers",
    "movements",
    "sales",
    "expenses",
    "cashSessions",
    "auditLogs",
    "purchaseOrders",
    "users"
  ];

  const handleExportDatabase = (exportType: string) => {
    try {
      const database = getDatabase();
      let exportData: any;
      let fileName: string;

      if (exportType === "all") {
        exportData = { ...database };
        delete exportData.offlineQueue;
        fileName = `mazal_erp_completo_${new Date().toISOString().substring(0, 10)}.json`;
      } else {
        exportData = database[exportType] || [];
        fileName = `mazal_erp_coleccion_${exportType}_${new Date().toISOString().substring(0, 10)}.json`;
      }

      const jsonStr = JSON.stringify(exportData, null, 2);
      setManualExportText(jsonStr);
      setShowManualExport(true);

      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", fileName);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      logAction(
        currentUser.name,
        currentUser.role,
        "Respaldo Exportado",
        `Exportó la información (${exportType === "all" ? "Toda la base de datos" : "Colección " + exportType}) en formato JSON.`
      );

      alert(`🎉 ¡Copia de seguridad exportada con éxito (${fileName})! Si tu navegador bloqueó la descarga, puedes copiar el texto del visor que se habilitó abajo.`);
    } catch (error) {
      alert("❌ Error al exportar: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleDeleteDocument = async (colKey: string, docId: string) => {
    if (!docId.trim()) {
      alert("⚠️ Por favor ingresa el ID, Código de Barras o ID de documento.");
      return;
    }
    
    if (window.confirm(`¿Estás seguro de eliminar el registro "${docId}" de la colección "${colKey}" de forma irreversible en la nube de Firebase?`)) {
      try {
        let finalId = docId.trim();
        
        if (colKey === "products") {
          const found = db.products?.find((p: any) => p.id === finalId || p.barcode === finalId || p.code === finalId);
          if (found) {
            finalId = found.id;
          }
        } else if (colKey === "customers") {
          const found = db.customers?.find((c: any) => c.id === finalId || c.phone === finalId);
          if (found) {
            finalId = found.id;
          }
        } else if (colKey === "users") {
          const found = db.users?.find((u: any) => u.id === finalId || u.username === finalId);
          if (found) {
            finalId = found.id;
          }
        }

        const docRef = doc(firestore, colKey, finalId);
        await deleteDoc(docRef);

        setDeleteDocInputs(prev => ({ ...prev, [colKey]: "" }));

        await logAction(
          currentUser.name,
          currentUser.role,
          "Documento Eliminado",
          `Eliminó individualmente el documento '${finalId}' de la colección '${colKey}' en la nube.`
        );

        alert(`🎉 Registro "${finalId}" eliminado correctamente de la colección "${colKey}" en Firestore.`);
      } catch (error) {
        alert("❌ Error al eliminar: " + (error instanceof Error ? error.message : String(error)));
      }
    }
  };

  const handleEmptyCollection = async (colKey: string) => {
    const typedConfirm = window.prompt(`⚠️ ALERTA DE SEGURIDAD EXTREMA ⚠️\n\nEstás a punto de vaciar COMPLETAMENTE la colección "${colKey}" en la nube de Firestore.\nEsto eliminará permanentemente todos los registros asociados.\n\nPara confirmar esta acción, escribe el nombre de la colección: "${colKey}"`);
    
    if (typedConfirm === colKey) {
      try {
        setIsResetting(true);
        const colRef = collection(firestore, colKey);
        const snapshot = await getDocs(colRef);
        const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        await logAction(
          currentUser.name,
          currentUser.role,
          "Colección Vaciada",
          `Vació completamente la colección '${colKey}' en la nube de Firestore.`
        );

        alert(`🎉 Colección "${colKey}" vaciada correctamente. Todos sus registros fueron borrados.`);
      } catch (error) {
        alert("❌ Error al vaciar colección: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        setIsResetting(false);
      }
    } else {
      alert("❌ Confirmación incorrecta. Acción cancelada.");
    }
  };

  const handleDeleteAllData = async () => {
    try {
      setIsResetting(true);
      const collectionsToClear = COLLECTIONS.filter(key => key !== "users");
      for (const key of collectionsToClear) {
        const colRef = collection(firestore, key);
        const snapshot = await getDocs(colRef);
        const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      }

      await logAction(
        currentUser.name,
        currentUser.role,
        "Purgado de Emergencia ERP",
        "Ejecutó purgado de emergencia en la nube Firebase, eliminando catálogos de productos, ventas, inventarios, gastos, clientes y sesiones, manteniendo únicamente la colección de usuarios/administradores."
      );

      setPurgeConfirmStep(0);
      setPurgeInputText("");
      alert("🎉 El ERP en la nube ha sido restablecido y purgado por completo. Se eliminaron productos, ventas, movimientos, gastos, clientes y sesiones. Se conservaron los usuarios administradores.");
      window.location.reload();
    } catch (error) {
      alert("❌ Error al vaciar el ERP: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsResetting(false);
    }
  };

  const handleCreateCloudBackup = async () => {
    try {
      setIsCreatingBackup(true);
      const database = getDatabase();
      
      const jsonStr = JSON.stringify(database);
      const sizeKB = Math.round((jsonStr.length / 1024) * 100) / 100;
      
      const recordCounts: any = {};
      let totalRecords = 0;
      Object.keys(database).forEach(key => {
        if (Array.isArray(database[key])) {
          recordCounts[key] = database[key].length;
          totalRecords += database[key].length;
        }
      });
      
      const backupData = {
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        user: currentUser.name,
        sizeKB,
        totalRecords,
        recordCounts,
        content: jsonStr
      };
      
      await addDoc(collection(firestore, "backups"), backupData);
      
      await logAction(
        currentUser.name,
        currentUser.role,
        "Respaldo Creado",
        `Creó un respaldo completo de la base de datos en la nube (${totalRecords} registros totales, ${sizeKB} KB).`
      );
      
      alert(`🎉 ¡Respaldo de la base de datos creado exitosamente en la nube Firestore!`);
    } catch (error) {
      console.error("Backup error:", error);
      alert("❌ Error al crear el respaldo: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreCloudBackup = async (backup: any) => {
    if (window.confirm(`⚠️ ADVERTENCIA DE RESTAURACIÓN ⚠️\n\n¿Estás completamente seguro de restaurar el respaldo del "${backup.timestamp}"?\nEsto reemplazará todos los productos, clientes, proveedores y transacciones actuales de tu ERP con los datos guardados en este respaldo.\n\nEsta acción no se puede deshacer.`)) {
      try {
        setIsResetting(true);
        const data = JSON.parse(backup.content);
        
        await saveDatabase(data);
        
        await logAction(
          currentUser.name,
          currentUser.role,
          "Respaldo Restaurado",
          `Restauró el ERP a la copia del ${backup.timestamp} creada por ${backup.user}.`
        );
        
        alert("🎉 ¡Respaldo restaurado con éxito en la nube de Firebase! El sistema se actualizará ahora.");
        window.location.reload();
      } catch (error) {
        console.error(error);
        alert("❌ Error al restaurar el respaldo: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        setIsResetting(false);
      }
    }
  };

  const handleDeleteCloudBackup = async (backupId: string, timestamp: string) => {
    if (window.confirm(`¿Estás seguro de eliminar el respaldo del "${timestamp}" de forma permanente?`)) {
      try {
        await deleteDoc(doc(firestore, "backups", backupId));
        alert("🎉 Respaldo eliminado exitosamente.");
      } catch (error) {
        alert("❌ Error al eliminar el respaldo: " + (error instanceof Error ? error.message : String(error)));
      }
    }
  };

  const processImport = async (records: any[]) => {
    if (!records || !Array.isArray(records)) {
      alert("❌ Formato inválido: El JSON debe ser una lista/arreglo.");
      return;
    }

    setImportErrors([]);
    setImportProgress({
      active: true,
      current: 0,
      total: records.length,
      successCount: 0,
      errorCount: 0,
      currentItemName: "Iniciando..."
    });

    const currentDb = { ...getDatabase() };
    const targetCol = selectedImportCol;
    let existingList = currentDb[targetCol] || [];
    
    const existingMap = new Map(existingList.map((item: any) => [item.id, item]));
    const existingBarcodeMap = new Map();
    const existingCodeMap = new Map();
    if (targetCol === "products") {
      existingList.forEach((p: any) => {
        if (p.barcode) existingBarcodeMap.set(p.barcode, p);
        if (p.code) existingCodeMap.set(p.code, p);
      });
    }

    const batchSize = 100;
    let successCount = 0;
    let errorCount = 0;
    const errorsList: string[] = [];

    const updatedItemsList = importStrategy === "overwrite" ? [] : [...existingList];

    for (let i = 0; i < records.length; i++) {
      const rawRecord = records[i];
      
      if (i % batchSize === 0) {
        setImportProgress({
          active: true,
          current: i,
          total: records.length,
          successCount,
          errorCount,
          currentItemName: rawRecord.name || rawRecord.nombre || rawRecord.id || `Registro #${i}`
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      try {
        if (!rawRecord || typeof rawRecord !== "object") {
          throw new Error("El registro no es un objeto válido.");
        }

        const recordId = rawRecord.id || rawRecord.codigo || rawRecord.barcode || "ID_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        const cleanRecord: any = { ...rawRecord, id: String(recordId) };

        if (targetCol === "products") {
          if (!rawRecord.name && !rawRecord.nombre && !rawRecord.descripcion) {
            throw new Error("Falta el campo 'nombre' o 'descripcion'.");
          }
          
          cleanRecord.name = rawRecord.nombre || rawRecord.name || rawRecord.descripcion || "Producto sin nombre";
          cleanRecord.code = rawRecord.codigo || rawRecord.code || recordId;
          cleanRecord.barcode = rawRecord.barcode || rawRecord.codigo || recordId;
          cleanRecord.sku = rawRecord.sku || rawRecord.codigo || recordId;
          // Extract category directly from JSON fields without automatic classification
          const extractCategory = (raw: any): string => {
            const rawCat = raw.categoria || raw.category || raw.linea || raw.sublinea || raw.subCategoria || raw.subcategoria;
            if (rawCat !== undefined && rawCat !== null) {
              const strVal = String(rawCat).trim();
              if (strVal !== "") {
                return strVal;
              }
            }
            return "Sin clasificar";
          };
          cleanRecord.category = extractCategory(rawRecord);
          cleanRecord.categoria = cleanRecord.category;

          const extractSubCategory = (raw: any): string => {
            const rawSub = raw.subcategoria || raw.subcategory || "";
            if (rawSub !== undefined && rawSub !== null) {
              const strVal = String(rawSub).trim();
              if (strVal !== "") {
                return strVal;
              }
            }
            return "Sin clasificar";
          };
          cleanRecord.subcategory = extractSubCategory(rawRecord);
          cleanRecord.subcategoria = cleanRecord.subcategory;
          cleanRecord.brand = rawRecord.marca || rawRecord.brand || "Generico";
          const rawUnitStr = String(rawRecord.unidad || rawRecord.unit || "Pza").toLowerCase();
          const isGramInput = rawUnitStr === "g" || rawUnitStr === "gramo" || rawUnitStr === "gram" || rawUnitStr === "grams";
          const isMlInput = rawUnitStr === "ml" || rawUnitStr === "mililitro" || rawUnitStr === "mililitros";

          let unit = rawRecord.unidad || rawRecord.unit || "Pza";
          let tipoVenta = "pieza";
          let permiteVentaFraccionada = false;

          const lowerName = cleanRecord.name.toLowerCase();
          if (rawUnitStr.includes("kg") || rawUnitStr.includes("kilo") || rawUnitStr.includes("gramo") || rawUnitStr.includes("g") || lowerName.includes(" kg") || lowerName.includes(" kilo")) {
            tipoVenta = "peso";
            unit = "Kg"; // Use Kg as the correct base metric!
            permiteVentaFraccionada = true;
          } else if (rawUnitStr.includes("l") || rawUnitStr.includes("litro") || rawUnitStr.includes("ml") || rawUnitStr.includes("mililitro") || lowerName.includes(" lt") || lowerName.includes(" litro") || lowerName.includes(" ml")) {
            tipoVenta = "volumen";
            unit = "L"; // Use L as the correct base volume metric!
            permiteVentaFraccionada = true;
          } else if (rawUnitStr.includes("paq") || rawUnitStr.includes("paquete")) {
            tipoVenta = "pieza";
            unit = "Paq";
            permiteVentaFraccionada = false;
          }

          cleanRecord.unit = unit;
          cleanRecord.unidad = unit;
          cleanRecord.unidadVenta = unit;
          cleanRecord.unidadCompra = unit;
          cleanRecord.tipoVenta = tipoVenta;
          cleanRecord.permiteVentaFraccionada = permiteVentaFraccionada;

          let stock = 0;
          if (typeof rawRecord.stock === "string") {
            stock = parseFloat(rawRecord.stock.replace(/[^\d.]/g, "")) || 0;
          } else {
            stock = Number(rawRecord.stock || 0);
          }
          cleanRecord.stock = stock;

          let costo = normalizePrice(rawRecord.costo || rawRecord.cost || 0);
          let priceMin = normalizePrice(rawRecord.precioMenudeo || rawRecord.priceMin || rawRecord.precio_menudeo || 0);
          let priceMed = normalizePrice(rawRecord.precioMed || rawRecord.priceMed || rawRecord.precio_medio || priceMin);
          let priceMax = normalizePrice(rawRecord.precioMayoreo || rawRecord.priceMax || rawRecord.precio_mayoreo || priceMin);
          let priceSpecial = normalizePrice(rawRecord.priceSpecial || priceMin);

          cleanRecord.cost = costo;
          cleanRecord.costo = costo;
          cleanRecord.priceMin = priceMin;
          cleanRecord.precioMenudeo = priceMin;
          cleanRecord.priceMed = priceMed;
          cleanRecord.precioMedioMayoreo = priceMed;
          cleanRecord.priceMax = priceMax;
          cleanRecord.precioMayoreo = priceMax;
          cleanRecord.priceSpecial = priceSpecial;
          cleanRecord.precioEspecial = priceSpecial;
          
          if (importStrategy === "skip") {
            if (existingBarcodeMap.has(cleanRecord.barcode) || existingCodeMap.has(cleanRecord.code) || existingMap.has(cleanRecord.id)) {
              continue;
            }
          }
        }

        const index = updatedItemsList.findIndex((item: any) => item.id === cleanRecord.id);
        if (index >= 0) {
          if (importStrategy === "skip") {
            continue;
          }
          updatedItemsList[index] = cleanRecord;
        } else {
          updatedItemsList.push(cleanRecord);
        }

        successCount++;
      } catch (err) {
        errorCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        errorsList.push(`Fila ${i + 1} Error: ${errMsg}`);
      }
    }

    currentDb[targetCol] = updatedItemsList;
    await saveDatabase(currentDb);
    setDb(currentDb);

    setImportProgress({
      active: false,
      current: records.length,
      total: records.length,
      successCount,
      errorCount,
      currentItemName: "Completado"
    });

    setImportErrors(errorsList);

    await logAction(
      currentUser.name,
      currentUser.role,
      "Importación Masiva",
      `Importó masivamente en '${targetCol}' con estrategia '${importStrategy}': ${successCount} exitosos, ${errorCount} fallidos.`
    );

    alert(`🎉 Importación finalizada con éxito!\n\n• Procesados con éxito: ${successCount}\n• Errores/Omitidos: ${errorCount}`);
  };

  return (
    <div className="space-y-6" id="security-module-container">
      
      {/* Title Header Banner */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-sm text-slate-800 dark:text-slate-100">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight font-sans text-slate-900 dark:text-white">
                Consola de Cuentas, Auditoría y Seguridad Integral
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Administración central de colaboradores, contraseñas de accesos y auditoría de eventos en tiempo real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span>Operador Activo: <strong className="text-slate-900 dark:text-white">{currentUser.name}</strong></span>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 gap-1 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "users"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
          id="security-tab-users"
        >
          <UserIcon className="h-4 w-4" />
          Gestión de Cuentas y Accesos ({db.users?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "audit"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
          id="security-tab-audit"
        >
          <Activity className="h-4 w-4" />
          Auditoría de Actividad ("¿Quién movió qué?")
        </button>

        <button
          onClick={() => setActiveTab("login")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "login"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
          id="security-tab-login"
        >
          <Lock className="h-4 w-4" />
          Autenticación y Simulador de Login
        </button>

        <button
          onClick={() => setActiveTab("branches")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "branches"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
          id="security-tab-branches"
        >
          <Store className="h-4 w-4 text-emerald-500" />
          Contraseñas de Sucursales
        </button>

        <button
          onClick={() => setActiveTab("database")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeTab === "database"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
          id="security-tab-database"
        >
          <Database className="h-4 w-4 text-emerald-500" />
          Respaldos & Sincronización Nube
        </button>
      </div>

      {/* TAB CONTENT 1: GESTIÓN DE USUARIOS */}
      {activeTab === "users" && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* TOP ROW: Side-by-Side User Form and User List with Equal Heights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            
            {/* Card 1: Form to Add/Edit User */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs h-[520px] flex flex-col justify-between">
              <div>
                <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3 mb-3">
                  <UserPlus className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  {isEditing ? "Editar Colaborador" : "Agregar Nuevo Colaborador"}
                </h3>

                {userSuccessMessage && (
                  <div className="mb-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-medium">
                    {userSuccessMessage}
                  </div>
                )}

                {userErrorMessage && (
                  <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl text-xs font-medium">
                    {userErrorMessage}
                  </div>
                )}
              </div>

              <form onSubmit={handleUserSubmit} className="space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      name="name"
                      placeholder="Ej. Juan Pérez"
                      value={formData.name}
                      onChange={handleUserInputChange}
                      className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                        Usuario (Login)
                      </label>
                      <input
                        type="text"
                        name="username"
                        placeholder="ej. jperez"
                        value={formData.username}
                        onChange={handleUserInputChange}
                        className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-mono"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                        Contraseña
                      </label>
                      <div className="relative">
                        <input
                          type={showFormPassword ? "text" : "password"}
                          name="password"
                          placeholder="Mínimo 4 caracteres"
                          value={formData.password}
                          onChange={handleUserInputChange}
                          className="w-full text-xs p-2.5 pr-9 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-mono"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormPassword(!showFormPassword)}
                          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                          title={showFormPassword ? "Ocultar Contraseña" : "Ver Contraseña"}
                        >
                          {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                        Rol de Permisos
                      </label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleUserInputChange}
                        className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white dark:bg-slate-900"
                      >
                        {Object.values(UserRole).map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                        Estado Inicial
                      </label>
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleUserInputChange}
                        className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white dark:bg-slate-900"
                      >
                        <option value="Activo">Activo (Habilitado)</option>
                        <option value="Inactivo">Inactivo (Suspendido)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    {isEditing ? "Guardar Cambios" : "Agregar Colaborador"}
                  </button>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          id: "",
                          name: "",
                          username: "",
                          password: "",
                          role: UserRole.CASHIER,
                          status: "Activo"
                        });
                        setIsEditing(false);
                      }}
                      className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Card 2: List of Users with Internal Scroll */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs h-[520px] flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-3 mb-3 shrink-0">
                <div>
                  <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <UserIcon className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                    Cuentas de Colaboradores Registradas
                  </h3>
                  <p className="text-[10px] text-gray-400">Total de personal para control de turnos y seguridad.</p>
                </div>

                {/* Search user */}
                <div className="relative w-full sm:w-52">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar colaborador..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 border border-gray-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
                  />
                </div>
              </div>

              {/* Table layout of users with Internal Scrolling */}
              <div className="flex-1 overflow-y-auto overflow-x-auto pr-1">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <tr className="border-b border-gray-150 dark:border-slate-800 text-gray-400 uppercase text-[9px] font-mono tracking-wider">
                      <th className="py-2.5 font-bold">Colaborador</th>
                      <th className="py-2.5 font-bold">Usuario</th>
                      <th className="py-2.5 font-bold">Contraseña</th>
                      <th className="py-2.5 font-bold">Rol</th>
                      <th className="py-2.5 font-bold">Estado</th>
                      <th className="py-2.5 font-bold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-850">
                    {(db.users || []).filter((u: User) => {
                      const s = (userSearch || "").toLowerCase();
                      if (!s) return true;
                      return (
                        (u.name || "").toLowerCase().includes(s) ||
                        (u.username || "").toLowerCase().includes(s) ||
                        (u.role || "").toLowerCase().includes(s)
                      );
                    }).map((user: User) => {
                      const isSelf = user.name === currentUser.name;
                      const showPassword = !!showPasswordMap[user.id];

                      return (
                        <tr key={user.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-850/50">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-gray-600 dark:text-slate-300 shrink-0">
                                {user.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="truncate max-w-[130px]">
                                <p className="font-bold text-gray-800 dark:text-slate-200 truncate" title={user.name}>
                                  {user.name}
                                </p>
                                {isSelf && (
                                  <span className="text-[7.5px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded font-mono font-bold uppercase">Mí Cuenta</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 font-mono font-bold text-gray-700 dark:text-slate-400 text-[11px]">
                            @{user.username}
                          </td>
                          <td className="py-2.5 font-mono">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 dark:text-slate-400 text-[11px]">
                                {showPassword ? user.password : "••••••"}
                              </span>
                              <button
                                onClick={() => toggleShowPassword(user.id)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer"
                                title={showPassword ? "Ocultar Contraseña" : "Ver Contraseña"}
                              >
                                {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              user.role === UserRole.ADMIN 
                                ? "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30"
                                : user.role === UserRole.MANAGER
                                ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30"
                                : "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30"
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <button
                              onClick={() => handleToggleStatus(user.id)}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
                                user.status === "Activo"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30"
                                  : "bg-red-50 text-red-700 border-red-100 hover:bg-red-100/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30"
                              }`}
                              title="Cambiar estado"
                            >
                              <span className={`h-1 w-1 rounded-full ${user.status === "Activo" ? "bg-emerald-500" : "bg-red-500"}`} />
                              {user.status}
                            </button>
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleEditClick(user)}
                                className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded cursor-pointer"
                                title="Editar"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username, user.name)}
                                className={`p-1 rounded cursor-pointer ${isSelf ? "text-gray-300 cursor-not-allowed" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"}`}
                                disabled={isSelf}
                                title="Eliminar permanentemente"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* BOTTOM ROW: Full-Width Matriz de Permisos por Rol */}
          <div className="w-full p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h4 className="font-extrabold text-base text-gray-800 dark:text-slate-100">
                    Matriz de Permisos por Rol
                  </h4>
                  <p className="text-xs text-gray-400 font-sans">
                    Configuración de módulos accesibles para cada categoría de colaborador en el sistema.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Modo Edición (Admin)
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Solo Lectura
                  </span>
                )}
              </div>
            </div>

            {!isAdmin && (
              <p className="text-xs text-amber-700 dark:text-amber-300 italic bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/40">
                🔒 Únicamente el usuario con rol de Administrador puede modificar los roles y permisos del sistema.
              </p>
            )}

            {permsSaveSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl font-bold animate-fadeIn">
                {permsSaveSuccess}
              </div>
            )}

            {/* Grid of Roles Distributed Evenly Across Full Width */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(rolePermissions).map(([role, perms]) => {
                const roleKey = role as UserRole;
                const isRoleAdmin = roleKey === UserRole.ADMIN || role === "Administrador";
                const moduleList: Array<{ key: "pos" | "inventory" | "customers" | "purchases" | "reports" | "security"; label: string; fullLabel: string }> = [
                  { key: "pos", label: "POS", fullLabel: "Ventas / POS" },
                  { key: "inventory", label: "INV", fullLabel: "Inventario" },
                  { key: "customers", label: "CLI", fullLabel: "Clientes & Créditos" },
                  { key: "purchases", label: "COMP", fullLabel: "Compras Proveedor" },
                  { key: "reports", label: "REP", fullLabel: "Finanzas & Reportes" },
                  { key: "security", label: "SEC", fullLabel: "Seguridad & Accesos" }
                ];

                return (
                  <div key={role} className="p-4 bg-slate-50 dark:bg-slate-850/50 rounded-2xl border border-gray-150 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-center border-b border-gray-200/80 dark:border-slate-750 pb-2">
                      <span className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
                        {role}
                        {isRoleAdmin && (
                          <span className="text-[8px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                            Protegido
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {isRoleAdmin ? "Total" : `${Object.values(perms).filter(Boolean).length}/6 activos`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {moduleList.map(mod => {
                        const isActive = isRoleAdmin ? true : !!perms[mod.key];
                        const canEdit = isAdmin && !isRoleAdmin;

                        return (
                          <div 
                            key={mod.key} 
                            onClick={() => {
                              if (canEdit && !isSavingDb) {
                                handleTogglePermission(roleKey, mod.key);
                              }
                            }}
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                              isActive 
                                ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300" 
                                : "bg-white dark:bg-slate-900 border-gray-150 dark:border-slate-800 text-gray-400 dark:text-slate-500"
                            } ${canEdit ? "cursor-pointer hover:border-emerald-400 active:scale-98" : ""}`}
                          >
                            <span className="text-[9px] font-extrabold uppercase tracking-wider">{mod.label}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                              isActive 
                                ? "bg-emerald-500 text-white" 
                                : "bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400"
                            }`}>
                              {isActive ? "Activo" : "Off"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {isAdmin && (
              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={isSavingDb}
                  className={`py-2.5 px-6 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                    isSavingDb
                      ? "bg-emerald-700 text-white opacity-80 cursor-wait"
                      : hasUnsavedPerms
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                      : "bg-gray-800 hover:bg-gray-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white"
                  }`}
                >
                  <ShieldCheck className={`h-4 w-4 ${isSavingDb ? "animate-spin" : ""}`} />
                  <span>
                    {isSavingDb
                      ? "Guardando cambios..."
                      : hasUnsavedPerms
                      ? "Guardar Cambios de Permisos"
                      : "Guardar Matriz de Permisos"}
                  </span>
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB CONTENT 2: TIMELINE AUDIT & MOVEMENTS */}
      {activeTab === "audit" && (
        <div className="p-5 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4 animate-fadeIn">
          
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Terminal className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Historial Unificado de Auditoría y Movimientos
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Vigila quién ingresó, qué vendió, qué mermas/ajustes de inventario realizó y eventos de caja.</p>
            </div>

            <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
              
              {/* Filter by Operator */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono uppercase text-gray-400">Filtrar por Colaborador</span>
                <select
                  value={selectedUserFilter}
                  onChange={(e) => setSelectedUserFilter(e.target.value)}
                  className="text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2 bg-transparent dark:text-white focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Todos">Todos los Operadores</option>
                  {(db.users || []).map((u: User) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Filter by Action/Event Type */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-mono uppercase text-gray-400">Filtrar por Tipo</span>
                <select
                  value={selectedActionType}
                  onChange={(e) => setSelectedActionType(e.target.value)}
                  className="text-xs rounded-lg border border-gray-200 dark:border-slate-850 p-2 bg-transparent dark:text-white focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Todos">Todos los Eventos</option>
                  <option value="Sesiones">Sesiones (Inicios/Cierres)</option>
                  <option value="Inventario">Movimientos de Inventario</option>
                  <option value="Ventas">Ventas y Boletas</option>
                  <option value="Caja">Flujo de Caja y Gastos</option>
                  <option value="Seguridad">Seguridad y Cuentas</option>
                </select>
              </div>

            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en el historial por acción, detalle o id de evento..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2 border border-gray-150 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent"
            />
          </div>

          {/* Combined Timeline display */}
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {filteredTimeline.map((event) => {
              const isLogin = event.action.includes("Sesión") || event.action.includes("Ingreso") || event.action.includes("Login");
              const isSale = event.type === "sale" || event.action.includes("Venta");
              const isMovement = event.type === "movement";
              const isSecurity = event.action.includes("Usuario") || event.action.includes("Eliminado") || event.action.includes("Contraseña");

              return (
                <div 
                  key={event.id} 
                  className="p-4 bg-gray-50/50 dark:bg-slate-950 border border-gray-150 dark:border-slate-850/80 rounded-xl flex flex-col md:flex-row justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  id={`audit-log-${event.id}`}
                >
                  <div className="flex gap-3">
                    {/* Event Icon Indicator */}
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isLogin 
                        ? "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30"
                        : isSale 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30"
                        : isMovement 
                        ? "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-750"
                    }`}>
                      {isLogin && <UserCheck className="h-4.5 w-4.5" />}
                      {isSale && <ShoppingCart className="h-4.5 w-4.5" />}
                      {isMovement && <Package className="h-4.5 w-4.5" />}
                      {!isLogin && !isSale && !isMovement && <ShieldCheck className="h-4.5 w-4.5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          isLogin 
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" 
                            : isSale 
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : isMovement 
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        }`}>
                          {event.action}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.date}
                        </span>
                      </div>

                      <p className="text-xs text-gray-700 dark:text-slate-300 font-medium leading-relaxed">
                        {event.details}
                      </p>
                      
                      <div className="flex gap-4 text-[10px] text-gray-400 font-mono pt-1">
                        <span>Origen: <strong className="text-gray-500 dark:text-slate-300">{event.type.toUpperCase()}</strong></span>
                        <span>EventID: <strong className="text-gray-500 dark:text-slate-300">{event.id}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Operator Info */}
                  <div className="md:text-right shrink-0 flex flex-col justify-between items-start md:items-end text-[10px] text-gray-400 font-mono border-t md:border-t-0 border-gray-100 dark:border-slate-850 pt-2.5 md:pt-0">
                    <p className="font-extrabold text-gray-800 dark:text-slate-200">{event.user}</p>
                    <p className="text-[9px] uppercase tracking-wider">{event.role}</p>
                    <div className="flex items-center gap-1.5 opacity-60 mt-1">
                      <MapPin className="h-3 w-3" />
                      <span>192.168.1.1{Math.floor(10 + Math.random() * 89)}</span>
                    </div>
                  </div>

                </div>
              );
            })}

            {filteredTimeline.length === 0 && (
              <div className="text-center py-16 space-y-2">
                <ShieldAlert className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-gray-400 text-xs font-semibold">Ningún registro coincide con los filtros establecidos.</p>
                <p className="text-gray-300 text-[10px]">Prueba buscando otros términos o seleccionando "Todos".</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB CONTENT 3: INTERACTIVE LOGIN SIMULATOR */}
      {activeTab === "login" && (
        <div className="max-w-md mx-auto animate-fadeIn">
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-md space-y-6">
            
            <div className="text-center space-y-1.5 border-b pb-4">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30">
                <Key className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm">
                Simulador de Acceso por Contraseña
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Cada colaborador cuenta con una contraseña única para iniciar sesión. Ingresa las credenciales de un usuario registrado para activar su perfil.
              </p>
            </div>

            {loginSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-medium space-y-2 text-center">
                <p>{loginSuccess}</p>
                <p className="text-[10px] font-mono text-emerald-600">¡Event log de login registrado exitosamente!</p>
              </div>
            )}

            {loginError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl text-xs font-medium text-center">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4" autoComplete="off">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                  Nombre de Usuario (Username)
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Usuario"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full text-xs p-3 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                  Contraseña (Password)
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full text-xs p-3 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>Validar Contraseña e Ingresar</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

          </div>
        </div>
      )}

      {/* TAB CONTENT: CONTRASEÑAS DE SUCURSALES */}
      {activeTab === "branches" && (
        <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-md space-y-6">
            
            <div className="flex items-center gap-3 border-b border-gray-150 dark:border-slate-800 pb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                <Key className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm">
                  Configuración de Contraseñas por Sucursal
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mt-0.5">
                  Establece las claves de acceso requeridas para seleccionar y operar en cada tienda.
                </p>
              </div>
            </div>

            {branchPassSuccess && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-center">
                {branchPassSuccess}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveBranchPasswords(branchPasswords);
                logAction(
                  currentUser.name,
                  currentUser.role,
                  "Modificación de Seguridad",
                  "Actualizó las contraseñas de acceso a las sucursales (Norte y Sur)."
                );
                setBranchPassSuccess("¡Contraseñas de sucursales guardadas exitosamente!");
                setTimeout(() => setBranchPassSuccess(""), 4000);
              }}
              className="space-y-5"
            >
              {/* MAZAL 1 (Sucursal Principal) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      MAZAL 1 (Principal)
                    </span>
                  </div>
                  <span className="text-[10px] bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded font-bold uppercase">
                    Tienda Activa
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showBranchPassMap["Norte"] ? "text" : "password"}
                    value={branchPasswords.Norte || ""}
                    onChange={(e) => setBranchPasswords(prev => ({ ...prev, Norte: e.target.value }))}
                    placeholder="Contraseña para MAZAL 1..."
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full text-xs p-2.5 pr-10 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowBranchPassMap(prev => ({ ...prev, Norte: !prev.Norte }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showBranchPassMap["Norte"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* MAZAL 2 (Sucursal Secundaria) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      MAZAL 2 (Secundaria)
                    </span>
                  </div>
                  <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold uppercase">
                    Tienda Activa
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showBranchPassMap["Sur"] ? "text" : "password"}
                    value={branchPasswords.Sur || ""}
                    onChange={(e) => setBranchPasswords(prev => ({ ...prev, Sur: e.target.value }))}
                    placeholder="Contraseña para MAZAL 2..."
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full text-xs p-2.5 pr-10 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowBranchPassMap(prev => ({ ...prev, Sur: !prev.Sur }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showBranchPassMap["Sur"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="h-4 w-4" />
                <span>Guardar Contraseñas de Sucursales</span>
              </button>
            </form>

          </div>
        </div>
      )}

      {/* TAB CONTENT 4: BASE DE DATOS & SINCRONIZACIÓN NUBE */}
      {activeTab === "database" && (
        <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn">
          
          {/* SECCIÓN NUEVA: CONEXIÓN DE BASE DE DATOS PERSONALIZADA (TU PROPIO FIRESTORE) */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-150 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Database className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                  Configuración de Sincronización en la Nube
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Configura las credenciales de respaldo en la nube para sincronizar la información del sistema en tiempo real.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold">
                {isFirebaseOverridden ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-900/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Sincronización Activa
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center gap-1.5 border border-blue-200 dark:border-blue-900/50">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    Servidor Nube Principal
                  </span>
                )}
              </div>
            </div>

            {firebaseSuccessMsg && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-semibold">
                {firebaseSuccessMsg}
              </div>
            )}

            {firebaseErrorMsg && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs font-semibold">
                {firebaseErrorMsg}
              </div>
            )}

            <form onSubmit={handleSaveCustomFirebase} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    ID del Proyecto (Project ID) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. mi-proyecto-firebase-123"
                    value={customFirebaseConfig.projectId || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, projectId: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    Clave de API (API Key) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="ej. AIzaSy..."
                    value={customFirebaseConfig.apiKey || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    ID de la Aplicación (App ID) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. 1:1234567890:web:abcdef..."
                    value={customFirebaseConfig.appId || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, appId: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    Dominio de Autenticación (Auth Domain)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. mi-proyecto.firebaseapp.com"
                    value={customFirebaseConfig.authDomain || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, authDomain: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    ID de la Base de Datos Firestore (Database ID)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. (default) o tu base de datos secundaria"
                    value={customFirebaseConfig.firestoreDatabaseId || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, firestoreDatabaseId: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    Bucket de Almacenamiento (Storage Bucket)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. mi-proyecto.firebasestorage.app"
                    value={customFirebaseConfig.storageBucket || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, storageBucket: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 dark:text-slate-400 block">
                    ID de Envío de Mensajes (Messaging Sender ID)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. 1234567890"
                    value={customFirebaseConfig.messagingSenderId || ""}
                    onChange={(e) => setCustomFirebaseConfig(prev => ({ ...prev, messagingSenderId: e.target.value }))}
                    className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent text-gray-700 dark:text-slate-300"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                {isFirebaseOverridden && (
                  <button
                    type="button"
                    onClick={handleResetFirebaseToDefault}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 text-xs font-bold transition-all text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Restablecer a AI Studio (Por Defecto)
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Guardar Configuración de Sincronización</span>
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 1: LIVE COLECTIONS STATUS & ACTION PANEL */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-6">
            <div>
              <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                Panel de Control de Colecciones en Tiempo Real (Nube)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Visualiza el conteo exacto de registros en Firestore. Puedes exportar colecciones individuales, vaciar colecciones o eliminar un registro específico ingresando su ID o Código.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-150 dark:border-slate-800 text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                    <th className="py-3 px-4">Colección</th>
                    <th className="py-3 px-4 text-center">Registros</th>
                    <th className="py-3 px-4">Eliminar Individual (ID / Código)</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-xs">
                  {[
                    { key: "products", label: "Productos / Catálogo", count: db.products?.length || 0, icon: <Package className="h-4 w-4 text-blue-500" />, placeholder: "ID o Código de Barras" },
                    { key: "customers", label: "Clientes", count: db.customers?.length || 0, icon: <UserIcon className="h-4 w-4 text-emerald-500" />, placeholder: "ID o Teléfono" },
                    { key: "suppliers", label: "Proveedores", count: db.suppliers?.length || 0, icon: <ArrowRight className="h-4 w-4 text-indigo-500" />, placeholder: "ID de Proveedor" },
                    { key: "movements", label: "Movimientos Stock", count: db.movements?.length || 0, icon: <Activity className="h-4 w-4 text-amber-500" />, placeholder: "ID de Movimiento" },
                    { key: "sales", label: "Ventas Registradas", count: db.sales?.length || 0, icon: <ShoppingCart className="h-4 w-4 text-rose-500" />, placeholder: "ID de Venta" },
                    { key: "expenses", label: "Gastos", count: db.expenses?.length || 0, icon: <Coins className="h-4 w-4 text-orange-500" />, placeholder: "ID de Gasto" },
                    { key: "cashSessions", label: "Sesiones de Caja", count: db.cashSessions?.length || 0, icon: <Key className="h-4 w-4 text-cyan-500" />, placeholder: "ID de Sesión" },
                    { key: "auditLogs", label: "Bitácora (Audit)", count: db.auditLogs?.length || 0, icon: <Clock className="h-4 w-4 text-slate-500" />, placeholder: "ID de Bitácora" },
                    { key: "purchaseOrders", label: "Órdenes Compra", count: db.purchaseOrders?.length || 0, icon: <FileText className="h-4 w-4 text-purple-500" />, placeholder: "ID de Orden" },
                    { key: "users", label: "Usuarios / Permisos", count: db.users?.length || 0, icon: <ShieldAlert className="h-4 w-4 text-teal-500" />, placeholder: "ID o Nombre de Usuario" },
                  ].map((col) => (
                    <tr key={col.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2">
                        {col.icon}
                        <span>{col.label}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                          {col.count} docs
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2 max-w-xs">
                          <input
                            type="text"
                            placeholder={col.placeholder}
                            value={deleteDocInputs[col.key] || ""}
                            onChange={(e) => setDeleteDocInputs(prev => ({ ...prev, [col.key]: e.target.value }))}
                            className="flex-1 p-1 px-2 border border-gray-200 dark:border-slate-800 rounded bg-transparent font-mono text-[10px]"
                          />
                          <button
                            onClick={() => handleDeleteDocument(col.key, deleteDocInputs[col.key] || "")}
                            className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-450 border border-rose-100 dark:border-rose-900/40 text-[10px] font-bold cursor-pointer transition-all"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleExportDatabase(col.key)}
                            title="Exportar colección individual en formato JSON"
                            className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleEmptyCollection(col.key)}
                            title="Vaciar colección por completo"
                            className="p-1.5 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: INTEGRATED PROGRESSIVE MASSIVE IMPORTER */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-6">
            <div>
              <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Upload className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
                Importador Masivo de Datos Inteligente (Soporta miles de registros)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Sube catálogos de zapatos (archivo <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-rose-500">productos.json</code>), clientes o cualquier colección en lote. El importador procesa el lote de forma asíncrona para no congelar la pantalla.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 block uppercase">Colección Destino</label>
                <select
                  value={selectedImportCol}
                  onChange={(e) => setSelectedImportCol(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-medium"
                >
                  <option value="products">Productos / Catálogo</option>
                  <option value="customers">Clientes</option>
                  <option value="suppliers">Proveedores</option>
                  <option value="sales">Ventas Registradas</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-500 block uppercase">Estrategia de Sincronización</label>
                <select
                  value={importStrategy}
                  onChange={(e) => setImportStrategy(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent font-medium"
                >
                  <option value="upsert">Sustituir / Actualizar por ID (Recomendado)</option>
                  <option value="skip">Conservar Existentes (Ignorar Duplicados)</option>
                  <option value="overwrite">Vaciar colección local antes de importar</option>
                </select>
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="text-[11px] font-bold text-gray-500 block uppercase mb-1.5">Opciones de Archivo</label>
                <div className="relative w-full">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const parsed = JSON.parse(event.target?.result as string);
                          const arrayToImport = Array.isArray(parsed) ? parsed : (parsed.products || parsed.items || []);
                          if (arrayToImport.length === 0) {
                            alert("❌ Error: No se encontraron productos o registros válidos en el archivo JSON.");
                            return;
                          }
                          await processImport(arrayToImport);
                        } catch (err) {
                          alert("❌ Error de lectura de JSON. Asegúrate de que el archivo es válido.");
                        }
                      };
                      reader.readAsText(file);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="py-2 px-4 rounded-xl border border-gray-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-700 dark:text-slate-300">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span>Seleccionar Archivo .json</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual JSON Copy-Paste */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-gray-500 block uppercase">Pega tus Datos JSON Directamente:</label>
              <textarea
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder='Ejemplo catálogo zapatos: [ { "codigo": "123", "nombre": "Zapato Confort Negro", "linea": "Dama", "precioMenudeo": 499, "stock": 50 } ]'
                className="w-full h-24 p-2 text-[11px] font-mono border border-gray-250 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                onClick={async () => {
                  if (!pasteInput.trim()) {
                    alert("⚠️ Por favor pega el contenido JSON primero.");
                    return;
                  }
                  try {
                    const parsed = JSON.parse(pasteInput);
                    const arrayToImport = Array.isArray(parsed) ? parsed : (parsed.products || parsed.items || []);
                    await processImport(arrayToImport);
                    setPasteInput("");
                  } catch (e) {
                    alert("❌ Error: Formato JSON inválido.");
                  }
                }}
                disabled={importProgress.active}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold text-[11px] cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Procesar e Importar Texto Pegado</span>
              </button>
            </div>

            {/* REAL-TIME PROGRESS INDICATOR */}
            {importProgress.active && (
              <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl space-y-3">
                <div className="flex justify-between text-xs font-bold text-indigo-900 dark:text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    Importando registros en tiempo real...
                  </span>
                  <span>
                    {importProgress.current} / {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)
                  </span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-150"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-indigo-700 dark:text-indigo-400">
                  <span>Procesando: <strong className="font-mono">{importProgress.currentItemName}</strong></span>
                  <span className="space-x-2">
                    <span className="text-emerald-600 font-bold">✓ {importProgress.successCount} Exitosos</span>
                    <span className="text-rose-600 font-bold">✗ {importProgress.errorCount} Errores</span>
                  </span>
                </div>
              </div>
            )}

            {/* IMPORT ERRORS LOG */}
            {importErrors.length > 0 && (
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl space-y-2">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-400 block uppercase">Log de Errores e Inconsistencias:</span>
                <div className="max-h-24 overflow-y-auto text-[10px] font-mono text-rose-600 dark:text-rose-450 space-y-1">
                  {importErrors.slice(0, 50).map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                  {importErrors.length > 50 && (
                    <div className="font-bold text-gray-400">Y {importErrors.length - 50} errores más omitidos...</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: CLOUD-HOSTED BACKUPS HISTORY */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Download className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                  Historial de Respaldos Completos en la Nube
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Crea y almacena copias de seguridad completas directamente en la nube y servidor local. Puedes restaurar cualquier punto anterior o eliminar respaldos antiguos.
                </p>
              </div>
              <button
                onClick={handleCreateCloudBackup}
                disabled={isCreatingBackup}
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                {isCreatingBackup ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Respaldando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Crear Copia en la Nube</span>
                  </>
                )}
              </button>
            </div>

            <div className="overflow-hidden border border-gray-100 dark:border-slate-850 rounded-xl">
              {backups.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  Ningún respaldo guardado en la nube actualmente. Haz clic en "Crear Copia en la Nube" para registrar tu primer punto de restauración.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-850">
                  {backups.map((bk) => (
                    <div key={bk.id} className="p-4 bg-slate-50/40 dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850/20 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-800 dark:text-slate-100">Copia: {bk.timestamp}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                            {bk.sizeKB} KB
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          Creado por: <strong className="text-gray-600 dark:text-slate-300 font-medium">{bk.user || "Sistema"}</strong> • Contiene <strong className="text-gray-600 dark:text-slate-300 font-medium">{bk.totalRecords} registros</strong>.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestoreCloudBackup(bk)}
                          className="py-1 px-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                        >
                          Restaurar Copia
                        </button>
                        <button
                          onClick={() => handleDeleteCloudBackup(bk.id, bk.timestamp)}
                          className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-450 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Offline Backup Manual Text Exporter Viewer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-850/40 rounded-xl border border-gray-150 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-gray-700 dark:text-slate-200 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Visor y Exportador de Respaldo Local en Formato JSON
                </span>
                <button
                  onClick={handleGenerateManualExport}
                  className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Generar Respaldo Completo Local</span>
                </button>
              </div>

              {showManualExport ? (
                <div className="space-y-2 animate-fadeIn">
                  <textarea
                    readOnly
                    value={manualExportText}
                    className="w-full h-24 p-2 text-[10px] font-mono border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(manualExportText);
                          alert("📋 ¡Copia de seguridad copiada al portapapeles exitosamente!");
                        } catch (err) {
                          alert("No se pudo copiar de forma automática. Selecciona el texto del recuadro y presiona Ctrl+C.");
                        }
                      }}
                      className="flex-1 py-1 px-2.5 rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      Copiar Texto
                    </button>
                    <button
                      onClick={() => setShowManualExport(false)}
                      className="py-1 px-2.5 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-450 text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      Cerrar Visor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-16 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-3">
                  <span className="text-[10px] text-gray-400">Ningún respaldo activo en el visor. Haz clic arriba en "Generar Respaldo Completo Local" si deseas visualizar el JSON aquí.</span>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: MASTER PURGE ZONE */}
          <div className="p-6 bg-rose-50/40 dark:bg-rose-950/10 border border-rose-150 dark:border-rose-900/30 rounded-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-rose-800 dark:text-rose-400">🚨 ZONA DE PELIGRO EXTREMO: RESTABLECER ERP COMPLETO</h4>
                <p className="text-[10px] text-rose-700/80 dark:text-rose-400/70 leading-relaxed">
                  ¿Deseas purgar todas las colecciones (catálogos de productos, ventas, inventarios, gastos, clientes y sesiones)? Esta acción borrará de forma permanente la información operativa, permitiéndote arrancar el sistema 100% limpio y sincronizado con MySQL y Supabase.
                </p>
                <p className="text-[10px] text-rose-600 dark:text-rose-500 font-semibold font-mono">
                  * Las cuentas de usuarios administradores se preservan para evitar la pérdida de accesos al sistema.
                </p>
              </div>
            </div>

            {purgeConfirmStep === 0 && (
              <div className="flex gap-2 pt-2.5">
                <button
                  onClick={() => {
                    setPurgeConfirmStep(1);
                    setPurgeInputText("");
                  }}
                  disabled={isResetting}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-[11px] font-extrabold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Vaciar y Limpiar Absolutamente Todo el ERP</span>
                </button>
              </div>
            )}

            {purgeConfirmStep === 1 && (
              <div className="bg-rose-100/60 dark:bg-rose-950/20 p-4 rounded-xl border border-rose-200/50 dark:border-rose-900/40 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold text-rose-800 dark:text-rose-400 uppercase font-mono tracking-wider">⚠️ Confirmación de Seguridad - Paso 1 de 2</span>
                  <button 
                    onClick={() => {
                      setPurgeConfirmStep(0);
                      setPurgeInputText("");
                    }} 
                    className="text-[10px] text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 font-bold"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 dark:text-slate-300">
                  Para proceder, por favor escribe exactamente la siguiente frase de seguridad: <br />
                  <strong className="text-rose-700 dark:text-rose-400 font-mono select-all font-extrabold">ELIMINAR TODO MI ERP</strong>
                </p>
                <input
                  type="text"
                  className="w-full p-2 text-xs rounded-lg border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono text-center uppercase tracking-wider"
                  placeholder="Escribe la frase aquí"
                  value={purgeInputText}
                  onChange={(e) => setPurgeInputText(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (purgeInputText.trim().toUpperCase() === "ELIMINAR TODO MI ERP") {
                      setPurgeConfirmStep(2);
                    } else {
                      alert("❌ La frase ingresada no coincide exactamente.");
                    }
                  }}
                  disabled={purgeInputText.trim().toUpperCase() !== "ELIMINAR TODO MI ERP"}
                  className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-gray-300 dark:disabled:bg-slate-800 disabled:text-gray-500 text-white text-[11px] font-bold transition-colors"
                >
                  Continuar al Último Paso
                </button>
              </div>
            )}

            {purgeConfirmStep === 2 && (
              <div className="bg-rose-200/50 dark:bg-rose-950/40 p-4 rounded-xl border-2 border-rose-600 space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold text-rose-850 dark:text-rose-400 uppercase font-mono tracking-wider">🚨 ÚLTIMA ADVERTENCIA - Paso 2 de 2</span>
                  <button 
                    onClick={() => {
                      setPurgeConfirmStep(0);
                      setPurgeInputText("");
                    }} 
                    className="text-[10px] text-rose-700 hover:text-rose-950 dark:text-rose-400 dark:hover:text-rose-200 font-bold"
                  >
                    Cancelar y Abortar
                  </button>
                </div>
                <p className="text-[10px] text-rose-900 dark:text-rose-350 font-bold leading-relaxed">
                  ¿Estás COMPLETAMENTE seguro? Esta acción borrará de forma permanente e irreversible toda la información de productos, inventarios, ventas, gastos y sesiones de tu base de datos. ¡No podrás recuperar estos datos!
                </p>
                <button
                  onClick={handleDeleteAllData}
                  disabled={isResetting}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:bg-rose-400 text-white text-[11px] font-black tracking-wide shadow-md transition-colors flex items-center justify-center gap-1.5"
                >
                  {isResetting ? (
                    <>
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Purgando base de datos...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span>SÍ, CONFIRMO Y EJECUTO EL PURGADO DE EMERGENCIA AHORA</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
