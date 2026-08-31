/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { X, Smartphone, HardDrive, Download, RefreshCw } from "lucide-react";

export interface PwaGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PwaGuideModal: React.FC<PwaGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-xl">
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Funcionamiento Offline (PWA)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sistema Dual: Trabaja con o sin Internet en tu tienda
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              1. Service Worker & Caché Local
            </span>
            <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
              El sistema guarda los archivos necesarios en la memoria del navegador para abrir de forma instantánea aún sin conexión a internet.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              2. Instala la App en PC o Celular (PWA)
            </span>
            <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
              En la barra de direcciones de tu navegador haz clic en <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong> para tener el acceso directo en tu escritorio o celular.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              3. Inventario y Sincronización Automática
            </span>
            <p className="text-slate-600 dark:text-slate-400 text-[11.5px]">
              Cada cobro descuenta el inventario de inmediato. Al recuperar la conexión a Internet, el sistema sincroniza automáticamente los cambios con la nube.
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
