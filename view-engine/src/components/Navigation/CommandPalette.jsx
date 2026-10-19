import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Command,
  LayoutGrid,
  Users,
  Shield,
  Cpu,
  Banknote,
  Clock,
  Sparkles,
  ArrowRight,
  PlusCircle,
  Sun,
  Moon,
  Laptop,
  Building2,
  SlidersHorizontal,
  FileText,
  ShieldCheck,
  CornerDownLeft,
  X,
  Layers,
} from 'lucide-react';
import { APP_MODULES } from '../../registry/moduleRegistry';
import { useAccessControl } from '../../context/AccessControlContext';
import { useTenancy } from '../../context/TenancyContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { ErrorBoundary } from '../common/ErrorBoundary';

const ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
};

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onOpenNewAttendance,
  onOpenNewUser,
  onOpenNewEmployee,
  onOpenProfile,
  onOpenPolicy,
  onOpenBusinessModal,
}) {
  const { hasAppAccess, hasPermission, hasMenuAccess } = useAccessControl();
  const {
    attendanceRecords,
    users,
    currentOrganization,
    currentBranch,
  } = useTenancy();
  const { themeMode, effectiveTheme, setThemeMode } = useTheme();
  const { t } = useLocale();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [employees, setEmployees] = useState([]);
  const cachedEmployeesRef = useRef(null);
  const isFetchingEmployeesRef = useRef(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (cachedEmployeesRef.current !== null) {
        setEmployees(cachedEmployeesRef.current);
        return;
      }
      if (isFetchingEmployeesRef.current) return;
      isFetchingEmployeesRef.current = true;

      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
        : null;
      fetch('/api/v1/employees', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.employees)) {
            cachedEmployeesRef.current = data.employees;
            setEmployees(data.employees);
          }
        })
        .catch(() => { })
        .finally(() => {
          isFetchingEmployeesRef.current = false;
        });
    }
  }, [isOpen]);

  // 1. Build Searchable Items Pool across 4 Scopes
  const allPaletteItems = useMemo(() => {
    const items = [];

    // =========================================================================
    // Scope 1: Apps & Workspaces
    // =========================================================================
    APP_MODULES.forEach((mod) => {
      if (hasAppAccess(mod.id)) {
        const Icon = ICON_MAP[mod.iconName] || Layers;
        items.push({
          id: `app_${mod.id}`,
          scope: 'apps',
          scopeLabel: 'Apps & Workspaces',
          title: mod.name,
          subtitle: mod.description,
          icon: Icon,
          iconBg: mod.color,
          badge: mod.shortName,
          keywords: [mod.name, mod.shortName, 'workspace', 'module', mod.description],
          action: () => {
            onNavigate({ moduleId: mod.id, menuId: mod.menus[0]?.id });
            onClose();
          },
        });
      }
    });

    // =========================================================================
    // Scope 2: Navigation & Menus
    // =========================================================================
    APP_MODULES.forEach((mod) => {
      if (hasAppAccess(mod.id)) {
        const menuEntries = [];
        if (mod.menuGroups && mod.menuGroups.length > 0) {
          mod.menuGroups.forEach((group) => {
            (group.menus || []).forEach((menu) => {
              menuEntries.push({ ...menu, groupLabel: group.label });
            });
          });
        }
        (mod.menus || []).forEach((menu) => {
          if (!menuEntries.some((m) => m.id === menu.id)) {
            menuEntries.push(menu);
          }
        });

        menuEntries.forEach((menu) => {
          if (hasMenuAccess(menu.id)) {
            const subtitle = menu.groupLabel
              ? `${mod.name} › ${menu.groupLabel} › ${menu.label} (${menu.model})`
              : `${mod.name} › ${menu.label} (${menu.model})`;
            items.push({
              id: `menu_${mod.id}_${menu.id}`,
              scope: 'navigation',
              scopeLabel: 'Navigation & Menus',
              title: menu.label,
              subtitle,
              icon: Layers,
              iconBg: mod.color,
              badge: menu.model,
              keywords: [menu.label, menu.model, mod.name, menu.groupLabel || '', 'table', 'view'].filter(Boolean),
              action: () => {
                onNavigate({ moduleId: mod.id, menuId: menu.id });
                onClose();
              },
            });
          }
        });
      }
    });

    // =========================================================================
    // Scope 3: Quick Actions (Permission-Gated)
    // =========================================================================
    // Action: New Attendance (requires attendance.write)
    if (hasPermission('attendance.write')) {
      items.push({
        id: 'action_new_attendance',
        scope: 'actions',
        scopeLabel: 'Quick Actions',
        title: '+ New Attendance Log',
        subtitle: 'Clock in employee or insert manual attendance timestamp',
        icon: PlusCircle,
        iconBg: '#2563eb',
        badge: 'Action',
        keywords: ['new', 'attendance', 'clock in', 'punch', 'create', 'log'],
        action: () => {
          onNavigate({ moduleId: 'hr', menuId: 'attendances' });
          onOpenNewAttendance?.();
          onClose();
        },
      });
    }

    // Action: Invite / Create User (requires users.manage)
    if (hasPermission('users.manage')) {
      items.push({
        id: 'action_create_user',
        scope: 'actions',
        scopeLabel: 'Quick Actions',
        title: '+ Register New Enterprise User',
        subtitle: 'Provision user identity and assign initial RBAC role',
        icon: Users,
        iconBg: '#7c3aed',
        badge: 'Action',
        keywords: ['invite', 'user', 'create user', 'register', 'identity', 'account'],
        action: () => {
          onNavigate({ moduleId: 'iam', menuId: 'users' });
          onOpenNewUser?.();
          onClose();
        },
      });
    }

    // Action: Create New Employee (requires employee.write)
    if (hasPermission('employee.write')) {
      items.push({
        id: 'action_create_employee',
        scope: 'actions',
        scopeLabel: 'Quick Actions',
        title: '+ Create New Employee',
        subtitle: 'Onboard expat personnel, track QID/visa compliance & banking',
        icon: Users,
        iconBg: '#2563eb',
        badge: 'Action',
        keywords: ['create employee', 'new employee', 'onboard', 'hire', 'staff', 'add employee', 'visa', 'qid'],
        action: () => {
          onNavigate({ moduleId: 'hr', menuId: 'new_employee' });
          onOpenNewEmployee?.();
          onClose();
        },
      });
    }

    // Action: Profile Settings
    items.push({
      id: 'action_profile_settings',
      scope: 'actions',
      scopeLabel: 'Quick Actions',
      title: 'Open Profile & Preferences',
      subtitle: 'Manage accent colors, system locale, and personal credentials',
      icon: SlidersHorizontal,
      iconBg: '#059669',
      badge: 'Settings',
      keywords: ['profile', 'preferences', 'settings', 'theme', 'color', 'password'],
      action: () => {
        onOpenProfile?.();
        onClose();
      },
    });

    // Action: Toggle Theme
    items.push({
      id: 'action_toggle_theme',
      scope: 'actions',
      scopeLabel: 'Quick Actions',
      title: `Cycle Theme (Current: ${effectiveTheme})`,
      subtitle: 'Switch between Dark, Light, or System appearance mode',
      icon: effectiveTheme === 'dark' ? Moon : Sun,
      iconBg: '#d97706',
      badge: 'Theme',
      keywords: ['theme', 'dark mode', 'light mode', 'system', 'appearance'],
      action: () => {
        if (themeMode === 'light') setThemeMode('dark');
        else if (themeMode === 'dark') setThemeMode('system');
        else setThemeMode('light');
        onClose();
      },
    });

    // Action: Statutory Legal Policy
    items.push({
      id: 'action_open_legal',
      scope: 'actions',
      scopeLabel: 'Quick Actions',
      title: 'View Statutory Policies & Privacy Hub',
      subtitle: 'GDPR Privacy Policy, Terms of Service, and Cookie Disclosures',
      icon: FileText,
      iconBg: '#475569',
      badge: 'Compliance',
      keywords: ['privacy', 'terms', 'gdpr', 'refund', 'cookie', 'legal'],
      action: () => {
        onOpenPolicy?.('privacy');
        onClose();
      },
    });

    // Action: Business Verification
    items.push({
      id: 'action_biz_modal',
      scope: 'actions',
      scopeLabel: 'Quick Actions',
      title: 'View Business Verification',
      subtitle: `${currentOrganization?.legal_name || 'Organization'} • Tax/CR: ${currentOrganization?.tax_id || 'TAX-12345678'}`,
      icon: Building2,
      iconBg: '#0284c7',
      badge: 'Verification',
      keywords: ['business', 'tax', 'cr', 'address', 'legal entity', 'corporate'],
      action: () => {
        onOpenBusinessModal?.();
        onClose();
      },
    });

    // =========================================================================
    // Scope 4: Active Records (Gated by Read Permissions)
    // =========================================================================
    // Attendance Records (requires attendance.read)
    if (hasPermission('attendance.read') && Array.isArray(attendanceRecords)) {
      attendanceRecords.slice(0, 10).forEach((rec) => {
        items.push({
          id: `rec_att_${rec.id}`,
          scope: 'records',
          scopeLabel: 'Active Records',
          title: rec.employee_name || 'Attendance Punch',
          subtitle: `${rec.id} • ${rec.department || 'Department'} • Status: ${rec.status || 'Draft'}`,
          icon: Clock,
          iconBg: '#2563eb',
          badge: rec.status || 'Attendance',
          keywords: [rec.employee_name, rec.id, rec.department, rec.terminal_id, rec.status],
          action: () => {
            onNavigate({ moduleId: 'hr', menuId: 'attendances' });
            onClose();
          },
        });
      });
    }

    // Registered Users (requires users.read)
    if (hasPermission('users.read') && Array.isArray(users)) {
      users.slice(0, 10).forEach((u) => {
        items.push({
          id: `rec_user_${u.id}`,
          scope: 'records',
          scopeLabel: 'Active Records',
          title: u.full_name || u.email,
          subtitle: `${u.email} • Role: ${u.role || (u.is_superadmin ? 'Root Superadmin' : 'Member')}`,
          icon: Users,
          iconBg: '#7c3aed',
          badge: u.is_superadmin ? 'Superadmin' : 'User',
          keywords: [u.full_name, u.email, u.role, u.id],
          action: () => {
            onNavigate({ moduleId: 'iam', menuId: 'users' });
            onClose();
          },
        });
      });
    }

    // International Expat Employees (requires employee.read)
    if (hasPermission('employee.read') && Array.isArray(employees)) {
      employees.forEach((emp) => {
        items.push({
          id: `rec_emp_${emp.id}`,
          scope: 'records',
          scopeLabel: 'Active Records',
          title: emp.full_name || `${emp.first_name} ${emp.last_name}`,
          subtitle: `${emp.employee_number || 'EMP'} • ${emp.job_title || 'Employee'} • ${emp.department_id || 'HR'} • QID: ${emp.national_id_number || 'N/A'}`,
          icon: Users,
          iconBg: '#059669',
          badge: emp.status || 'Active',
          keywords: [
            emp.full_name,
            emp.first_name,
            emp.last_name,
            emp.employee_number,
            emp.job_title,
            emp.department_id,
            emp.national_id_number,
            emp.passport_number,
            emp.visa_number,
            emp.nationality,
            'employee',
            'expat',
          ],
          action: () => {
            onNavigate({ moduleId: 'hr', menuId: 'employees' });
            onClose();
          },
        });
      });
    }

    return items;
  }, [
    hasAppAccess,
    hasPermission,
    hasMenuAccess,
    attendanceRecords,
    users,
    employees,
    currentOrganization,
    themeMode,
    effectiveTheme,
    setThemeMode,
    onNavigate,
    onOpenNewAttendance,
    onOpenNewUser,
    onOpenNewEmployee,
    onOpenProfile,
    onOpenPolicy,
    onOpenBusinessModal,
    onClose,
  ]);

  // 2. Real-Time Fuzzy / Substring Search
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPaletteItems;

    return allPaletteItems.filter((item) => {
      const matchKeywords = item.keywords?.some(
        (kw) => kw != null && String(kw).toLowerCase().includes(q)
      );
      const matchTitle = item.title != null && String(item.title).toLowerCase().includes(q);
      const matchSubtitle = item.subtitle != null && String(item.subtitle).toLowerCase().includes(q);
      const matchBadge = item.badge != null && String(item.badge).toLowerCase().includes(q);
      return matchTitle || matchSubtitle || matchBadge || matchKeywords;
    });
  }, [allPaletteItems, query]);

  // Group items by scope for clear category headers
  const groupedItems = useMemo(() => {
    const groups = {
      apps: { label: 'Apps & Workspaces', items: [] },
      navigation: { label: 'Navigation & Menus', items: [] },
      actions: { label: 'Quick Actions', items: [] },
      records: { label: 'Active Records', items: [] },
    };

    filteredItems.forEach((item) => {
      if (groups[item.scope]) {
        groups[item.scope].items.push(item);
      }
    });

    return Object.entries(groups).filter(([_, g]) => g.items.length > 0);
  }, [filteredItems]);

  // Reset selected index when query changes or palette opens
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[aria-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Keyboard Navigation: Arrow Up, Arrow Down, Enter, Escape
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length === 0
            ? 0
            : (prev - 1 + filteredItems.length) % filteredItems.length
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [isOpen, filteredItems, selectedIndex, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  let flatCounter = 0;

  return createPortal(
    <ErrorBoundary
      title="Command Search Error"
      fallback={(err, reset) => (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 px-4 select-none"
          onClick={onClose}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 text-center shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-rose-500 mb-2">Search palette encountered an issue</p>
            <p className="text-xs text-slate-400 mb-4">{err?.message || 'Rendering error'}</p>
            <button
              onClick={() => {
                reset();
                onClose();
              }}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    >
      <div
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 px-4 overflow-y-auto animate-fadeIn select-none"
        role="dialog"
        aria-modal="true"
        aria-label="Unified Command Palette"
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh] animate-scaleUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input Bar */}
          <div className="relative flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/90">
            <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command, search records, or jump to an app..."
              className="w-full bg-transparent border-0 px-3 py-1 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-0"
              aria-label="Command search input"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 rounded text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <Command className="w-2.5 h-2.5" /> K
              </kbd>
            )}
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            className="p-2 overflow-y-auto max-h-[60vh] space-y-4 divide-y divide-slate-100 dark:divide-slate-800/40"
            role="listbox"
          >
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-sm font-medium">No results found for "{query}"</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try searching for apps (HR, IAM), actions (+ New Attendance), or employee names.
                </p>
              </div>
            ) : (
              groupedItems.map(([scopeKey, group]) => (
                <div key={scopeKey} className="pt-2 first:pt-0">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 flex items-center justify-between">
                    <span>{group.label}</span>
                    <span className="font-mono text-[10px]">{group.items.length}</span>
                  </div>

                  <div className="space-y-1 mt-1">
                    {group.items.map((item) => {
                      const currentIndex = flatCounter++;
                      const isSelected = currentIndex === selectedIndex;
                      const ItemIcon = item.icon || Layers;

                      return (
                        <div
                          key={item.id}
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          onClick={item.action}
                          className={`px-3 py-2.5 rounded-xl transition cursor-pointer flex items-center justify-between gap-3 text-xs ${isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                            }`}
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'text-white'
                                }`}
                              style={!isSelected && item.iconBg ? { backgroundColor: item.iconBg } : {}}
                            >
                              <ItemIcon className="w-3.5 h-3.5" />
                            </div>

                            <div className="truncate text-left rtl:text-right">
                              <div className="font-semibold text-xs leading-snug truncate">
                                {item.title}
                              </div>
                              <div
                                className={`text-[11px] truncate leading-tight mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'
                                  }`}
                              >
                                {item.subtitle}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.badge && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isSelected
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                  }`}
                              >
                                {item.badge}
                              </span>
                            )}

                            {isSelected && (
                              <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-mono">
                                <CornerDownLeft className="w-2.5 h-2.5" />
                              </kbd>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Command Palette Keyboard Ergonomics Footer */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                  ↑
                </kbd>
                <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                  ↓
                </kbd>{' '}
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                  ↵
                </kbd>{' '}
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
                  Esc
                </kbd>{' '}
                Close
              </span>
            </div>

            <div className="font-mono text-[10px] text-slate-400 hidden sm:block">
              {filteredItems.length} actions available
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>,
    document.body
  );
}
