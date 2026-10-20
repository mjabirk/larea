import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  Menu,
  X,
  Building2,
  Mail,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react';
import { getModuleById, getMenuById } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';
import { useClickOutside } from '../../hooks/useClickOutside';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
  Building2,
  Mail,
  MessageSquare,
  Sparkles,
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

  const ModuleIcon = ICON_MAP[activeModule?.iconName] || Layers;

  // Active open dropdown in desktop mode
  const [openDropdownId, setOpenDropdownId] = useState(null);
  // Mobile slide-in drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const navRef = useRef(null);
  useClickOutside(navRef, () => setOpenDropdownId(null), Boolean(openDropdownId));

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileDrawerOpen(false);
        setOpenDropdownId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter regular menus for modules without menuGroups
  const permittedFlatMenus = (activeModule?.menus || []).filter((menu) =>
    hasMenuAccess(menu.id)
  );

  // Filter grouped menus for modules with menuGroups
  const permittedMenuGroups = (activeModule?.menuGroups || [])
    .map((grp) => ({
      ...grp,
      menus: (grp.menus || []).filter((m) => hasMenuAccess(m.id)),
    }))
    .filter((grp) => grp.menus.length > 0);

  const hasGroups = permittedMenuGroups.length > 0;

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Secondary Application Sub-Navigation"
        className="h-11 bg-slate-900/95 dark:bg-slate-950/95 border-b border-slate-800/80 px-4 flex items-center justify-between text-xs sticky top-14 z-20 backdrop-blur-md shadow-xs select-none"
      >
        {/* Left: Direct Sub-Menu Navigation (No Module Switcher Button) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Navigation Drawer Trigger (< lg) */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold cursor-pointer"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate max-w-[140px]">{activeMenu?.label || 'Menu'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Desktop Direct Menus / Grouped Dropdowns (>= lg) */}
          <div className="hidden lg:flex items-center gap-1.5">
            {hasGroups ? (
              permittedMenuGroups.map((group) => {
                const isGroupActive = group.menus.some((m) => m.id === activeMenuId);
                const isOpen = openDropdownId === group.id;
                const GroupIcon = ICON_MAP[group.iconName] || Layers;

                return (
                  <div key={group.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdownId(isOpen ? null : group.id)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isGroupActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <GroupIcon className="w-3.5 h-3.5 opacity-80" />
                      <span>{group.label}</span>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="absolute top-full left-0 mt-1.5 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-40 animate-fadeIn text-xs">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                          {group.label}
                        </div>
                        {group.menus.map((m) => {
                          const isSubActive = m.id === activeMenuId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onSelectMenu(m.id);
                                setOpenDropdownId(null);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between transition cursor-pointer hover:bg-slate-800 ${
                                isSubActive ? 'text-blue-400 font-bold bg-slate-800/50' : 'text-slate-200'
                              }`}
                            >
                              <span>{m.label}</span>
                              {isSubActive && <Check className="w-3.5 h-3.5 text-blue-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              permittedFlatMenus.map((menu) => {
                const isActive = activeMenuId === menu.id;
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => onSelectMenu(menu.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {menu.label}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Model Context */}
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

    {/* ========================================================================= */}
    {/* COLLAPSIBLE MOBILE / SMALL SCREEN LEFT DRAWER                             */}
    {/* ========================================================================= */}
    {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Canvas */}
          <div className="relative w-72 sm:w-80 bg-slate-900 border-r border-slate-800 h-full p-4 flex flex-col z-10 shadow-2xl animate-fadeIn text-slate-100">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: activeModule.color }}
                >
                  <ModuleIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">{activeModule.name}</h3>
                  <p className="text-[10px] text-slate-400">Navigation Menu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body (Vertical Accordion List) */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4 text-xs">
              {hasGroups ? (
                permittedMenuGroups.map((grp) => {
                  const GroupIcon = ICON_MAP[grp.iconName] || Layers;
                  return (
                    <div key={grp.id} className="space-y-1">
                      <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <GroupIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>{grp.label}</span>
                      </div>
                      <div className="space-y-0.5 pl-2">
                        {grp.menus.map((m) => {
                          const isActive = m.id === activeMenuId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                onSelectMenu(m.id);
                                setIsMobileDrawerOpen(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                                isActive
                                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                              }`}
                            >
                              <span>{m.label}</span>
                              <ArrowRight className="w-3 h-3 opacity-60" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-1">
                  {permittedFlatMenus.map((m) => {
                    const isActive = m.id === activeMenuId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectMenu(m.id);
                          setIsMobileDrawerOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white font-bold shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                        }`}
                      >
                        <span>{m.label}</span>
                        <ArrowRight className="w-3 h-3 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
