import React, { useRef, useEffect } from 'react';
import {
  Users,
  Shield,
  Cpu,
  Banknote,
  LayoutGrid,
  ChevronRight,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';
import { APP_MODULES } from '../../registry/moduleRegistry';
import { useClickOutside } from '../../hooks/useClickOutside';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
};

export function AppDrawer({ isOpen, onClose, activeModuleId, onSelectModule }) {
  const drawerRef = useRef(null);
  useClickOutside(drawerRef, onClose, isOpen);

  // Keyboard navigation & accessible focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-start p-4 sm:p-6 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-drawer-title"
    >
      <div
        ref={drawerRef}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col mt-12 animate-fadeIn"
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <h3 id="app-drawer-title" className="font-bold text-sm text-slate-100">
                Enterprise App Switcher
              </h3>
              <p className="text-[11px] text-slate-400">
                Switch workspaces across registered enterprise modules.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close App Switcher"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modules Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5" role="menu" aria-label="Available Modules">
          {APP_MODULES.map((mod) => {
            const Icon = ICON_MAP[mod.iconName] || Layers;
            const isActive = mod.id === activeModuleId;

            return (
              <button
                key={mod.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectModule(mod.id);
                  onClose();
                }}
                className={`p-4 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-blue-50/60 dark:bg-slate-800/80 border-blue-500 dark:border-blue-500 shadow-2xs ring-1 ring-blue-500/20'
                    : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-2xs"
                      style={{ backgroundColor: mod.color }}
                      aria-hidden="true"
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                        {mod.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {mod.menus.length} Sub-menus
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 rtl:rotate-180 transition ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                  {mod.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
