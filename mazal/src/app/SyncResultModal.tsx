/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { X, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

export interface SyncResultModalProps {
  isOpen: boolean;
  loading: boolean;
  result: {
    success: boolean;
    message: string;
    error?: string;
    syncedTables?: string[];
    totalRecords?: number;
    pendingSynced?: number;
  } | null;
  onClose: () => void;
  onRetry: () => void;
}

export const SyncResultModal: React.FC<SyncResultModalProps> = ({
  isOpen,
  loading,
  result,
  onClose,
  onRetry
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
        
        {/* Close Button */}
        {!loading && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Header & Icon */}
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl ${
            loading
              ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
              : result?.success
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
              : "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
          }`}>
            {loading ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : result?.success ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {loading
                ? "Sincronizando con Supabase..."
                : result?.success
                ? "¡Sincronización Exitosa!"
                : "Error al Sincronizar"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loading
                ? "Enviando registros locales a la nube en tiempo real"
                : result?.success
                ? "Base de datos en la nube actualizada correctamente"
                : "Verificación de conexión o subida fallida"}
            </p>
          </div>
        </div>

        {/* Body Info */}
        <div className="space-y-2.5 text-xs">
          {loading ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                <span>Comunicando con Supabase Cloud...</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Procesando productos, clientes, ventas, sesiones y kardex...
              </p>
            </div>
          ) : result?.success ? (
            <div className="space-y-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-emerald-800 dark:text-emerald-300 font-medium">
                {result.message}
              </div>
              {result.syncedTables && result.syncedTables.length > 0 && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Tablas Sincronizadas:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {result.syncedTables.map((t, idx) => (
                      <span key={idx} className="bg-white dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-800 dark:text-rose-300 space-y-1.5">
              <p className="font-bold">{result?.message}</p>
              <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 break-all">
                Detalle: {result?.error}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 flex justify-end gap-2">
          {!loading && (
            <>
              {!result?.success && (
                <button
                  onClick={onRetry}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Reintentar
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                Aceptar
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
