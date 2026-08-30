/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Receipt, 
  Search, 
  FileText, 
  Calendar, 
  Printer, 
  Share2, 
  DollarSign, 
  CreditCard, 
  ArrowRight, 
  Clock, 
  User, 
  Check,
  Tag,
  AlertCircle
} from "lucide-react";
import { Sale, PaymentMethod, formatPrice } from "../types";
import { isWeighed, getUnitLabel, kgToGrams, literToMl } from "../utils/WeightService";
import { printThermalTicket, generateTicketPDF, calculateTotalArticles, formatItemQuantityLine } from "../utils/TicketPrinter";
import { getDatabase, logAction } from "../data";

interface ReceiptsModuleProps {
  currentUser: { name: string; role: string };
}

export default function ReceiptsModule({ currentUser }: ReceiptsModuleProps) {
  const [db, setDb] = useState(getDatabase());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("TODOS");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showPrintToast, setShowPrintToast] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);

  const triggerReload = () => {
    setDb(getDatabase());
  };

  useEffect(() => {
    triggerReload();
  }, []);

  // Filter receipts
  const filteredSales = db.sales.filter((sale: Sale) => {
    const matchesSearch = 
      sale.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sale.customerName && sale.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      sale.userName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPayment = 
      selectedPaymentMethod === "TODOS" || 
      sale.paymentMethod === selectedPaymentMethod;

    return matchesSearch && matchesPayment;
  });

  // Auto select the first sale if none is selected
  useEffect(() => {
    if (filteredSales.length > 0 && !selectedSale) {
      setSelectedSale(filteredSales[0]);
    }
  }, [filteredSales, selectedSale]);

  const handlePrint = () => {
    if (!selectedSale) return;
    setShowPrintToast(true);
    
    logAction(
      currentUser.name,
      currentUser.role,
      "Reimpresión de Ticket",
      `Se reimprimió el ticket ${selectedSale.ticketNumber} de venta por $${selectedSale.total.toFixed(2)}`
    );
    setTimeout(() => {
      setShowPrintToast(false);
    }, 3000);

    const active = localStorage.getItem("mazal_active_branch");
    const fallbackBranch = active === "Sur" ? "MAZAL 2" : "MAZAL 1";
    printThermalTicket(selectedSale, (selectedSale as any).branch || fallbackBranch, db.products);
  };

  const handleDownloadPDF = () => {
    if (!selectedSale) return;
    const active = localStorage.getItem("mazal_active_branch");
    const fallbackBranch = active === "Sur" ? "MAZAL 2" : "MAZAL 1";
    generateTicketPDF(selectedSale, (selectedSale as any).branch || fallbackBranch, db.products);
  };

  const handleShare = () => {
    if (!selectedSale) return;
    setShowShareToast(true);
    setTimeout(() => {
      setShowShareToast(false);
    }, 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="receipts-module-root">
      
      {/* LEFT SIDE: Receipts search and list (6 columns) */}
      <div className="lg:col-span-6 space-y-4">
        
        {/* Search and Filters Header */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-450 rounded-lg">
                <Receipt className="h-5 w-5" />
              </div>
              <h2 className="font-bold text-gray-850 dark:text-slate-100">Archivo de Recibos y Ventas</h2>
            </div>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono font-bold px-2 py-0.5 rounded-full">
              {filteredSales.length} Recibos
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            Busca ventas históricas para reimprimir tickets de clientes, resolver aclaraciones o revisar cobros.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 pt-1">
            {/* Search Input */}
            <div className="sm:col-span-7 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por ticket, cliente o cajero..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-200 placeholder-gray-450 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            {/* Payment Method filter */}
            <div className="sm:col-span-5">
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="TODOS">Todos los métodos</option>
                <option value={PaymentMethod.CASH}>Efectivo</option>
                <option value={PaymentMethod.CARD}>Tarjeta</option>
                <option value={PaymentMethod.TRANSFER}>Transferencia</option>
                <option value={PaymentMethod.CREDIT}>Crédito (Fiado)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Receipts List */}
        <div className="rounded-xl border border-gray-150 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-850/50 border-b border-gray-150 dark:border-slate-800 text-[10px] font-mono text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-3">Nº Ticket / Fecha</th>
                  <th className="p-3">Cliente / Cajero</th>
                  <th className="p-3">Artículos</th>
                  <th className="p-3">Pago</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150/40 dark:divide-slate-800/65">
                {filteredSales.map((sale) => {
                  const isSelected = selectedSale?.id === sale.id;
                  const totalArticles = calculateTotalArticles(sale.items, db.products);

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSale(sale)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? "bg-amber-50/70 dark:bg-slate-850 font-medium" 
                          : "hover:bg-slate-50/50 dark:hover:bg-slate-850/30"
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <FileText className={`h-3.5 w-3.5 ${isSelected ? "text-amber-500" : "text-gray-400"}`} />
                          {sale.ticketNumber}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {sale.date}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-gray-800 dark:text-slate-200 font-semibold truncate max-w-[140px]">
                          {sale.customerName || "Venta de Contado"}
                        </div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          Caja: {sale.userName}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-350 font-bold">
                        {totalArticles} {totalArticles === 1 ? "artículo" : "artículos"}
                        <span className="text-[10px] text-gray-400 block font-normal font-sans">
                          ({sale.items.length} {sale.items.length === 1 ? "prod" : "prods"})
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          sale.paymentMethod === PaymentMethod.CREDIT
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : sale.paymentMethod === PaymentMethod.CASH
                            ? "bg-emerald-100 text-emerald-850 border border-emerald-250"
                            : "bg-indigo-100 text-indigo-850 border border-indigo-200"
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                        ${sale.total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}

                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-400 font-mono">
                      <AlertCircle className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                      Ningún recibo coincide con los filtros de búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Interactive Ticket Detail Mockup (6 columns) */}
      <div className="lg:col-span-6 space-y-4">
        
        {selectedSale ? (
          <div className="space-y-4">
            
            {/* Quick Actions Panel */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-xl shadow-xs flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePrint}
                className="flex-1 min-w-[140px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" /> Reimprimir Ticket
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <FileText className="h-4 w-4" /> Descargar PDF
              </button>
            </div>

            {/* Toasts */}
            {showPrintToast && (
              <div className="p-3 bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 font-sans shadow-md animate-fade-in">
                <Check className="h-4 w-4 shrink-0" />
                <span>Imprimiendo copia del ticket {selectedSale.ticketNumber} en formato térmico de 80mm...</span>
              </div>
            )}

            {/* Thermal Ticket Container */}
            <div className="bg-[#FAF8F2] dark:bg-slate-950 p-7 rounded-2xl border-2 border-[#DFD9CE] dark:border-slate-800 shadow-md relative overflow-hidden text-slate-850 dark:text-slate-200 printable-area">
              {/* Receipt edge deco effect */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-repeat-x" style={{ backgroundImage: "radial-gradient(circle, transparent, transparent 50%, #EFEBE0 50%, #EFEBE0 100%)", backgroundSize: "8px 8px" }}></div>
              
              <div className="space-y-4 font-mono text-sm pt-3">
                
                {/* Header info */}
                <div className="text-center space-y-1">
                  <h3 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
                    M A Z A L
                  </h3>
                  <p className="font-extrabold text-[10px] text-gray-800 dark:text-gray-200 uppercase">Distribuidor de productos desechables, plásticos y comestibles</p>
                  <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed">
                    Manzana 008, 50830 Jiquipilco, Méx.<br />
                    Teléfono: 7121110085
                  </p>
                  <p className="border-y border-dashed border-slate-350 dark:border-slate-850 py-1.5 text-[11px] font-bold">
                    TICKET DE VENTA
                  </p>
                </div>

                {/* Meta details */}
                <div className="space-y-1 text-[11px] border-b border-dashed border-slate-350 dark:border-slate-850 pb-2">
                  <div className="flex justify-between">
                    <span>FOLIO / TICKET:</span>
                    <span className="font-bold">{selectedSale.ticketNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>FECHA Y HORA:</span>
                    <span>{selectedSale.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ATENDIÓ:</span>
                    <span className="truncate max-w-[150px] uppercase">{selectedSale.userName}</span>
                  </div>
                  <div className="flex justify-between border-t border-dotted border-gray-300 pt-1 mt-1">
                    <span>CLIENTE:</span>
                    <span className="font-bold uppercase truncate max-w-[150px]">{selectedSale.customerName || "VENTA AL PÚBLICO GENERAL"}</span>
                  </div>
                </div>

                {/* Items grid */}
                <div className="space-y-2 pb-2 border-b border-dashed border-slate-350 dark:border-slate-850">
                  <div className="grid grid-cols-12 font-bold text-[10px] pb-1 border-b border-dashed border-slate-250">
                    <span className="col-span-6">DESCRIPCIÓN</span>
                    <span className="col-span-2 text-center">CANT</span>
                    <span className="col-span-4 text-right">IMPORTE</span>
                  </div>

                  {selectedSale.items.map((item, idx) => {
                    const prod = db.products.find((p: any) => p.id === item.productId);
                    const isW = isWeighed(prod) || (item.unit && ['kg', 'g', 'l', 'ml'].includes(String(item.unit).toLowerCase()));
                    const unitLabel = getUnitLabel(prod) || (item.unit?.toLowerCase() === 'kg' ? 'Kg' : (item.unit || 'pza'));

                    let rawQty = Number(item.quantity) || 0;
                    if (isW && rawQty >= 50 && (item.unitPrice || 0) > 0) {
                      const pricePerKg = Number(item.unitPrice) || 1;
                      const totalP = Number(item.totalPrice) || 0;
                      if (Math.abs(totalP - (rawQty * pricePerKg / 1000)) < 0.1 || totalP <= (rawQty * pricePerKg / 500)) {
                        rawQty = rawQty / 1000;
                      }
                    }

                    let qtyFormatted = "";
                    if (isW) {
                      if (item.displayUnit === "g" || (!item.displayUnit && rawQty < 1 && unitLabel === "Kg")) {
                        qtyFormatted = `${kgToGrams(rawQty)} g`;
                      } else if (item.displayUnit === "ml" || (!item.displayUnit && rawQty < 1 && unitLabel === "L")) {
                        qtyFormatted = `${literToMl(rawQty)} ml`;
                      } else {
                        qtyFormatted = `${rawQty.toFixed(3)} ${unitLabel}`;
                      }
                    } else {
                      qtyFormatted = `${rawQty} ${unitLabel || "pza"}`;
                    }

                    return (
                      <div key={idx} className="grid grid-cols-12 text-[11px] leading-tight gap-1">
                        <div className="col-span-6">
                          <span className="font-bold block">{item.productName}</span>
                          <span className="text-[9px] text-gray-500">c/{unitLabel}: ${formatPrice(item.unitPrice)}</span>
                        </div>
                        <span className="col-span-2 text-center font-bold">{qtyFormatted}</span>
                        <span className="col-span-4 text-right font-bold">${formatPrice(item.totalPrice)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>ARTÍCULOS TOTALES:</span>
                    <span className="font-bold">{calculateTotalArticles(selectedSale.items, db.products)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm border-t border-dashed border-slate-350 dark:border-slate-850 pt-2 text-slate-950 dark:text-white">
                    <span>TOTAL A PAGAR:</span>
                    <span>${selectedSale.total.toFixed(2)} MXN</span>
                  </div>
                </div>

                {/* Payment info */}
                <div className="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10.5px] space-y-1">
                  <div className="flex justify-between">
                    <span>MÉTODO DE PAGO:</span>
                    <span className="font-bold uppercase">{selectedSale.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>EFECTIVO RECIBIDO:</span>
                    <span>${(selectedSale.amountPaid || selectedSale.total).toFixed(2)} MXN</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-400">
                    <span>SU CAMBIO:</span>
                    <span>${(selectedSale.change || 0).toFixed(2)} MXN</span>
                  </div>
                        {/* Greeting footer */}
                <div className="text-center space-y-1 pt-2 border-t border-dashed border-slate-350 dark:border-slate-850 text-[10px] leading-relaxed">
                  <p className="font-bold text-[11px]">
                    ¡GRACIAS POR SU COMPRA!
                  </p>
                  <p className="text-gray-500 text-[9px]">Conserve este ticket para devoluciones o aclaraciones</p>
                  <p className="text-[8.5px] font-mono tracking-wider mt-1 text-gray-400 uppercase">
                    FOLIO: {selectedSale.ticketNumber || selectedSale.id}
                  </p>
                </div>             </div>

              </div>
            </div>

          </div>
        ) : (
          <div className="p-10 text-center rounded-2xl border border-dashed border-gray-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-400 font-mono">
            Selecciona un recibo de la lista de la izquierda para ver su ticket detallado.
          </div>
        )}

      </div>

    </div>
  );
}
