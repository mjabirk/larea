import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import { APP_MODULES } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';
import { QuickAccessPanel, STORAGE_KEYS } from './QuickAccessPanel';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
};

export function AppGridOverlay({
  activeModuleId,
  onSelectModule,
  onSelectMenu,
  onClose,
  onOpenCommandPalette,
  isCommandPaletteOpen = false,
  enableQuickAccess = false,
}) {
  const { hasAppAccess } = useAccessControl();

  // Track hovered module to dynamically update QuickAccessPanel contextual sub-menus
  const [hoveredModuleId, setHoveredModuleId] = useState(activeModuleId || 'hr');

  // Dock position state ('right' | 'left', default 'right')
  const [dockPosition, setDockPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOCK);
      if (!saved) return 'right';
      try {
        const parsed = JSON.parse(saved);
        return parsed === 'left' ? 'left' : 'right';
      } catch {
        return saved === 'left' ? 'left' : 'right';
      }
    } catch {
      return 'right';
    }
  });

  // Panel collapsed state on desktop (default false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COLLAPSED);
      if (!saved) return false;
      try {
        return JSON.parse(saved) === true;
      } catch {
        return saved === 'true';
      }
    } catch {
      return false;
    }
  });

  // Mobile/Tablet slide-over drawer state (< lg)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Toggle dock position between Left and Right
  const handleToggleDock = () => {
    setDockPosition((prev) => {
      const next = prev === 'right' ? 'left' : 'right';
      try {
        localStorage.setItem(STORAGE_KEYS.DOCK, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Toggle collapsed state
  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEYS.COLLAPSED, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Filter apps strictly by access control permissions
  const accessibleApps = useMemo(() => {
    return APP_MODULES.filter((app) => hasAppAccess(app.id));
  }, [hasAppAccess]);

  // Global keydown handler:
  // - Guard: ignore key events if CommandPalette is open
  // - Escape: close drawer if open, otherwise close launcher
  // - Any printable single character when not focused on input/textarea: open unified Command Palette (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isCommandPaletteOpen || document.querySelector('[aria-label="Unified Command Palette"]')) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (enableQuickAccess && isMobileDrawerOpen) {
          setIsMobileDrawerOpen(false);
        } else {
          onClose?.();
        }
        return;
      }

      const targetTagName = e.target?.tagName?.toLowerCase();
      const isInputOrTextarea =
        targetTagName === 'input' ||
        targetTagName === 'textarea' ||
        e.target?.isContentEditable;

      if (!isInputOrTextarea && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onOpenCommandPalette?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableQuickAccess, isCommandPaletteOpen, isMobileDrawerOpen, onClose, onOpenCommandPalette]);

  return (
    <div
      className="w-full flex-1 flex flex-col py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto animate-fadeIn select-none"
      role="region"
      aria-label="Workspace Application Launcher"
    >
      {/* 1. Header Row with Title and Circular Search Trigger */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <h1 className="text-[22px] font-bold text-slate-900 dark:text-white tracking-tight">
          Workspace Launcher
        </h1>

        <button
          type="button"
          onClick={() => onOpenCommandPalette?.()}
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500 shadow-2xs flex items-center justify-center transition cursor-pointer"
          aria-label="Search & Commands (Ctrl+K)"
          title="Search & Commands (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Responsive Layout: Main Module Grid + Optional Dockable Quick Access Panel */}
      <div
        className={`w-full flex-1 flex flex-col ${
          enableQuickAccess && dockPosition === 'left'
            ? 'lg:flex-row-reverse'
            : enableQuickAccess
            ? 'lg:flex-row'
            : ''
        } gap-6 lg:gap-8 items-start justify-center`}
      >
        {/* Main Workspace Launcher Module Grid */}
        <div className="flex-1 w-full flex flex-col justify-center min-w-0">
          {accessibleApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-xs">
                <Shield className="w-7 h-7" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                No authorized applications
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                You currently have no security groups granted to launch enterprise applications.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 sm:gap-8 xl:gap-10 max-w-4xl mx-auto py-6 place-items-center w-full">
              {accessibleApps.map((app) => {
                const Icon = ICON_MAP[app.iconName] || Layers;

                return (
                  <button
                    key={app.id}
                    type="button"
                    onMouseEnter={() => enableQuickAccess && setHoveredModuleId(app.id)}
                    onFocus={() => enableQuickAccess && setHoveredModuleId(app.id)}
                    onClick={() => {
                      onSelectModule(app.id);
                      onClose?.();
                    }}
                    className="group flex flex-col items-center gap-3 p-2 rounded-2xl cursor-pointer focus:outline-none"
                  >
                    {/* a) Large Squircle Icon Tile */}
                    <div
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-[20px] sm:rounded-[24px] flex items-center justify-center text-white shadow-md group-hover:shadow-xl group-hover:-translate-y-1.5 group-hover:scale-105 transition-all duration-200 ring-1 ring-black/5 dark:ring-white/15"
                      style={{ backgroundColor: app.color }}
                      aria-hidden="true"
                    >
                      <Icon className="w-8 h-8 sm:w-9 sm:h-9 stroke-[1.8]" />
                    </div>

                    {/* b) Module Name Below Icon */}
                    <span className="text-[13px] sm:text-[14px] font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-center leading-snug transition-colors">
                      {app.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Dockable Quick Access Panel (Rendered ONLY when enableQuickAccess is true) */}
        {enableQuickAccess && (
          <div className="hidden lg:flex shrink-0 sticky top-8">
            <QuickAccessPanel
              activeModuleId={activeModuleId}
              hoveredModuleId={hoveredModuleId}
              onSelectModule={onSelectModule}
              onSelectMenu={onSelectMenu}
              onClose={onClose}
              dockPosition={dockPosition}
              onToggleDock={handleToggleDock}
              isCollapsed={isCollapsed}
              onToggleCollapse={handleToggleCollapse}
              isMobile={false}
            />
          </div>
        )}
      </div>

      {/* 3. Floating Quick Access Pill Button for Mobile / Tablet (< lg) (Rendered ONLY when enableQuickAccess is true) */}
      {enableQuickAccess && (
        <div className="lg:hidden fixed bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-xl font-semibold text-xs transition-all duration-200 cursor-pointer active:scale-95"
            aria-label="Open Quick Access Panel"
          >
            <Sparkles className="w-4 h-4" />
            <span>Quick Access</span>
          </button>
        </div>
      )}

      {/* 4. Slide-over Drawer for Mobile / Tablet (< lg) (Rendered ONLY when enableQuickAccess is true) */}
      {enableQuickAccess && isMobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer Panel */}
          <div className="relative w-full max-w-sm sm:max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-fadeIn">
            <QuickAccessPanel
              activeModuleId={activeModuleId}
              hoveredModuleId={hoveredModuleId}
              onSelectModule={onSelectModule}
              onSelectMenu={onSelectMenu}
              onClose={onClose}
              dockPosition={dockPosition}
              onToggleDock={handleToggleDock}
              isCollapsed={false}
              onToggleCollapse={handleToggleCollapse}
              isMobile={true}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 5. Clean Keyboard Shortcuts Footer */}
      <div className="mt-auto pt-8 pb-4 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-mono text-[11px]">Esc</kbd> or click 9-dots icon to return
        </span>
        <span className="hidden sm:inline">•</span>
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-mono text-[11px]">Ctrl + K</kbd> for Command Palette
        </span>
      </div>
    </div>
  );
}
