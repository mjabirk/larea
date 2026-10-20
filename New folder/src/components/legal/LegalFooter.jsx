import React from 'react';
import {
  ShieldCheck,
  Building2,
  Lock,
  FileText,
  RotateCcw,
  Cookie,
  SlidersHorizontal,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { BUSINESS_DETAILS } from './legalPolicies';
import { reopenCookieConsentBanner } from './CookieConsentBanner';
import { useTenancy } from '../../context/TenancyContext';

export function LegalFooter({ onOpenPolicy, onOpenBusinessDetails }) {
  const { currentOrganization } = useTenancy();
  const companyName = currentOrganization?.legal_name || BUSINESS_DETAILS.legalEntityName;
  const taxNumber = currentOrganization?.tax_id || BUSINESS_DETAILS.taxNumber;

  return (
    <footer
      role="contentinfo"
      aria-label="Enterprise Legal and Compliance Footer"
      className="bg-slate-900 text-slate-300 border-t border-slate-800 px-4 sm:px-6 py-6 text-xs select-none transition-colors"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Entity & Jurisdiction Badge */}
        <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <button
            type="button"
            onClick={onOpenBusinessDetails}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white transition cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Click to view Verified Business Registration Details"
          >
            <div className="w-6 h-6 rounded bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/40 group-hover:scale-105 transition-transform">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-left rtl:text-right">
              <span className="font-semibold text-slate-100 block text-xs group-hover:text-blue-400 transition">
                {companyName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono block">
                Tax/CR ID: {taxNumber}
              </span>
            </div>
          </button>

          <div className="hidden sm:block h-6 w-[1px] bg-slate-800" />

          {/* WCAG 2.1 AA & ISO Badge */}
          <div className="inline-flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-400 font-mono font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              WCAG 2.1 AA
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-blue-400 font-mono font-medium">
              ISO 27001
            </span>
          </div>
        </div>

        {/* Right: Statutory Policies Navigation & Cookie Manager */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => onOpenPolicy('privacy')}
            className="text-slate-300 hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Privacy Policy
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            type="button"
            onClick={() => onOpenPolicy('terms')}
            className="text-slate-300 hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Terms of Service
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            type="button"
            onClick={() => onOpenPolicy('refund')}
            className="text-slate-300 hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Refund Policy
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            type="button"
            onClick={() => onOpenPolicy('cookie')}
            className="text-slate-300 hover:text-white hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Cookie Policy
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          {/* Granular Cookie Re-opener */}
          <button
            type="button"
            onClick={reopenCookieConsentBanner}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 hover:border-slate-600 transition cursor-pointer text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Adjust your granular cookies & storage preferences"
          >
            <Cookie className="w-3 h-3 text-blue-400" />
            <span>Cookie Preferences</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
