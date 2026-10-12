import React from 'react';
import { Building2, MapPin, Globe, Shield, Network, DollarSign } from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';

export function OrganizationsView() {
  const { organizations, branches } = useTenancy();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 56px Control Panel */}
      <div className="h-14 min-h-[56px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Security & IAM</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              Organizations & Operating Branches
            </span>
          </div>
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {organizations.length} Organizations • {branches.length} Branches
          </span>
        </div>
      </div>

      {/* Organizations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {organizations.map((org) => {
          const orgBranches = branches.filter((b) => b.organization_id === org.id);

          return (
            <div
              key={org.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5"
            >
              {/* Org Header */}
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    {org.legal_name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                      {org.legal_name}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Tax ID / CR: <strong className="text-slate-600 dark:text-slate-300">{org.tax_id}</strong>
                    </p>
                  </div>
                </div>

                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {org.base_currency}
                </span>
              </div>

              {/* Org Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 block">Default Timezone</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{org.default_timezone}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 block">Default Locale</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{org.default_locale || 'en'}</span>
                </div>
              </div>

              {/* Operating Branches List */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Operating Branches ({orgBranches.length})
                </div>

                <div className="space-y-2">
                  {orgBranches.map((branch) => (
                    <div
                      key={branch.id}
                      className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {branch.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {branch.city} • Code: {branch.code}
                        </div>
                      </div>

                      <div className="text-right font-mono text-[11px]">
                        <span className="text-slate-400 block text-[10px]">IP Subnet Allowlist</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {branch.ip_allowlist?.[0] || '127.0.0.1/32'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
