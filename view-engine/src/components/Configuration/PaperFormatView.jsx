import React, { useState, useEffect, useCallback } from 'react';
import {
    FileText,
    Printer,
    Ruler,
    Save,
    CheckCircle2,
    AlertCircle,
    Building2,
    Upload,
    Download,
    Eye,
    Layers,
    FileCheck,
    HelpCircle,
    Sparkles,
    Check,
    Image as ImageIcon,
    Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function PaperFormatView() {
    const { getAuthHeaders } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [statusBanner, setStatusBanner] = useState(null);

    const [formData, setFormData] = useState({
        // a) Page Geometry
        page_size: 'A4',
        default_orientation: 'portrait',
        default_mode: 'blank', // 'blank' | 'letterhead'

        // b) Letterhead Stationery Spacing
        letterhead_top_margin_mm: 40,
        letterhead_bottom_margin_mm: 25,
        top_margin_mm: 15,
        bottom_margin_mm: 15,

        // c) Company Header Elements (For Blank Paper)
        logo_url: '',
        company_name: 'Larea Industrial & Contracting W.L.L.',
        company_name_ar: 'شركة لاريا للصناعة والمقاولات ذ.م.م',
        cr_number: 'QA-3849102-CR',
        tax_id: 'VAT-100293848',
        wps_establishment_id: '10293847',
        header_layout: 'left_logo_right_details', // 'left_logo_right_details' | 'centered' | 'minimal'

        // d) Company Footer Elements (For Blank Paper)
        address: 'Tower 4, West Bay Financial District, P.O. Box 24891, Doha, Qatar',
        po_box: 'P.O. Box 24891',
        email: 'support@larea.qa',
        phone: '+974 4499 8000',
        display_page_numbers: true,
        include_security_watermark: true,
    });

    const fetchConfig = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/system/paper-format', {
                headers: getAuthHeaders ? getAuthHeaders() : {},
            });
            if (res.ok) {
                const data = await res.json();
                if (data.config) {
                    setFormData((prev) => ({
                        ...prev,
                        ...data.config,
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to load paper format settings:', err);
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setIsSaving(true);
        setStatusBanner(null);
        try {
            const mmToPt = 72.0 / 25.4;
            const payload = {
                ...formData,
                letterhead_top_margin_pt: Math.round(Number(formData.letterhead_top_margin_mm || 40) * mmToPt),
                letterhead_bottom_margin_pt: Math.round(Number(formData.letterhead_bottom_margin_mm || 25) * mmToPt),
                top_margin_pt: Math.round(Number(formData.top_margin_mm || 15) * mmToPt),
                bottom_margin_pt: Math.round(Number(formData.bottom_margin_mm || 15) * mmToPt),
                left_margin_pt: 42,
                right_margin_pt: 42,
            };

            const res = await fetch('/api/v1/system/paper-format', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(getAuthHeaders ? getAuthHeaders() : {}),
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to save paper format settings');
            }

            try {
                localStorage.setItem('larea_paper_format', JSON.stringify(payload));
            } catch (_) {}

            setStatusBanner({
                type: 'success',
                message: 'Paper and document layout configuration saved successfully.',
            });
            setTimeout(() => setStatusBanner(null), 5000);
        } catch (err) {
            console.error(err);
            setStatusBanner({
                type: 'error',
                message: err.message || 'Error saving layout configuration.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateAlignmentTest = async () => {
        setIsGeneratingTest(true);
        try {
            const res = await fetch('/api/v1/system/paper-format/test-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(getAuthHeaders ? getAuthHeaders() : {}),
                },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                throw new Error('Failed to generate alignment test PDF');
            }

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
        } catch (err) {
            console.error(err);
            alert('Failed to generate alignment test sheet: ' + err.message);
        } finally {
            setIsGeneratingTest(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('Logo file size must be less than 2MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            setFormData((prev) => ({
                ...prev,
                logo_url: event.target?.result || '',
            }));
        };
        reader.readAsDataURL(file);
    };

    // Calculate visual diagram proportions based on A4 height (297mm)
    const topSpacing = Number(formData.letterhead_top_margin_mm) || 40;
    const bottomSpacing = Number(formData.letterhead_bottom_margin_mm) || 25;
    const topPct = Math.min(Math.max((topSpacing / 297) * 100, 8), 35);
    const bottomPct = Math.min(Math.max((bottomSpacing / 297) * 100, 6), 25);
    const bodyPct = 100 - topPct - bottomPct;

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-12">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                    <div className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
                        <Layers className="w-4 h-4" />
                        <span>Corporate Stationery & Print Geometry</span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        Paper & Document Layout
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Configure page sizes, letterhead spacing boundaries, vector branding headers, and stationery margins.
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleGenerateAlignmentTest}
                        disabled={isGeneratingTest}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs disabled:opacity-50"
                        title="Download a 10mm grid sheet to physically test stationery alignment"
                    >
                        <Printer className="w-4 h-4 text-slate-500" />
                        <span>{isGeneratingTest ? 'Generating Grid...' : 'Alignment Test PDF'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
                    </button>
                </div>
            </div>

            {/* Notification Banner */}
            {statusBanner && (
                <div
                    className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                        statusBanner.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                    }`}
                >
                    {statusBanner.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{statusBanner.message}</span>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* ========================================================= */}
                {/* A) PAGE GEOMETRY & PRINTING MODE                          */}
                {/* ========================================================= */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                <FileText className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                    Page Geometry & Default Output Mode
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Standard physical paper dimensions and output rendering mode.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Paper Size
                            </label>
                            <select
                                value={formData.page_size}
                                onChange={(e) => setFormData({ ...formData, page_size: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                            >
                                <option value="A4">A4 (210 × 297 mm)</option>
                                <option value="Letter">US Letter (8.5 × 11 in)</option>
                                <option value="Legal">Legal (8.5 × 14 in)</option>
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">Standard A4 page size.</p>
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Default Orientation
                            </label>
                            <select
                                value={formData.default_orientation}
                                onChange={(e) => setFormData({ ...formData, default_orientation: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
                            >
                                <option value="portrait">Portrait (Vertical)</option>
                                <option value="landscape">Landscape (Horizontal)</option>
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">Payslips use Portrait; Registers use Landscape.</p>
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Default Printing Mode
                            </label>
                            <div className="space-y-2 pt-0.5">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="default_mode"
                                        value="blank"
                                        checked={formData.default_mode === 'blank'}
                                        onChange={() => setFormData({ ...formData, default_mode: 'blank' })}
                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                                        Blank Paper (Full Header & Footer)
                                    </span>
                                </label>
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="default_mode"
                                        value="letterhead"
                                        checked={formData.default_mode === 'letterhead'}
                                        onChange={() => setFormData({ ...formData, default_mode: 'letterhead' })}
                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                                        Pre-Printed Letterhead (Suppress Header/Footer)
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* B) LETTERHEAD STATIONERY SPACING & VISUAL DIAGRAM         */}
                {/* ========================================================= */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                <Ruler className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                    Letterhead Stationery Spacing & Content Boundary
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Defines where pre-printed stationery ends and generated ERP content begins.
                                </p>
                            </div>
                        </div>

                        <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Dynamic Spacing Active
                        </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Spacing Inputs */}
                        <div className="lg:col-span-7 space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="font-semibold text-slate-800 dark:text-slate-200">
                                            Letterhead Top Spacing
                                        </label>
                                        <span className="text-[10px] font-mono text-red-500 font-bold">
                                            ~{Math.round(topSpacing * 2.83465)} pt
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="10"
                                            max="120"
                                            step="1"
                                            value={formData.letterhead_top_margin_mm}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    letterhead_top_margin_mm: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold"
                                        />
                                        <span className="text-slate-500 font-semibold">mm</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Height of company logo & pre-printed header stationery (default: 40 mm).
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="font-semibold text-slate-800 dark:text-slate-200">
                                            Letterhead Bottom Spacing
                                        </label>
                                        <span className="text-[10px] font-mono text-amber-500 font-bold">
                                            ~{Math.round(bottomSpacing * 2.83465)} pt
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="10"
                                            max="80"
                                            step="1"
                                            value={formData.letterhead_bottom_margin_mm}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    letterhead_bottom_margin_mm: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold"
                                        />
                                        <span className="text-slate-500 font-semibold">mm</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Height of company pre-printed footer lines/address (default: 25 mm).
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 text-slate-700 dark:text-slate-300 space-y-2 text-xs">
                                <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-300">
                                    <HelpCircle className="w-4 h-4 shrink-0" />
                                    <span>How Letterhead Mode Works in Larea ERP</span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                    When printing on pre-printed company stationery, the header and footer are hidden automatically. Content starts at <strong>{topSpacing} mm</strong> from the top edge and stops at <strong>{bottomSpacing} mm</strong> from the bottom edge.
                                </p>
                            </div>
                        </div>

                        {/* Visual Interactive Diagram */}
                        <div className="lg:col-span-5 flex flex-col items-center justify-center p-5 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                                Live A4 Paper Stationery Simulation
                            </div>

                            {/* A4 Sheet Mockup */}
                            <div className="relative w-48 h-64 bg-white dark:bg-slate-900 rounded-lg shadow-md border-2 border-slate-300 dark:border-slate-700 overflow-hidden flex flex-col transition-all">
                                {/* Top Zone (Stationery Header) */}
                                <div
                                    style={{ height: `${topPct}%` }}
                                    className="bg-red-500/15 border-b-2 border-dashed border-red-500 flex flex-col items-center justify-center text-center px-1 transition-all"
                                >
                                    <span className="text-[9px] font-bold text-red-600 dark:text-red-400 leading-tight">
                                        Stationery Header
                                    </span>
                                    <span className="text-[8px] font-mono text-red-500">
                                        {topSpacing} mm
                                    </span>
                                </div>

                                {/* Body Zone (ERP Content) */}
                                <div
                                    style={{ height: `${bodyPct}%` }}
                                    className="flex-1 p-2 flex flex-col justify-between overflow-hidden bg-slate-50/40 dark:bg-slate-800/20"
                                >
                                    <div className="space-y-1">
                                        <div className="h-1.5 w-16 bg-slate-300 dark:bg-slate-700 rounded-full" />
                                        <div className="h-1 w-28 bg-slate-200 dark:bg-slate-700/60 rounded-full" />
                                        <div className="h-1 w-24 bg-slate-200 dark:bg-slate-700/60 rounded-full" />
                                    </div>

                                    <div className="my-auto text-center py-1">
                                        <span className="text-[8.5px] font-semibold text-slate-600 dark:text-slate-300 block">
                                            ERP Payslip Content
                                        </span>
                                        <span className="text-[7.5px] text-slate-400 block font-mono">
                                            ({Math.round(297 - topSpacing - bottomSpacing)} mm body)
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="h-1 w-full bg-slate-200 dark:bg-slate-700/60 rounded-full" />
                                        <div className="h-1 w-20 bg-slate-200 dark:bg-slate-700/60 rounded-full" />
                                    </div>
                                </div>

                                {/* Bottom Zone (Stationery Footer) */}
                                <div
                                    style={{ height: `${bottomPct}%` }}
                                    className="bg-amber-500/15 border-t-2 border-dashed border-amber-500 flex flex-col items-center justify-center text-center px-1 transition-all"
                                >
                                    <span className="text-[8px] font-mono text-amber-600 dark:text-amber-400">
                                        {bottomSpacing} mm
                                    </span>
                                    <span className="text-[8.5px] font-bold text-amber-700 dark:text-amber-400 leading-tight">
                                        Stationery Footer
                                    </span>
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-400 mt-3 text-center">
                                Red & amber shaded zones are preserved for physical letterhead.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* C) COMPANY HEADER ELEMENTS (FOR BLANK PAPER)              */}
                {/* ========================================================= */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                                <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                    Company Header Elements (For Blank Paper Mode)
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Displays company logo and registration details when printing on blank paper.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        {/* Company Logo Upload & URL */}
                        <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-4">
                            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center bg-white dark:bg-slate-900 overflow-hidden shrink-0">
                                {formData.logo_url ? (
                                    <img
                                        src={formData.logo_url}
                                        alt="Logo Preview"
                                        className="w-full h-full object-contain p-1"
                                    />
                                ) : (
                                    <ImageIcon className="w-7 h-7 text-slate-400" />
                                )}
                            </div>

                            <div className="flex-1 w-full space-y-2">
                                <label className="block font-semibold text-slate-800 dark:text-slate-200">
                                    Company Logo (PNG, SVG, or JPEG)
                                </label>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="https://... or upload local image file"
                                        value={formData.logo_url}
                                        onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs"
                                    />
                                    <label className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                                        <Upload className="w-3.5 h-3.5" />
                                        <span>Upload File</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                    </label>
                                    {formData.logo_url && (
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, logo_url: '' })}
                                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                            title="Remove Logo"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Organization Name (English) *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.company_name}
                                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Organization Name (Arabic) *
                            </label>
                            <input
                                type="text"
                                dir="rtl"
                                value={formData.company_name_ar}
                                onChange={(e) => setFormData({ ...formData, company_name_ar: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Commercial Registration (CR) Number *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.cr_number}
                                onChange={(e) => setFormData({ ...formData, cr_number: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white font-medium"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Company / Tax ID
                            </label>
                            <input
                                type="text"
                                value={formData.wps_establishment_id}
                                onChange={(e) => setFormData({ ...formData, wps_establishment_id: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white font-medium"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                Header Alignment Layout
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { id: 'left_logo_right_details', label: 'Left Logo / Right Details', desc: 'Standard executive layout' },
                                    { id: 'centered', label: 'Centered Branding', desc: 'Symmetric formal header' },
                                    { id: 'minimal', label: 'Minimal Streamlined', desc: 'Compact single-line header' },
                                ].map((layout) => (
                                    <label
                                        key={layout.id}
                                        className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                                            formData.header_layout === layout.id
                                                ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-500 text-blue-900 dark:text-blue-100'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-xs">{layout.label}</span>
                                            <input
                                                type="radio"
                                                name="header_layout"
                                                value={layout.id}
                                                checked={formData.header_layout === layout.id}
                                                onChange={() => setFormData({ ...formData, header_layout: layout.id })}
                                                className="w-3.5 h-3.5 text-blue-600 cursor-pointer"
                                            />
                                        </div>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{layout.desc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* D) COMPANY FOOTER ELEMENTS (FOR BLANK PAPER)              */}
                {/* ========================================================= */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                                <FileCheck className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                    Company Footer Elements
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Footer address, contact details, and page numbering options.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="md:col-span-2">
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Registered Corporate Address Line
                            </label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Official Contact Email
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Telephone / Official Support Number
                            </label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>

                        <div className="md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <div>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                        Display Page Numbers (Page X of Y)
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                        Appends two-pass dynamic page counters to footers.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.display_page_numbers}
                                    onChange={(e) =>
                                        setFormData({ ...formData, display_page_numbers: e.target.checked })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                />
                            </label>

                            <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <div>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                        Include Audit Trace & Security Watermark
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                        Embeds confidential notice and timestamp verification in blank paper mode.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.include_security_watermark}
                                    onChange={(e) =>
                                        setFormData({ ...formData, include_security_watermark: e.target.checked })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleGenerateAlignmentTest}
                        disabled={isGeneratingTest}
                        className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                        <Printer className="w-4 h-4 text-slate-500" />
                        <span>{isGeneratingTest ? 'Generating Test...' : 'Generate Alignment Test PDF'}</span>
                    </button>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving Configuration...' : 'Save Paper & Document Layout'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
}
