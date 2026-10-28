import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
import { formatDateTime } from './Widgets';
import { useModalEscape } from '../../hooks/useModalEscape';

export function PrintReportModal({ isOpen, onClose, schema, records = [] }) {
  const modalRef = useRef(null);
  useModalEscape(onClose, isOpen, modalRef);
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen) return null;

  const totalHours = records.reduce((acc, r) => acc + (Number(r.duration_hours) || 0), 0);
  const verifiedCount = records.filter((r) => r.status === 'verified').length;
  const syncedCount = records.filter((r) => r.status === 'synced').length;
  const draftCount = records.filter((r) => r.status === 'draft').length;

  /**
   * Directly prints via an isolated hidden iframe.
   * Completely bypasses window.print() and prevents dark background colors,
   * browser URL headers, and web navigation scrollbars from leaking onto the paper.
   */
  const handlePrint = () => {
    setIsPrinting(true);
    const printableArea = modalRef.current?.querySelector('.report-export-unscaled');
    if (!printableArea) {
      setIsPrinting(false);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${schema?.title || 'Official Report'}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: #ffffff !important;
              color: #0f172a !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 11px;
              line-height: 1.4;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              text-align: left;
            }
            th {
              background-color: #f1f5f9 !important;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 10px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin: 12px 0;
            }
            .bg-slate-50 {
              background-color: #f8fafc !important;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 10px;
            }
            .font-mono {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }
            .font-bold {
              font-weight: bold;
            }
            .text-xl {
              font-size: 16px;
            }
            .text-sm {
              font-size: 12px;
            }
            .text-xs {
              font-size: 11px;
            }
            .text-blue-600 {
              color: #2563eb !important;
            }
            .text-emerald-600 {
              color: #059669 !important;
            }
            .text-amber-600 {
              color: #d97706 !important;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .border-b-2 {
              border-bottom: 2px solid #0f172a;
            }
            .pb-4 {
              padding-bottom: 12px;
            }
            .flex {
              display: flex;
            }
            .justify-between {
              justify-content: space-between;
            }
            .items-start {
              align-items: flex-start;
            }
            .gap-4 {
              gap: 12px;
            }
            .gap-12 {
              gap: 36px;
            }
            .pt-8 {
              padding-top: 24px;
            }
            .mt-8 {
              margin-top: 24px;
            }
            .border-t {
              border-top: 1px solid #cbd5e1;
            }
            .border-b {
              border-bottom: 1px solid #94a3b8;
            }
            .w-48 {
              width: 150px;
            }
            .space-y-6 > * + * {
              margin-top: 16px;
            }
            .rounded {
              border-radius: 4px;
            }
            .px-2 {
              padding-left: 6px;
              padding-right: 6px;
            }
            .py-0\\.5 {
              padding-top: 2px;
              padding-bottom: 2px;
            }
          </style>
        </head>
        <body>
          ${printableArea.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error('Error invoking iframe print in PrintReportModal:', e);
        }
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch (_) {}
          setIsPrinting(false);
        }, 1000);
      }, 100);
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-report-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Toolbar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-600" />
            <h3 id="print-report-modal-title" className="font-bold text-slate-800 text-sm">
              Official Executive Slip & Report Preview
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing Print...</span>
                </>
              ) : (
                <>
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Close (Esc)"
              aria-label="Close modal"
            >
              <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-200/80 text-slate-600 border border-slate-300">
                Esc
              </span>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Canvas (Strictly isolated from user UI font scaling) */}
        <div className="report-export-unscaled p-8 overflow-y-auto flex-1 space-y-6 text-slate-800 font-sans print:p-0 print:space-y-4" style={{ fontSize: '12px' }}>
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <div className="text-xl font-black text-slate-900 tracking-tight uppercase">
                Apex Global Enterprises
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {schema.title || 'Official Attendance & Roster Slip'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Model: <code className="font-mono text-slate-700">{schema.model}</code>
              </div>
            </div>

            <div className="text-right text-xs space-y-0.5">
              <div className="font-semibold text-slate-800">Generated: {new Date().toLocaleDateString()}</div>
              <div className="text-slate-500 font-mono">Reference: ATT-{new Date().getFullYear()}-009</div>
              <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px] mt-1">
                CONFIDENTIAL AUDIT
              </span>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] uppercase font-bold text-slate-500">Total Shifts</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {records.length}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] uppercase font-bold text-slate-500">Total Hours</div>
              <div className="text-xl font-bold font-mono text-blue-600 mt-0.5">
                {totalHours.toFixed(1)} hrs
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] uppercase font-bold text-slate-500">Verified & Synced</div>
              <div className="text-xl font-bold font-mono text-emerald-600 mt-0.5">
                {verifiedCount + syncedCount}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] uppercase font-bold text-slate-500">Draft / Pending</div>
              <div className="text-xl font-bold font-mono text-amber-600 mt-0.5">
                {draftCount}
              </div>
            </div>
          </div>

          {/* Table Breakdown */}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 uppercase">
                <th className="py-2.5 px-3">Record Code</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Check In</th>
                <th className="py-2.5 px-3">Check Out</th>
                <th className="py-2.5 px-3 text-right">Hours</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-3 font-mono font-medium text-slate-500">{r.code || `ATT-${r.id}`}</td>
                  <td className="py-2 px-3 font-semibold text-slate-900">{r.employee_name}</td>
                  <td className="py-2 px-3 text-slate-700">{r.department}</td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    {r.check_in ? formatDateTime(r.check_in) : '—'}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    {r.check_out ? formatDateTime(r.check_out) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                    {r.duration_hours || 0}h
                  </td>
                  <td className="py-2 px-3 text-center uppercase font-bold text-[10px]">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        r.status === 'synced'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'verified'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                <td colSpan={5} className="py-2.5 px-3 uppercase text-slate-700">
                  Total Summary
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-blue-600">
                  {totalHours.toFixed(1)} hrs
                </td>
                <td className="py-2.5 px-3 text-center text-slate-500">
                  {records.length} shifts
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-12 text-xs">
            <div>
              <div className="text-slate-400 font-semibold uppercase text-[10px]">Prepared By:</div>
              <div className="mt-8 border-b border-slate-300 w-48" />
              <div className="text-slate-700 font-medium mt-1">Sarah Jenkins (HR Lead)</div>
            </div>
            <div className="text-right flex flex-col items-end">
              <div className="text-slate-400 font-semibold uppercase text-[10px]">
                Authorized Approval:
              </div>
              <div className="mt-8 border-b border-slate-300 w-48" />
              <div className="text-slate-700 font-medium mt-1">Alexander Hayes (VP Operations)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
