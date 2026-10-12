import React from 'react';
import {
  Users,
  Shield,
  Cpu,
  Banknote,
  Layers,
  ChevronDown,
  LayoutGrid,
} from 'lucide-react';
import { getModuleById, getMenuById } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
};

export function SubNavBar({
  activeModuleId,
  activeMenuId,
  onSelectMenu,
  onOpenLauncher,
}) {
  const { hasMenuAccess } = useAccessControl();
  const activeModule = getModuleById(activeModuleId);
  const activeMenu = getMenuById(activeModuleId, activeMenuId);

  const Icon = ICON_MAP[activeModule.iconName] || Layers;

  // Filter sub-menus strictly by model permission
  const permittedMenus = (activeModule.menus || []).filter((menu) =>
    hasMenuAccess(menu.id)
  );

  return (
    <nav
      aria-label="Secondary Application Sub-Navigation"
      className="h-11 bg-slate-900/95 dark:bg-slate-950/95 border-b border-slate-800/80 px-4 flex items-center justify-between text-xs sticky top-14 z-20 backdrop-blur-md shadow-2xs select-none"
    >
      {/* Left: Active App Indicator with Quick Launcher Re-opener */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenLauncher}
          aria-label={`Active App: ${activeModule.name}. Click to switch workspace.`}
          className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 transition cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Click to open Full-Screen App Launcher"
        >
          <div
            className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[10px]"
            style={{ backgroundColor: activeModule.color }}
            aria-hidden="true"
          >
            <Icon className="w-2.5 h-2.5" />
          </div>
          <span className="font-bold text-slate-100 text-xs hidden sm:inline">
            {activeModule.name}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 group-hover:translate-y-0.5 transition-transform" />
        </button>

        <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

        {/* Sub-Menu Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {permittedMenus.map((menu) => {
            const isActive = activeMenuId === menu.id;

            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => onSelectMenu(menu.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>{menu.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Active Model Context & Health Pulse */}
      <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>
          Active Context:{' '}
          <strong className="text-slate-200 font-mono">
            {activeMenu?.model || 'workspace'}
          </strong>
        </span>
      </div>
    </nav>
  );
}
