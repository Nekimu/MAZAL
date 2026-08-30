/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TicketPrinter.ts
 * Enterprise Thermal POS Ticket Generator & Printing Utility (80mm Standard - Calibrated for 170% Scale)
 */

import jsPDF from "jspdf";
import { Sale, Product, formatPrice } from "../types";
import { isWeighed, getUnitLabel, kgToGrams, literToMl } from "./WeightService";

export interface TicketBranchInfo {
  name: string;
  rfc?: string;
  address?: string;
  phone?: string;
}

const DEFAULT_COMPANY_INFO: TicketBranchInfo = {
  name: "MAZAL 1",
  address: "Manzana 008, 50830 Jiquipilco, Méx.",
  phone: "7121110085"
};

/**
 * Generates an exact date-time folio string without seconds (TK-YYYYMMDD-HHmm)
 */
export function formatDateTimeFolio(dateStr?: string, existingTicketNumber?: string): string {
  if (existingTicketNumber && existingTicketNumber.startsWith("TK-") && existingTicketNumber.length >= 14) {
    // If it has seconds (17 chars: TK-YYYYMMDD-HHmmss), trim to HHmm (14 chars)
    if (existingTicketNumber.length === 17) {
      return existingTicketNumber.substring(0, 15);
    }
    return existingTicketNumber;
  }
  const d = dateStr ? new Date(dateStr) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const Y = valid.getFullYear();
  const M = String(valid.getMonth() + 1).padStart(2, '0');
  const D = String(valid.getDate()).padStart(2, '0');
  const h = String(valid.getHours()).padStart(2, '0');
  const m = String(valid.getMinutes()).padStart(2, '0');
  return `TK-${Y}${M}${D}-${h}${m}`;
}

/**
 * Formats a date string to show ONLY date, hour and minute (YYYY-MM-DD HH:mm), omitting seconds
 */
export function formatTicketDateTime(dateStr?: string): string {
  if (!dateStr) return "";
  // Check if string matches YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(dateStr)) {
    return dateStr.substring(0, 16);
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  }
  return dateStr.replace(/:\d{2}$/, "");
}

/**
 * Calculates total piece/quantity count for a sale
 */
export function calculateTotalArticles(items: Sale["items"], dbProducts: Product[] = []): number {
  return (items || []).reduce((acc, item) => {
    const prod = (dbProducts || []).find(p => p.id === item.productId);
    const isW = isWeighed(prod);
    if (isW) {
      return acc + 1; // Weighted items count as 1 weighed line item
    }
    return acc + (item.quantity || 1);
  }, 0);
}

/**
 * Formats a quantity line for thermal receipt output
 */
export function formatItemQuantityLine(item: Sale["items"][0], dbProducts: Product[] = []): string {
  const prod = (dbProducts || []).find(p => p.id === item.productId);
  const isW = isWeighed(prod);
  const unitLabel = getUnitLabel(prod);

  let qtyFormatted = "";
  if (isW) {
    if (item.displayUnit === "g" || (!item.displayUnit && item.quantity < 1 && unitLabel === "Kg")) {
      qtyFormatted = `${kgToGrams(item.quantity)} g`;
    } else if (item.displayUnit === "ml" || (!item.displayUnit && item.quantity < 1 && unitLabel === "L")) {
      qtyFormatted = `${literToMl(item.quantity)} ml`;
    } else {
      qtyFormatted = `${(item.quantity || 0).toFixed(3)} ${unitLabel}`;
    }
    return `${qtyFormatted} x $${formatPrice(item.unitPrice)}/${unitLabel}`;
  } else {
    qtyFormatted = `${item.quantity || 1} ${unitLabel || "pz"}`;
    return `${qtyFormatted} x $${formatPrice(item.unitPrice)}`;
  }
}

/**
 * Generates plain thermal HTML calibrated for 80mm paper at 170% zoom with 0 margins
 */
