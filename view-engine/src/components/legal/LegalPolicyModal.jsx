import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  FileText,
  Lock,
  RotateCcw,
  Cookie,
  Building2,
  X,
  Search,
  Printer,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { LEGAL_POLICIES, BUSINESS_DETAILS } from './legalPolicies';
import { useModalEscape } from '../../hooks/useModalEscape';

export function LegalPolicyModal({ isOpen, onClose, initialPolicy = 'privacy' }) {
  const [activePolicyId, setActivePolicyId] = useState(initialPolicy);
  const [searchQuery, setSearchQuery] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    if (initialPolicy) {
      setActivePolicyId(initialPolicy);
    }
  }, [initialPolicy]);

  // Keyboard navigation & accessible focus trapping via useModalEscape
  useModalEscape(onClose, isOpen, modalRef);

  if (!isOpen) return null;

  const currentPolicy = LEGAL_POLICIES[activePolicyId] || LEGAL_POLICIES.privacy;

  const filteredSections = searchQuery
    ? currentPolicy.sections.filter(
      (sec) =>
        sec.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sec.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : currentPolicy.sections;

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-policy-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="legal-policy-modal-title" className="font-bold text-base text-slate-100 tracking-tight">
                  Enterprise Statutory Document Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono text-[10px] font-semibold">
                  Verified Legal Registry
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Official statutory policies of {BUSINESS_DETAILS.legalEntityName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Close Statutory Document Viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation for Statutory Documents */}
        <div className="px-6 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-2 py-2">
            {[
              { id: 'privacy', label: 'Privacy Policy', icon: Lock },
              { id: 'terms', label: 'Terms of Service', icon: FileText },
              { id: 'refund', label: 'Refund Policy', icon: RotateCcw },
              { id: 'cookie', label: 'Cookie Policy', icon: Cookie },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePolicyId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePolicyId(tab.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
                    }`}
                  aria-pressed={isActive}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 py-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              title="Print Statutory Policy"
              aria-label="Print Current Policy"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Document</span>
            </button>
          </div>
        </div>

        {/* Search Bar within Policy */}
        <div className="px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search within ${currentPolicy.title}...`}
              className="w-full pl-9 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label={`Search inside ${currentPolicy.title}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
            Version: <strong className="text-slate-800 dark:text-slate-200">{currentPolicy.version}</strong> • Eff: {currentPolicy.effectiveDate}
          </div>
        </div>

        {/* Scrollable Policy Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs leading-relaxed printable-report">
          {/* Statutory Document Summary Header */}
          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-900/60 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-blue-950 dark:text-blue-200">
                {currentPolicy.title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Statutorily Compliant
              </span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              {currentPolicy.summary}
            </p>
          </div>

          {/* Policy Sections */}
          <div className="space-y-6">
            {filteredSections.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                No clauses found matching "{searchQuery}".
              </div>
            ) : (
              filteredSections.map((sec, idx) => (
                <div
                  key={idx}
                  className="space-y-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/30 hover:border-slate-300 transition"
                >
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    <span>{sec.heading}</span>
                  </h4>
                  <div className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                    {sec.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Verified Business Details Footer Block */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Verified Entity & Statutory Governance</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-600 dark:text-slate-300">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Registered Entity:</span>
                <strong className="text-slate-900 dark:text-white">{BUSINESS_DETAILS.legalEntityName}</strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Commercial Reg & Tax / VAT:</span>
                <span className="font-mono text-slate-900 dark:text-white">{BUSINESS_DETAILS.crNumber} • {BUSINESS_DETAILS.taxNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Registered Physical Address:</span>
                <span>{BUSINESS_DETAILS.registeredAddress}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Data Protection Officer (DPO):</span>
                <a href={`mailto:${BUSINESS_DETAILS.dpoContact}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono">
                  {BUSINESS_DETAILS.dpoContact}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Governed under {BUSINESS_DETAILS.jurisdiction} • ISO 27001 Certified
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
