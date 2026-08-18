/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { MazalLogo } from "./MazalLogo";
import { Store, Lock, KeyRound, Eye, EyeOff, ArrowRight, ShieldCheck, Sun, Moon } from "lucide-react";
import { verifyBranchAccess } from "../services/authService";

interface BranchGateProps {
  onBranchSelect: (branch: "Norte" | "Sur") => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}

export default function BranchGate({ onBranchSelect, theme = "light", onToggleTheme }: BranchGateProps) {
  const [selected, setSelected] = useState<"Norte" | "Sur" | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBranchClick = (branch: "Norte" | "Sur") => {
    setSelected(branch);
    setPassword("");
    setErrorMsg("");
  };

  const handleBack = () => {
    setSelected(null);
    setPassword("");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    if (!selected) {
      setIsSubmitting(false);
      return;
    }

    try {
      const isValid = await verifyBranchAccess(selected, password);
      if (isValid) {
        onBranchSelect(selected);
      } else {
        setErrorMsg("Contraseña de sucursal incorrecta. Verifica con el administrador.");
      }
    } catch (err) {
      setErrorMsg("Error validando acceso de sucursal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef1e9] dark:bg-slate-950 flex flex-col justify-between items-center p-4 sm:p-6 font-sans selection:bg-emerald-500 selection:text-white transition-colors duration-300">
      
      {/* Top Bar with Theme Switcher */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 px-1">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px] uppercase tracking-wider">Sistema POS Multi-Sucursal</span>
        </div>

        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            id="branchgate-theme-toggle"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
            aria-label="Alternar tema visual"
          >
            {theme === "light" ? (
              <>
                <Moon className="h-4 w-4 text-slate-700" />
                <span className="hidden sm:inline">Modo Oscuro</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4 text-amber-400" />
                <span className="hidden sm:inline">Modo Claro</span>
              </>
            )}
          </button>
        )}
      </header>

      {/* Main Selection Card */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-slate-800 shadow-[0_10px_40px_rgba(45,106,79,0.08)] p-6 sm:p-8 space-y-6 sm:space-y-8 relative overflow-hidden my-auto">
        
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-teal-500/10 dark:bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
          <MazalLogo size="lg" />
          <div className="h-0.5 w-16 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full my-1" />
          
          {!selected ? (
            <>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Selección de Sucursal
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs leading-relaxed">
                Para acceder al sistema y visualizar la información correspondiente, por favor selecciona tu sucursal.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 justify-center">
                <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Ingresar a {selected === "Norte" ? "MAZAL 1" : "MAZAL 2"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-xs leading-relaxed">
                Introduce la contraseña de seguridad para validar la autenticación de la sucursal.
              </p>
            </>
          )}
        </div>

        {!selected ? (
          <div className="grid grid-cols-1 gap-3 pt-1">
            {/* MAZAL 1 branch button card */}
            <button
              onClick={() => handleBranchClick("Norte")}
              id="branch-btn-norte"
              className="group p-4 rounded-2xl border border-gray-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-850 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all duration-200 text-left flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-200">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    MAZAL 1
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Sucursal Principal • Inventarios, ventas y cajas de MAZAL 1
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
            </button>

            {/* MAZAL 2 branch button card */}
            <button
              onClick={() => handleBranchClick("Sur")}
              id="branch-btn-sur"
              className="group p-4 rounded-2xl border border-gray-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-850 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 text-left flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    MAZAL 2
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    Sucursal Secundaria • Inventarios, ventas y cajas de MAZAL 2
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-fadeIn">
            {/* Password input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider block">
                Contraseña de Sucursal
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Introduce la contraseña de acceso"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full pl-10 pr-10 py-3 text-sm bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 flex items-center gap-1 mt-1">
                <ShieldCheck className="h-3 w-3 text-emerald-500 inline" />
                <span>Acceso protegido por credencial de seguridad de sucursal.</span>
              </p>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Controls */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1 py-3 border border-gray-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Regresar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Autenticando..." : "Validar Acceso"}
                {!isSubmitting && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Footer copyright info */}
      <footer className="w-full max-w-5xl text-center py-2">
        <p className="text-[11px] text-gray-500 dark:text-slate-500">
          Mazal Distribuidora de productos desechables, plásticos y comestibles - 2026
        </p>
      </footer>
    </div>
  );
}
