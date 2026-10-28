import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Lock,
  RotateCcw,
  Cookie,
  X,
  Search,
} from 'lucide-react';
import { LEGAL_POLICIES, BUSINESS_DETAILS } from './legalPolicies';
import { useTenancy } from '../../context/TenancyContext';
import { useModalEscape } from '../../hooks/useModalEscape';

export function LegalPolicyModal({ isOpen, onClose, initialPolicy = 'privacy' }) {
  const [activePolicyId, setActivePolicyId] = useState(initialPolicy);
  const [searchQuery, setSearchQuery] = useState('');
  const modalRef = useRef(null);
  const { currentOrganization } = useTenancy();

  useEffect(() => {
    if (initialPolicy) {
      setActivePolicyId(initialPolicy);
    }
  }, [initialPolicy]);

  useModalEscape(onClose, isOpen, modalRef);

  if (!isOpen) return null;

  const currentPolicy = LEGAL_POLICIES[activePolicyId] || LEGAL_POLICIES.privacy;
  const companyName =
    currentOrganization?.legal_name ||
    currentOrganization?.name ||
    BUSINESS_DETAILS.legalEntityName;

  const filteredSections = searchQuery
    ? currentPolicy.sections.filter(
        (sec) =>
          sec.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sec.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : currentPolicy.sections;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-policy-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 my-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="legal-policy-modal-title"
                className="font-semibold text-sm text-slate-900 dark:text-white"
              >
                Terms &amp; Privacy
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {companyName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1.5 py-2">
            {[
              { id: 'privacy', label: 'Privacy', icon: Lock },
              { id: 'terms', label: 'Terms of Use', icon: FileText },
              { id: 'refund', label: 'Billing', icon: RotateCcw },
              { id: 'cookie', label: 'Cookies', icon: Cookie },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePolicyId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePolicyId(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white'
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

          <div className="relative w-44 hidden sm:block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-6 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs leading-relaxed">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {currentPolicy.title}
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              {currentPolicy.summary}
            </p>
          </div>

          <div className="space-y-3">
            {filteredSections.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                No matching sections found.
              </div>
            ) : (
              filteredSections.map((sec, idx) => (
                <div
                  key={idx}
                  className="space-y-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/20"
                >
                  <h4 className="font-semibold text-xs text-slate-900 dark:text-white">
                    {sec.heading}
                  </h4>
                  <div className="text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {sec.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end text-xs shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
