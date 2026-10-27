import React, { useState, useMemo } from 'react';
import {
  PanelLeft,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  Pin,
  Clock,
  Sparkles,
  X,
  ArrowRight,
  Layers,
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
} from 'lucide-react';
import { getModuleById, getMenuById } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
};

export const STORAGE_KEYS = {
  PINNED: 'larea_quick_access_pinned',
  RECENT: 'larea_quick_access_recent',
  DOCK: 'larea_quick_access_dock',
  COLLAPSED: 'larea_quick_access_collapsed',
};

export const DEFAULT_PINNED = [
  { moduleId: 'hr', menuId: 'employees' },
  { moduleId: 'hr', menuId: 'attendances' },
  { moduleId: 'payroll', menuId: 'batches' },
];

const loadStorage = (key, fallback) => {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch (e) {
    console.error('Error loading localStorage key:', key, e);
    return fallback;
  }
};

const saveStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error saving localStorage key:', key, e);
  }
};

export function QuickAccessPanel({
  activeModuleId,
  hoveredModuleId,
  onSelectModule,
  onSelectMenu,
  onClose,
  dockPosition = 'right',
  onToggleDock,
  isCollapsed = false,
  onToggleCollapse,
  isMobile = false,
  onCloseMobileDrawer,
}) {
  const { hasAppAccess, hasMenuAccess } = useAccessControl();

  // 1. Pinned items state (persisted)
  const [pinned, setPinned] = useState(() => {
    const saved = loadStorage(STORAGE_KEYS.PINNED, null);
    if (Array.isArray(saved)) return saved;
    return DEFAULT_PINNED;
  });

  // 2. Recent workspaces state (persisted, max 5)
  const [recent, setRecent] = useState(() => {
    const saved = loadStorage(STORAGE_KEYS.RECENT, []);
    return Array.isArray(saved) ? saved : [];
  });

  // Strictly filter pinned items with access control
  const validPinned = useMemo(() => {
    return pinned.filter((item) => {
      if (!item?.moduleId || !item?.menuId) return false;
      if (!hasAppAccess(item.moduleId) || !hasMenuAccess(item.menuId)) return false;
      const mod = getModuleById(item.moduleId);
      const menu = getMenuById(item.moduleId, item.menuId);
      return !!mod && !!menu;
    });
  }, [pinned, hasAppAccess, hasMenuAccess]);

  // Strictly filter recent items with access control
  const validRecent = useMemo(() => {
    return recent.filter((item) => {
      if (!item?.moduleId || !item?.menuId) return false;
      if (!hasAppAccess(item.moduleId) || !hasMenuAccess(item.menuId)) return false;
      const mod = getModuleById(item.moduleId);
      const menu = getMenuById(item.moduleId, item.menuId);
      return !!mod && !!menu;
    });
  }, [recent, hasAppAccess, hasMenuAccess]);

  // Contextual Module & permitted sub-menus for currently hovered or active module
  const currentModule = useMemo(() => {
    const targetId = hoveredModuleId || activeModuleId || 'hr';
    return getModuleById(targetId);
  }, [hoveredModuleId, activeModuleId]);

  const contextualSubMenus = useMemo(() => {
    if (!currentModule || !hasAppAccess(currentModule.id)) return [];
    return (currentModule.menus || []).filter((m) => hasMenuAccess(m.id));
  }, [currentModule, hasAppAccess, hasMenuAccess]);

  // Check if an item is pinned
  const isPinned = (moduleId, menuId) => {
    return pinned.some((p) => p.moduleId === moduleId && p.menuId === menuId);
  };

  // Toggle pinning an item
  const togglePin = (moduleId, menuId) => {
    setPinned((prev) => {
      let next;
      if (prev.some((p) => p.moduleId === moduleId && p.menuId === menuId)) {
        next = prev.filter((p) => !(p.moduleId === moduleId && p.menuId === menuId));
      } else {
        next = [...prev, { moduleId, menuId }];
      }
      saveStorage(STORAGE_KEYS.PINNED, next);
      return next;
    });
  };

  // Launch a workspace item and update recent history
  const handleItemClick = (moduleId, menuId) => {
    // Update recent workspaces (prepend, deduplicate, limit to 5)
    setRecent((prev) => {
      const filtered = prev.filter((r) => !(r.moduleId === moduleId && r.menuId === menuId));
      const next = [{ moduleId, menuId }, ...filtered].slice(0, 5);
      saveStorage(STORAGE_KEYS.RECENT, next);
      return next;
    });

    onSelectModule(moduleId);
    onSelectMenu?.(menuId);
    onCloseMobileDrawer?.();
    onClose?.();
  };

  // =========================================================================
  // Collapsed Mode on Desktop: Compact Vertical Icon Rail
  // =========================================================================
  if (isCollapsed && !isMobile) {
    return (
      <aside
        className="hidden lg:flex flex-col items-center py-3 w-12 xl:w-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs shrink-0 transition-all duration-200 h-[calc(100vh-280px)] min-h-[420px]"
        aria-label="Quick Access Panel Collapsed"
      >
        {/* Expand Trigger Button */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-xl text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Expand Quick Access"
          aria-label="Expand Quick Access"
        >
          {dockPosition === 'right' ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelRight className="w-4 h-4" />
          )}
        </button>

        {/* Dock Switch Trigger */}
        <button
          type="button"
          onClick={onToggleDock}
          className="mt-1 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title={dockPosition === 'right' ? 'Dock to left' : 'Dock to right'}
          aria-label={dockPosition === 'right' ? 'Dock to left' : 'Dock to right'}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-2" />

        {/* Pinned shortcuts icon stack */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col items-center gap-1.5 w-full px-1">
          {validPinned.map((item) => {
            const mod = getModuleById(item.moduleId);
            const menu = getMenuById(item.moduleId, item.menuId);
            const ModIcon = ICON_MAP[mod?.iconName] || Layers;

            return (
              <button
                key={`collapsed-${item.moduleId}-${item.menuId}`}
                type="button"
                onClick={() => handleItemClick(item.moduleId, item.menuId)}
                title={`${menu?.label} • ${mod?.name}`}
                aria-label={`${menu?.label} in ${mod?.name}`}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs hover:scale-110 hover:shadow-md transition-all cursor-pointer shrink-0"
                style={{ backgroundColor: mod?.color }}
              >
                <ModIcon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // =========================================================================
  // Expanded Mode: Full 3-Section Dockable Panel / Slide-Over Drawer
  // =========================================================================
  const CurrentModIcon = ICON_MAP[currentModule?.iconName] || Layers;

  return (
    <aside
      className={`flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-all duration-200 ${
        isMobile
          ? 'w-full h-full rounded-none border-none'
          : 'w-72 xl:w-80 rounded-2xl h-[calc(100vh-280px)] min-h-[440px]'
      }`}
      aria-label="Quick Access Panel"
    >
      {/* 1. Panel Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Quick Access
          </h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle Dock Position (Desktop) */}
          {!isMobile && (
            <button
              type="button"
              onClick={onToggleDock}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title={dockPosition === 'right' ? 'Dock panel to left' : 'Dock panel to right'}
              aria-label={dockPosition === 'right' ? 'Dock panel to left' : 'Dock panel to right'}
            >
              {dockPosition === 'right' ? (
                <PanelLeft className="w-3.5 h-3.5" />
              ) : (
                <PanelRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Collapse Panel (Desktop) */}
          {!isMobile && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              {dockPosition === 'right' ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Mobile Drawer Close Button */}
          {isMobile && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Close Quick Access"
              aria-label="Close Quick Access"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Scrollable 3-Section Body */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 space-y-5">
        {/* Section A: Pinned Shortcuts */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>Pinned Workspaces</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
              {validPinned.length}
            </span>
          </div>

          {validPinned.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-2 px-1 text-center">
              No pinned shortcuts. Click the pin icon on any sub-menu below to pin it.
            </p>
          ) : (
            <div className="space-y-1">
              {validPinned.map((item) => {
                const mod = getModuleById(item.moduleId);
                const menu = getMenuById(item.moduleId, item.menuId);
                const ModIcon = ICON_MAP[mod?.iconName] || Layers;

                return (
                  <div
                    key={`pinned-${item.moduleId}-${item.menuId}`}
                    onClick={() => handleItemClick(item.moduleId, item.menuId)}
                    className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: mod?.color }}
                      >
                        <ModIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {menu?.label}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {mod?.name}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(item.moduleId, item.menuId);
                      }}
                      title="Unpin shortcut"
                      aria-label="Unpin shortcut"
                      className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition cursor-pointer"
                    >
                      <Pin className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section B: Active / Hovered Module Sub-Menus */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-0">
              <div
                className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] shrink-0"
                style={{ backgroundColor: currentModule?.color || '#3b82f6' }}
              >
                <CurrentModIcon className="w-2.5 h-2.5" />
              </div>
              <span className="truncate">{currentModule?.name}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              {contextualSubMenus.length} {contextualSubMenus.length === 1 ? 'workspace' : 'workspaces'}
            </span>
          </div>

          {contextualSubMenus.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-2 px-1 text-center">
              No authorized sub-menus for this module.
            </p>
          ) : (
            <div className="space-y-0.5">
              {contextualSubMenus.map((menu) => {
                const pinnedNow = isPinned(currentModule.id, menu.id);

                return (
                  <div
                    key={`contextual-${menu.id}`}
                    onClick={() => handleItemClick(currentModule.id, menu.id)}
                    className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 font-medium truncate">
                        {menu.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(currentModule.id, menu.id);
                      }}
                      title={pinnedNow ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                      aria-label={pinnedNow ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                      className={`p-1 rounded-md transition cursor-pointer ${
                        pinnedNow
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${pinnedNow ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section C: Recent Workspaces */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Recent Workspaces</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
              {validRecent.length}
            </span>
          </div>

          {validRecent.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-2 px-1 text-center">
              No recent workspaces yet.
            </p>
          ) : (
            <div className="space-y-0.5">
              {validRecent.map((item) => {
                const mod = getModuleById(item.moduleId);
                const menu = getMenuById(item.moduleId, item.menuId);
                const pinnedNow = isPinned(item.moduleId, item.menuId);

                return (
                  <div
                    key={`recent-${item.moduleId}-${item.menuId}`}
                    onClick={() => handleItemClick(item.moduleId, item.menuId)}
                    className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: mod?.color || '#3b82f6' }}
                      />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 font-medium truncate">
                          {menu?.label}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {mod?.shortName || mod?.name}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(item.moduleId, item.menuId);
                      }}
                      title={pinnedNow ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                      aria-label={pinnedNow ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                      className={`p-1 rounded-md transition cursor-pointer ${
                        pinnedNow
                          ? 'text-amber-500'
                          : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${pinnedNow ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
