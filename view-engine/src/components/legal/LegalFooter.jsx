import React from 'react';
import { BUSINESS_DETAILS } from './legalPolicies';
import { reopenCookieConsentBanner } from './CookieConsentBanner';
import { useTenancy } from '../../context/TenancyContext';

export function LegalFooter({ onOpenPolicy, onOpenBusinessDetails, onOpenBusinessModal }) {
  const { currentOrganization } = useTenancy();
  const companyName = currentOrganization?.legal_name || BUSINESS_DETAILS.legalEntityName;
  const handleBusinessClick = onOpenBusinessDetails || onOpenBusinessModal;

  return (
    <footer
      role="contentinfo"
      aria-label="Footer"
      className="border-t border-slate-200/70 dark:border-slate-800/70 px-4 sm:px-6 py-4 text-xs text-slate-500 dark:text-slate-400 select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBusinessClick}
          className="font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
        >
          © {new Date().getFullYear()} {companyName}
        </button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <button
            type="button"
            onClick={() => onOpenPolicy?.('privacy')}
            className="hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={() => onOpenPolicy?.('terms')}
            className="hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
          >
            Terms
          </button>
          <button
            type="button"
            onClick={reopenCookieConsentBanner}
            className="hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
          >
            Cookies
          </button>
        </div>
      </div>
    </footer>
  );
}
