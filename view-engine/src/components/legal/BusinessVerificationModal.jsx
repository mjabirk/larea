import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  X,
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  FileCheck,
  CheckCircle,
  ExternalLink,
  Award,
} from 'lucide-react';
import { BUSINESS_DETAILS } from './legalPolicies';

export function BusinessVerificationModal({ isOpen, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biz-verify-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="biz-verify-title" className="font-bold text-sm text-slate-100">
                Verified Business Entity Information
              </h3>
              <p className="text-[11px] text-slate-400">
                Statutory corporate registration and compliance records
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close Business Details Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Official Verification Badge */}
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-600 text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                Verified Enterprise Entity
              </div>
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Regulated by {BUSINESS_DETAILS.regulatoryBody}
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="space-y-3.5 divide-y divide-slate-100 dark:divide-slate-800">
            {/* Entity Name */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Registered Legal Entity Name</span>
              <strong className="text-slate-900 dark:text-white text-right sm:text-left">{BUSINESS_DETAILS.legalEntityName}</strong>
            </div>

            {/* Commercial Registration & Tax / CR */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Commercial Reg. (CR) Number</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{BUSINESS_DETAILS.crNumber}</span>
            </div>

            {/* Tax / VAT Number */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Tax / VAT Identification</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{BUSINESS_DETAILS.taxNumber}</span>
            </div>

            {/* Jurisdiction */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Statutory Jurisdiction</span>
              <span className="font-semibold text-slate-900 dark:text-white">{BUSINESS_DETAILS.jurisdiction}</span>
            </div>

            {/* Registered Address */}
            <div className="pt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Registered Physical Address</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px]">
                {BUSINESS_DETAILS.registeredAddress}
              </div>
            </div>

            {/* Support & DPO Contacts */}
            <div className="pt-2 space-y-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium block">Official Compliance & Support Contacts</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 block text-[10px]">Support Desk</span>
                  <a href={`mailto:${BUSINESS_DETAILS.officialSupportContact}`} className="text-blue-600 dark:text-blue-400 font-mono hover:underline">
                    {BUSINESS_DETAILS.officialSupportContact}
                  </a>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 block text-[10px]">Data Protection Officer (DPO)</span>
                  <a href={`mailto:${BUSINESS_DETAILS.dpoContact}`} className="text-blue-600 dark:text-blue-400 font-mono hover:underline">
                    {BUSINESS_DETAILS.dpoContact}
                  </a>
                </div>
              </div>
            </div>

            {/* Compliance Certifications */}
            <div className="pt-2 space-y-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-medium block">Audited Compliance Frameworks</span>
              <div className="flex flex-wrap gap-1.5">
                {BUSINESS_DETAILS.complianceFrameworks.map((fw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-semibold"
                  >
                    <CheckCircle className="w-3 h-3 text-blue-600" />
                    <span>{fw}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
