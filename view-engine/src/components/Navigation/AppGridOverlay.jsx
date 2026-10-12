import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users,
  Shield,
  Cpu,
  Banknote,
  LayoutGrid,
  Search,
  X,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { APP_MODULES } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
};

export function AppGridOverlay({
  activeModuleId,
  onSelectModule,
  onSelectMenu,
  onClose,
}) {
  const { hasAppAccess, hasMenuAccess } = useAccessControl();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // Filter apps strictly by access control permissions
  const accessibleApps = useMemo(() => {
    return APP_MODULES.filter((app) => hasAppAccess(app.id));
  }, [hasAppAccess]);

  // Filter by search query across name, shortName, description, and sub-menus
  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return accessibleApps;

    return accessibleApps.filter((app) => {
      const matchName = app.name.toLowerCase().includes(q);
      const matchShort = app.shortName?.toLowerCase().includes(q);
      const matchDesc = app.description.toLowerCase().includes(q);
      const matchMenus = app.menus?.some((m) => m.label.toLowerCase().includes(q));
      return matchName || matchShort || matchDesc || matchMenus;
    });
  }, [accessibleApps, searchQuery]);

  // Focus search input when launcher opens
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard navigation: Escape key returns to active workspace
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="w-full flex-1 flex flex-col py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto animate-fadeIn select-none"
      role="region"
      aria-label="Workspace Application Launcher"
    >
      {/* 1. Clean Centered Hero & Search Bar (Mounted cleanly inside canvas) */}
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 dark:bg-blue-900/30 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold">
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Enterprise Application Ecosystem</span>
          <span className="w-1 h-1 rounded-full bg-blue-500" />
          <span className="font-mono">{accessibleApps.length} Apps Authorized</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Workspace Launcher
        </h1>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Select an enterprise module to launch its dedicated workspace or jump directly into sub-models.
        </p>

        {/* Clean Centered Search Bar */}
        <div className="pt-2 max-w-md mx-auto relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search accessible applications or sub-models..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition"
            aria-label="Filter applications"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded transition cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Responsive Application Cards Grid */}
      <div className="flex-1 flex flex-col justify-start">
        {filteredApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-xs">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              No matching applications found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              {searchQuery
                ? `No authorized applications matched your search query "${searchQuery}".`
                : 'You currently have no security groups granted to launch enterprise applications.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredApps.map((app) => {
              const Icon = ICON_MAP[app.iconName] || Layers;
              const isCurrent = app.id === activeModuleId;

              // Filter sub-menus based on granular permissions
              const permittedMenus = (app.menus || []).filter((menu) =>
                hasMenuAccess(menu.id)
              );

              return (
                <div
                  key={app.id}
                  className={`group relative rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                    isCurrent
                      ? 'bg-white dark:bg-slate-900 border-blue-500 ring-2 ring-blue-500/30'
                      : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5'
                  }`}
                >
                  {/* Subtle top color accent bar */}
                  <div
                    className="h-1.5 w-full transition-opacity opacity-70 group-hover:opacity-100"
                    style={{ backgroundColor: app.color }}
                  />

                  <div className="p-5 flex-1 flex flex-col">
                    {/* Header: Icon & App Info */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div
                        className="w-13 h-13 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform duration-200"
                        style={{ backgroundColor: app.color }}
                        aria-hidden="true"
                      >
                        <Icon className="w-6 h-6" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40 text-[10px] font-semibold tracking-wide">
                            Active
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px]">
                          {app.shortName}
                        </span>
                      </div>
                    </div>

                    {/* App Title & Description */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectModule(app.id);
                        if (permittedMenus.length > 0) {
                          onSelectMenu?.(permittedMenus[0].id);
                        }
                        onClose?.();
                      }}
                      className="text-left rtl:text-right cursor-pointer group-hover:text-blue-600 dark:group-hover:text-blue-400 transition focus:outline-none"
                    >
                      <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition flex items-center justify-between">
                        <span>{app.name}</span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition" />
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5 line-clamp-3">
                        {app.description}
                      </p>
                    </button>

                    {/* Quick-Link Sub-Model Chips */}
                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                        Quick Launch Sub-Models:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {permittedMenus.map((menu) => (
                          <button
                            key={menu.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectModule(app.id);
                              onSelectMenu?.(menu.id);
                              onClose?.();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-600/30 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-200 border border-slate-200 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-500/40 text-xs font-medium transition cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                            title={`Jump directly to ${menu.label}`}
                          >
                            <span>{menu.label}</span>
                            <ArrowRight className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Primary Launch Action Button */}
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {permittedMenus.length} models available
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectModule(app.id);
                        if (permittedMenus.length > 0) {
                          onSelectMenu?.(permittedMenus[0].id);
                        }
                        onClose?.();
                      }}
                      className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition focus-visible:outline-none"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Clean Keyboard Shortcuts Footer (Debug/developer text removed) */}
      <div className="mt-auto pt-8 pb-4 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-4">
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-mono text-[11px]">Esc</kbd> or click 9-dots icon to return
        </span>
        <span>•</span>
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-mono text-[11px]">Ctrl + K</kbd> for Command Palette
        </span>
      </div>
    </div>
  );
}
