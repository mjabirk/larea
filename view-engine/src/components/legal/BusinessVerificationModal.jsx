import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X } from 'lucide-react';
import { BUSINESS_DETAILS } from './legalPolicies';
import { useTenancy } from '../../context/TenancyContext';
import { useModalEscape } from '../../hooks/useModalEscape';

export function BusinessVerificationModal({ isOpen, onClose }) {
  const modalRef = useRef(null);
  const { currentOrganization, userBranchesInCurrentOrg } = useTenancy();

  useModalEscape(onClose, isOpen, modalRef);

  if (!isOpen) return null;

  const companyName =
    currentOrganization?.legal_name ||
    currentOrganization?.name ||
    BUSINESS_DETAILS.legalEntityName;
  const regNumber =
    currentOrganization?.registration_number ||
    currentOrganization?.cr_number ||
    '—';
  const currency = currentOrganization?.currency || 'QAR';
  const timezone = currentOrganization?.timezone || 'Asia/Qatar';
  const branchCount = Array.isArray(userBranchesInCurrentOrg)
    ? userBranchesInCurrentOrg.length
    : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-details-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col my-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <Building2 className="w-4 h-4" />
            </div>
            <h3
              id="company-details-title"
              className="font-semibold text-sm text-slate-900 dark:text-white"
            >
              Company Details
            </h3>
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

        {/* Body */}
        <div className="p-5 space-y-3 text-xs divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Company Name</span>
            <strong className="text-slate-900 dark:text-white text-right">
              {companyName}
            </strong>
          </div>

          <div className="pt-3 flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">
              Registration No.
            </span>
            <span className="font-mono font-medium text-slate-900 dark:text-white">
              {regNumber}
            </span>
          </div>

          <div className="pt-3 flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Currency</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {currency}
            </span>
          </div>

          <div className="pt-3 flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Timezone</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {timezone}
            </span>
          </div>

          {branchCount > 0 && (
            <div className="pt-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Branches</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {branchCount}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-medium cursor-pointer transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