export function getThermalTicketHTML(sale: Sale, branchName?: string, dbProducts: Product[] = []): string {
  const totalArticles = calculateTotalArticles(sale.items, dbProducts);
  const amountPaid = Number(sale.amountPaid) || Number(sale.total) || 0;
  const change = Number(sale.change) || 0;
  const folio = formatDateTimeFolio(sale.date, sale.ticketNumber);
  const dateFormatted = formatTicketDateTime(sale.date);

  const itemsHtml = (sale.items || []).map((item) => {
    const qtyLine = formatItemQuantityLine(item, dbProducts);
    return `
      <div style="margin-bottom: 2.5px; padding-bottom: 1.5px; width: 100%; box-sizing: border-box;">
        <div style="font-weight: 800; font-size: 7.5px; color: #000; text-transform: uppercase; word-break: break-word; line-height: 1.1;">
          ${item.productName}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 7px; color: #000; width: 100%; box-sizing: border-box;">
          <span style="flex: 1; word-break: break-word; padding-right: 2px;">${qtyLine}</span>
          <span style="flex-shrink: 0; font-weight: 800; text-align: right; white-space: nowrap;">$${formatPrice(item.totalPrice)}</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="thermal-ticket-wrapper" style="width: 42mm; max-width: 42mm; margin: 0; padding: 0.5mm 1mm 2mm 3.2mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, monospace, sans-serif; font-size: 7.5px; color: #000000; background: #ffffff; line-height: 1.15; box-sizing: border-box;">
      
      <!-- HEADER -->
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; width: 100%; box-sizing: border-box;">
        <div style="font-size: 11.5px; font-weight: 900; letter-spacing: 1.5px; margin-bottom: 1px; text-transform: uppercase;">M A Z A L</div>
        <div style="font-size: 6.8px; font-weight: 800; text-transform: uppercase; line-height: 1.1;">Distribuidor de productos desechables, plásticos y comestibles</div>
        <div style="font-size: 7px; margin-top: 1.5px; font-weight: 600;">${DEFAULT_COMPANY_INFO.address}</div>
        <div style="font-size: 7px; font-weight: 600;">Teléfono: ${DEFAULT_COMPANY_INFO.phone}</div>
      </div>

      <!-- METADATA (DATE-TIME FOLIO WITHOUT SECONDS) -->
      <div style="border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; font-size: 7px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%;">
          <span style="font-weight: 700;">FOLIO:</span>
          <span style="font-weight: 800; font-family: monospace; white-space: nowrap;">${folio}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%; margin-top: 1px;">
          <span>FECHA / HORA:</span>
          <span style="white-space: nowrap;">${dateFormatted}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%; margin-top: 1px;">
          <span>ATENDIÓ:</span>
          <span style="text-transform: uppercase; font-weight: 700; white-space: nowrap;">${sale.userName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%; margin-top: 1.5px; padding-top: 1.5px; border-top: 1px dotted #888;">
          <span style="flex-shrink: 0; padding-right: 2px;">CLIENTE:</span>
          <span style="font-weight: 800; text-transform: uppercase; word-break: break-word; text-align: right;">${(sale.customerName || "VENTA AL PÚBLICO GENERAL").toUpperCase()}</span>
        </div>
      </div>

      <!-- ITEMS LIST -->
      <div style="border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 7px; border-bottom: 1px solid #000; padding-bottom: 1.5px; margin-bottom: 2px; text-transform: uppercase; width: 100%;">
          <span>ARTÍCULO / DETALLE</span>
          <span>IMPORTE</span>
        </div>
        ${itemsHtml}
      </div>

      <!-- TOTALS -->
      <div style="border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; font-size: 7px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 1px;">
          <span>ARTÍCULOS TOTALES:</span>
          <span style="font-weight: 800;">${totalArticles}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 9.5px; font-weight: 900; border-top: 1px dotted #000; padding-top: 1.5px; margin-top: 1.5px;">
          <span>TOTAL:</span>
          <span style="white-space: nowrap;">$${(Number(sale.total) || 0).toFixed(2)} MXN</span>
        </div>
      </div>

      <!-- PAYMENT DETAILS -->
      <div style="border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 3px; font-size: 7px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>MÉTODO DE PAGO:</span>
          <span style="font-weight: 800; text-transform: uppercase;">${sale.paymentMethod}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 1px;">
          <span>PAGO CON:</span>
          <span style="white-space: nowrap;">$${amountPaid.toFixed(2)} MXN</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-weight: 800; margin-top: 1px;">
          <span>CAMBIO:</span>
          <span style="white-space: nowrap;">$${change.toFixed(2)} MXN</span>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="text-align: center; font-size: 7px; padding-top: 1.5px; width: 100%; box-sizing: border-box;">
        <div style="font-weight: 900; font-size: 8px; margin-bottom: 1px;">¡GRACIAS POR SU COMPRA!</div>
        <div>Conserve este ticket para aclaraciones</div>
        <div style="font-size: 6.5px; color: #333; margin-top: 2px; font-family: monospace;">${folio}</div>
      </div>

    </div>
  `;
}

/**
 * Triggers clean 80mm thermal printing via a sandboxed iframe with zero blank borders and 170% zoom calibration
 */
export function printThermalTicket(sale: Sale, branchName?: string, dbProducts: Product[] = []): void {
  const htmlContent = getThermalTicketHTML(sale, branchName, dbProducts);
  const folio = formatDateTimeFolio(sale.date, sale.ticketNumber);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0px";
  iframe.style.height = "0px";
  iframe.style.border = "none";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket - ${folio}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm !important;
          }
          *, *:before, *:after {
            box-sizing: border-box !important;
          }
          html, body {
            width: 42mm !important;
            max-width: 42mm !important;
            min-width: 42mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .thermal-ticket-wrapper {
            width: 42mm !important;
            max-width: 42mm !important;
            margin: 0 !important;
            padding: 0.5mm 1mm 2mm 3.2mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          @media print {
            html, body {
              width: 42mm !important;
              max-width: 42mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .thermal-ticket-wrapper {
              width: 42mm !important;
              max-width: 42mm !important;
              margin: 0 !important;
              padding: 0.5mm 1mm 2mm 3.2mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
              setTimeout(function() {
                if (window.parent && window.frameElement) {
                  window.parent.document.body.removeChild(window.frameElement);
                }
              }, 1000);
            }, 200);
          };
        </script>
      </body>
    </html>
  `);
  doc.close();
}

/**
 * Generates a downloadable 80mm PDF thermal receipt using jsPDF
 */
export function generateTicketPDF(sale: Sale, branchName?: string, dbProducts: Product[] = []): void {
  const totalArticles = calculateTotalArticles(sale.items, dbProducts);
  const amountPaid = Number(sale.amountPaid) || Number(sale.total) || 0;
  const change = Number(sale.change) || 0;
  const folio = formatDateTimeFolio(sale.date, sale.ticketNumber);
  const dateFormatted = formatTicketDateTime(sale.date);

  // Calculate dynamic roll height
  const itemCount = (sale.items || []).length;
  const pageHeight = Math.max(130, 100 + itemCount * 9);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, pageHeight]
  });

  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);

  // Header
  doc.text("M A Z A L", 40, 8, { align: "center" });

  doc.setFontSize(6.5);
  doc.setFont("courier", "bold");
  doc.text("Distribuidor de productos desechables,", 40, 12, { align: "center" });
  doc.text("plásticos y comestibles", 40, 15.5, { align: "center" });
  doc.setFont("courier", "normal");
  doc.text(DEFAULT_COMPANY_INFO.address, 40, 19.5, { align: "center" });
  doc.text(`Tel: ${DEFAULT_COMPANY_INFO.phone}`, 40, 23.5, { align: "center" });

  doc.setLineDashPattern([1, 1], 0);
  doc.line(2, 26, 78, 26);

  // Meta Info
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text(`FOLIO: ${folio}`, 2, 31);
  doc.setFont("courier", "normal");
  doc.text(`FECHA: ${dateFormatted}`, 2, 35);
  doc.text(`ATENDIO: ${(sale.userName || "CAJERO").toUpperCase()}`, 2, 39);
  doc.text(`CLIENTE: ${(sale.customerName || "PÚBLICO GENERAL").toUpperCase()}`, 2, 43);

  doc.line(2, 46, 78, 46);

  // Items
  doc.setFont("courier", "bold");
  doc.text("ARTICULO / DETALLE", 2, 50);
  doc.text("TOTAL", 78, 50, { align: "right" });
  doc.line(2, 52, 78, 52);

  doc.setFont("courier", "normal");
  let currentY = 56;

  (sale.items || []).forEach((item) => {
    let name = item.productName;
    if (name.length > 26) name = name.substring(0, 24) + "..";
    doc.setFont("courier", "bold");
    doc.text(name, 2, currentY);
    currentY += 3.5;

    doc.setFont("courier", "normal");
    const qtyLine = formatItemQuantityLine(item, dbProducts);
    doc.text(qtyLine, 4, currentY);
    doc.text(`$${formatPrice(item.totalPrice)}`, 78, currentY, { align: "right" });
    currentY += 4.5;
  });

  doc.line(2, currentY, 78, currentY);
  currentY += 4.5;

  // Totals (No IVA breakdown)
  doc.text(`TOTAL ARTICULOS: ${totalArticles}`, 2, currentY);
  currentY += 4.5;

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL:", 2, currentY);
  doc.text(`$${(Number(sale.total) || 0).toFixed(2)} MXN`, 78, currentY, { align: "right" });
  currentY += 5;

  doc.setFontSize(7.5);
  doc.line(2, currentY, 78, currentY);
  currentY += 4.5;

  // Payment
  doc.setFont("courier", "normal");
  doc.text("METODO PAGO:", 2, currentY);
  doc.text(sale.paymentMethod.toUpperCase(), 78, currentY, { align: "right" });
  currentY += 3.5;

  doc.text("PAGO CON:", 2, currentY);
  doc.text(`$${amountPaid.toFixed(2)} MXN`, 78, currentY, { align: "right" });
  currentY += 3.5;
  doc.text("CAMBIO:", 2, currentY);
  doc.text(`$${change.toFixed(2)} MXN`, 78, currentY, { align: "right" });
  currentY += 4.5;

  doc.line(2, currentY, 78, currentY);
  currentY += 4.5;

  // Footer
  doc.setFont("courier", "bold");
  doc.text("*** GRACIAS POR SU COMPRA ***", 40, currentY, { align: "center" });
  currentY += 3.5;
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text("Conserve este ticket para aclaraciones", 40, currentY, { align: "center" });

  doc.save(`${folio}.pdf`);
}
