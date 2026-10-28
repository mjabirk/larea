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
  Info,
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
  Info,
};

export function SubNavBar({
  activeModuleId,
  activeMenuId,
  onSelectMenu,
}) {
  const { hasMenuAccess } = useAccessControl();
  const activeModule = getModuleById(activeModuleId);
  const activeMenu = getMenuById(activeModuleId, activeMenuId);

  const ModuleIcon = ICON_MAP[activeModule?.iconName] || Layers;

  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const navRef = useRef(null);
  useClickOutside(navRef, () => setOpenDropdownId(null), Boolean(openDropdownId));

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

  const permittedFlatMenus = (activeModule?.menus || []).filter((menu) =>
    hasMenuAccess(menu.id)
  );

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
        aria-label="Section Navigation"
        className="h-11 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center text-sm sticky top-14 z-20 select-none"
      >
        <div className="flex items-center gap-1.5 w-full">
          {/* Mobile Navigation Drawer Trigger (< lg) */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="lg:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="truncate max-w-[180px]">{activeMenu?.label || 'Menu'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Desktop Navigation Tabs / Grouped Dropdowns */}
          <div className="hidden lg:flex items-center gap-1">
            {hasGroups ? (
              permittedMenuGroups.map((group) => {
                const isGroupActive = group.menus.some((m) => m.id === activeMenuId);
                const isOpen = openDropdownId === group.id;
                const activeGroupItem = group.menus.find((m) => m.id === activeMenuId);
                const isSingleItem = group.menus.length === 1;

                if (isSingleItem) {
                  const singleMenu = group.menus[0];
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setOpenDropdownId(null);
                        onSelectMenu(singleMenu.id);
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                        isGroupActive
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      {group.label}
                    </button>
                  );
                }

                return (
                  <div key={group.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdownId(isOpen ? null : group.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                        isGroupActive
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span>{isGroupActive && activeGroupItem ? activeGroupItem.label : group.label}</span>
                      <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="absolute top-full left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1.5 z-40 animate-fadeIn text-sm">
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
                              className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
                                isSubActive
                                  ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/50 dark:bg-blue-950/30'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span>{m.label}</span>
                              {isSubActive && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
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
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {menu.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-72 sm:w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full p-4 flex flex-col z-10 shadow-2xl animate-fadeIn text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: activeModule.color }}
                >
                  <ModuleIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">{activeModule.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-4 text-sm">
              {hasGroups ? (
                permittedMenuGroups.map((grp) => (
                  <div key={grp.id} className="space-y-1">
                    <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {grp.label}
                    </div>
                    <div className="space-y-0.5">
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
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{m.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
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
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{m.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 opacity-50" />
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
