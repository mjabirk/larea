import React, { useState, useRef, useEffect } from 'react';
import {
    Printer,
    Download,
    FileText,
    Ruler,
    Layers,
    Building2,
    X,
    FileSpreadsheet,
    CheckCircle2,
    Eye,
    Mail,
    MessageCircle,
    Loader2,
} from 'lucide-react';
import { useModalEscape } from '../../hooks/useModalEscape';

export function PrintDocumentModal({
    isOpen,
    onClose,
    batch,
    payslip = null,
    totalEmployees = 0,
    getAuthHeaders,
    onOpenEmail = null,
    onOpenMessage = null,
}) {
    const modalRef = useRef(null);
    useModalEscape(onClose, isOpen, modalRef);

    const [selectedMode, setSelectedMode] = useState('blank'); // 'blank' | 'letterhead'
    const [isPrinting, setIsPrinting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPrintingRegister, setIsPrintingRegister] = useState(false);
    const [isDownloadingRegister, setIsDownloadingRegister] = useState(false);
    const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Read initial default mode from localStorage if configured
    useEffect(() => {
        try {
            const savedFmt = localStorage.getItem('larea_paper_format');
            if (savedFmt) {
                const parsed = JSON.parse(savedFmt);
                if (parsed.default_mode) {
                    setSelectedMode(parsed.default_mode);
                }
            }
        } catch (_) {}
    }, []);

    // Clean up preview Blob URL on unmount or when mode changes
    useEffect(() => {
        return () => {
            if (previewBlobUrl) {
                URL.revokeObjectURL(previewBlobUrl);
            }
        };
    }, [previewBlobUrl]);

    if (!isOpen || !batch) return null;

    const batchMonth = batch.salary_year_month || 'CURRENT';
    const isSingle = Boolean(payslip);

    const targetTitle = isSingle
        ? `Payslip: ${payslip.employee_name}`
        : `All Payslips (${totalEmployees || batch.total_employees || 0} employees in batch ${batch.batch_code})`;

    const targetSubtitle = isSingle
        ? `ID: ${payslip.employee_number || 'N/A'} • QID: ${payslip.national_id_number || 'N/A'} • Net: ${Number(payslip.net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`
        : `Payroll Period: ${batchMonth} • Net Total: ${Number(batch.total_net_salary || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} QAR`;

    const getPayslipPdfUrl = () => {
        let base = `/api/v1/payroll/batches/${batch.id}/payslips/pdf?mode=${selectedMode}`;
        if (isSingle && payslip.id) {
            base += `&payslip_id=${encodeURIComponent(payslip.id)}`;
        }
        return base;
    };

    const getRegisterPdfUrl = () => {
        return `/api/v1/payroll/batches/${batch.id}/salary-register/pdf?mode=${selectedMode}`;
    };

    const getPayslipFilename = () => {
        if (isSingle) {
            return `Payslip_${batchMonth}_${payslip.employee_number || 'EMP'}.pdf`;
        }
        return `Batch_Booklet_${batchMonth}.pdf`;
    };

    const getRegisterFilename = () => {
        return `Salary_Register_${batchMonth}.pdf`;
    };

    /**
     * Prints a vector PDF directly via an invisible iframe.
     * Triggers the native system print dialog targeted exclusively to the PDF,
     * eliminating browser URLs, web dark themes, and navigation headers.
     */
    const triggerIframePrint = async (url, setBusyState) => {
        setBusyState(true);
        try {
            const res = await fetch(url, {
                headers: getAuthHeaders ? getAuthHeaders() : {},
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.detail || 'Failed to generate vector PDF');
            }

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.src = blobUrl;
            document.body.appendChild(iframe);

            iframe.onload = () => {
                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    } catch (e) {
                        console.error('Iframe print error, falling back to window.open:', e);
                        window.open(blobUrl, '_blank');
                    }
                    setTimeout(() => {
                        try {
                            document.body.removeChild(iframe);
                        } catch (_) {}
                        URL.revokeObjectURL(blobUrl);
                    }, 60000);
                }, 150);
            };
        } catch (err) {
            console.error('Print failure:', err);
            alert('Printing Error: ' + err.message);
        } finally {
            setBusyState(false);
        }
    };

    /**
     * Downloads the generated vector PDF directly to the user's computer.
     */
    const downloadPdf = async (url, filename, setBusyState) => {
        setBusyState(true);
        try {
            const res = await fetch(url, {
                headers: getAuthHeaders ? getAuthHeaders() : {},
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.detail || 'Failed to download vector PDF');
            }

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
            console.error('Download failure:', err);
            alert('Download Error: ' + err.message);
        } finally {
            setBusyState(false);
        }
    };

    const handlePrintPayslips = () => {
        triggerIframePrint(getPayslipPdfUrl(), setIsPrinting);
    };

    const handleDownloadPayslips = () => {
        downloadPdf(getPayslipPdfUrl(), getPayslipFilename(), setIsDownloading);
    };

    const handlePrintSalaryRegister = () => {
        triggerIframePrint(getRegisterPdfUrl(), setIsPrintingRegister);
    };

    const handleDownloadSalaryRegister = () => {
        downloadPdf(getRegisterPdfUrl(), getRegisterFilename(), setIsDownloadingRegister);
    };

    const handlePreviewInTab = async () => {
        setIsLoadingPreview(true);
        try {
            const res = await fetch(getPayslipPdfUrl(), {
                headers: getAuthHeaders ? getAuthHeaders() : {},
            });
            if (!res.ok) throw new Error('Failed to load preview');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (err) {
            alert('Preview error: ' + err.message);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-dialog-title"
            onClick={onClose}
        >
            <div
                ref={modalRef}
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                            <Printer className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 id="print-dialog-title" className="text-sm font-bold text-slate-900 dark:text-white">
                                Print & Export Vector Document
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Vector A4 ReportLab rendering • High-precision paper geometry
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Close (Esc)"
                    >
                        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            Esc
                        </span>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 text-xs">
                    {/* Target Summary Card */}
                    <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/70 dark:border-blue-800/40 flex items-center justify-between">
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                                Target Document:
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                {targetTitle}
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5 font-medium">
                                {targetSubtitle}
                            </p>
                        </div>

                        <div className="text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 shadow-2xs">
                                A4 PDF
                            </span>
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="space-y-2.5">
                        <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                            Select Output Stationery Mode:
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Option 1: Blank Paper */}
                            <label
                                className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                                    selectedMode === 'blank'
                                        ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-600 text-slate-900 dark:text-white shadow-xs'
                                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Building2 className={`w-4 h-4 ${selectedMode === 'blank' ? 'text-blue-600' : 'text-slate-400'}`} />
                                            <span className="font-bold text-xs">Print on Blank Paper</span>
                                        </div>
                                        <input
                                            type="radio"
                                            name="print_mode"
                                            value="blank"
                                            checked={selectedMode === 'blank'}
                                            onChange={() => setSelectedMode('blank')}
                                            className="w-4 h-4 text-blue-600 cursor-pointer"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Includes company logo, header details, and page footer.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                                    <span>Top: 15mm</span> • <span>Bottom: 15mm</span>
                                </div>
                            </label>

                            {/* Option 2: Pre-Printed Letterhead */}
                            <label
                                className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col justify-between transition-all ${
                                    selectedMode === 'letterhead'
                                        ? 'bg-amber-50/50 dark:bg-amber-900/20 border-amber-600 text-slate-900 dark:text-white shadow-xs'
                                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Ruler className={`w-4 h-4 ${selectedMode === 'letterhead' ? 'text-amber-600' : 'text-slate-400'}`} />
                                            <span className="font-bold text-xs">Pre-Printed Letterhead</span>
                                        </div>
                                        <input
                                            type="radio"
                                            name="print_mode"
                                            value="letterhead"
                                            checked={selectedMode === 'letterhead'}
                                            onChange={() => setSelectedMode('letterhead')}
                                            className="w-4 h-4 text-amber-600 cursor-pointer"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Omits logo & header; maintains 40mm top clearance calibrated for physical company letterhead stationery paper.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-mono font-semibold">
                                    <span>Top: 40mm (Header Safe)</span> • <span>Bottom: 25mm</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Primary Payslip Action Buttons */}
                    <div className="space-y-2 pt-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {isSingle ? 'Payslip Output Actions:' : 'Batch Booklet Output Actions:'}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={handlePrintPayslips}
                                disabled={isPrinting}
                                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition disabled:opacity-50"
                            >
                                {isPrinting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Opening Print Dialog...</span>
                                    </>
                                ) : (
                                    <>
                                        <Printer className="w-4 h-4" />
                                        <span>Print Now</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleDownloadPayslips}
                                disabled={isDownloading}
                                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                            >
                                {isDownloading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                        <span>Generating PDF...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4 text-blue-600" />
                                        <span>Download PDF</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Secondary Action: Salary Register (Landscape) */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                    <FileSpreadsheet className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="font-bold text-slate-900 dark:text-white text-xs">
                                        Batch Salary Register & Journal (Landscape A4)
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        12-column tabular report with grand totals row for accounting audits.
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handlePrintSalaryRegister}
                                    disabled={isPrintingRegister}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-50"
                                >
                                    {isPrintingRegister ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Printer className="w-3.5 h-3.5" />
                                    )}
                                    <span>Print Register</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDownloadSalaryRegister}
                                    disabled={isDownloadingRegister}
                                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition"
                                    title="Download Salary Register PDF"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Additional Options (Preview / Send) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={handlePreviewInTab}
                            disabled={isLoadingPreview}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Open PDF Preview in New Tab</span>
                        </button>

                        {isSingle && onOpenEmail && onOpenMessage && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onOpenEmail(payslip);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Email</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onOpenMessage(payslip);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>WhatsApp/SMS</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

