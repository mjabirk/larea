import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid,
  Building2,
  ChevronDown,
  Search,
  Bell,
  Command,
  User,
  SlidersHorizontal,
  Sparkles,
  Check,
  Sun,
  Moon,
  Laptop,
  ShieldCheck,
  Users,
  Clock,
  Palette,
  Shield,
  Cpu,
  Banknote,
  Calendar,
  Layers,
  ArrowRight,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { LocaleProvider, useLocale } from './context/LocaleContext';
import { TenancyProvider, useTenancy } from './context/TenancyContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ViewEngine } from './components/ViewEngine/ViewEngine';
import { SetupWizard } from './components/SetupWizard/SetupWizard';
import { LoginView } from './components/auth/LoginView';
import { UserProfileModal } from './components/UserProfileModal';
import { UserListView } from './components/Users/UserListView';
import { UserFormView } from './components/Users/UserFormView';
import { PermissionMatrix } from './components/RBAC/PermissionMatrix';
import { OrganizationsView } from './components/Tenancy/OrganizationsView';
import { AppGridOverlay } from './components/Navigation/AppGridOverlay';
import { SubNavBar } from './components/Navigation/SubNavBar';
import { CommandPalette } from './components/Navigation/CommandPalette';
import { NotificationBell } from './components/Navigation/NotificationBell';
import { ChatProvider } from './context/ChatContext';
import ChatPopover from './components/Chat/ChatPopover';
import ChatDock from './components/Chat/ChatDock';
import { AccessControlProvider, useAccessControl } from './context/AccessControlContext';
import { APP_MODULES, getModuleById, getMenuById } from './registry/moduleRegistry';
import { useClickOutside } from './hooks/useClickOutside';
import { VIEW_SCHEMA, MOCK_RECORDS } from './schema/view_schema';
import { SHIFT_ROSTER_VIEW_SCHEMA } from './schema/attendanceSchema';
import { clearChildViewUrlParams } from './utils/urlState';
import { LegalPolicyModal } from './components/legal/LegalPolicyModal';
import { BusinessVerificationModal } from './components/legal/BusinessVerificationModal';
import { CookieConsentBanner } from './components/legal/CookieConsentBanner';
import { LegalFooter } from './components/legal/LegalFooter';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { EmployeesView } from './components/Employees/EmployeesView';
import { ContractListView } from './components/Employees/ContractListView';
import { ConfigurationView } from './components/Configuration/ConfigurationView';
import { AIAssistantModal } from './components/Navigation/AIAssistantModal';
import { PayrollBatchesView } from './components/Payroll/PayrollBatchesView';
import { PayrollAdjustmentsView } from './components/Payroll/PayrollAdjustmentsView';
import { LeaveManagementView } from './components/Leaves/LeaveManagementView';
import { EOSBGratuityView } from './components/Payroll/EOSBGratuityView';
import { HardwareTerminalsView } from './components/Operations/HardwareTerminalsView';

// Storage Keys for Persistent Window & Menu Navigation
const STORAGE_NAV_MODULE_KEY = 'enterprise_active_module';
const STORAGE_NAV_MENU_KEY = 'enterprise_active_menu';
const STORAGE_NAV_USER_VIEW_KEY = 'enterprise_user_view_mode';
const STORAGE_NAV_USER_ID_KEY = 'enterprise_selected_user_id';
const STORAGE_NAV_VIEW_KEY = 'enterprise_active_view'; // 'launcher' | 'workspace'

function parseNavigationState() {
  let paramApp = null;
  let paramMenu = null;
  let paramView = null;
  let paramUserId = null;
  let isAppsPath = false;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    paramApp = urlParams.get('app') || urlParams.get('module');
    paramMenu = urlParams.get('menu');
    paramView = urlParams.get('view');
    paramUserId = urlParams.get('userId') || urlParams.get('user');
    isAppsPath = window.location.pathname === '/apps';
  } catch (e) {
    console.error('Failed to parse URL search params:', e);
  }

  let storedModule = null;
  let storedMenu = null;
  let storedView = null;
  let storedUserId = null;
  let storedActiveView = null;

  try {
    storedModule = localStorage.getItem(STORAGE_NAV_MODULE_KEY);
    storedMenu = localStorage.getItem(STORAGE_NAV_MENU_KEY);
    storedView = localStorage.getItem(STORAGE_NAV_USER_VIEW_KEY);
    storedUserId = localStorage.getItem(STORAGE_NAV_USER_ID_KEY);
    storedActiveView = localStorage.getItem(STORAGE_NAV_VIEW_KEY);
  } catch (e) {
    console.error('Failed to read navigation state from localStorage:', e);
  }

  // 1. Resolve Launcher state: bound directly to URL query param or route
  let isLauncherOpen = false;
  let paramLauncher = null;
  try {
    paramLauncher = new URLSearchParams(window.location.search).get('launcher');
  } catch (e) {}

  if (paramView === 'launcher' || paramLauncher === '1' || isAppsPath) {
    isLauncherOpen = true;
  } else if (!paramApp && !paramMenu) {
    // When loaded at application root without specific parameters, route to Workspace Launcher
    isLauncherOpen = paramView !== 'workspace';
  } else if (!paramApp && !paramMenu && storedActiveView === 'launcher') {
    isLauncherOpen = true;
  }

  // 2. Resolve Module ID
  let resolvedModuleId = 'hr';
  if (paramApp && APP_MODULES.some((m) => m.id === paramApp)) {
    resolvedModuleId = paramApp;
  } else if (storedModule && APP_MODULES.some((m) => m.id === storedModule)) {
    resolvedModuleId = storedModule;
  }

  // 3. Resolve Menu ID
  const moduleObj = getModuleById(resolvedModuleId);
  const validMenus = moduleObj?.menus || [];
  let resolvedMenuId = validMenus[0]?.id || 'attendances';

  if (paramMenu && (validMenus.some((m) => m.id === paramMenu) || (resolvedModuleId === 'hr' && paramMenu === 'new_employee'))) {
    resolvedMenuId = paramMenu;
  } else if (storedMenu && (validMenus.some((m) => m.id === storedMenu) || (resolvedModuleId === 'hr' && storedMenu === 'new_employee'))) {
    resolvedMenuId = storedMenu;
  }

  // 4. Resolve userViewMode & selectedUserId (for IAM users)
  let resolvedUserViewMode = 'list';
  let resolvedUserId = null;

  if (resolvedModuleId === 'iam' && resolvedMenuId === 'users' && !isLauncherOpen) {
    const hasExplicitUrl = Boolean(paramApp || paramMenu);
    if (paramView === 'form' || (!hasExplicitUrl && storedView === 'form')) {
      resolvedUserViewMode = 'form';
      resolvedUserId = paramUserId || (!hasExplicitUrl ? storedUserId : null) || 'new';
    }
  }

  return {
    isLauncherOpen,
    moduleId: resolvedModuleId,
    menuId: resolvedMenuId,
    userViewMode: resolvedUserViewMode,
    selectedUserId: resolvedUserId,
  };
}

function MainAppShell() {
  const { currentUser: authUser, session, logout } = useAuth();
  const {
    currentUser,
    currentOrganization,
    currentBranch,
    userOrganizations,
    userBranchesInCurrentOrg,
    userMemberships,
    switchBranch,
    switchOrganization,
    attendanceRecords,
    users,
    switchActiveUser,
    refreshTenancyData,
    refreshAttendanceData,
    selectedBranchIds,
    isAllBranchesSelected,
    toggleBranchSelection,
    selectAllBranches,
    tenantEpoch,
  } = useTenancy();

  // Source of truth MUST be the authenticated user session from AuthContext
  const activeUser = authUser || session?.user || currentUser;

  const lastActiveUserIdRef = React.useRef(null);
  React.useEffect(() => {
    if (activeUser?.id && lastActiveUserIdRef.current !== activeUser.id) {
      lastActiveUserIdRef.current = activeUser.id;
      if (switchActiveUser) {
        switchActiveUser(activeUser.id);
      }
    }
  }, [activeUser?.id]);

  const hasLoadedTenancyForTokenRef = React.useRef(null);
  React.useEffect(() => {
    if (session?.token && hasLoadedTenancyForTokenRef.current !== session.token) {
      hasLoadedTenancyForTokenRef.current = session.token;
      if (refreshTenancyData) refreshTenancyData(session.token);
      if (refreshAttendanceData) refreshAttendanceData(session.token);
    }
  }, [session?.token]);

  const { t, language } = useLocale();
  const { themeMode, effectiveTheme, setThemeMode, currentAccent } = useTheme();
  const { hasAppAccess, hasMenuAccess } = useAccessControl();

  // Initial persistent navigation resolution from URL and localStorage
  const initialNav = React.useMemo(() => parseNavigationState(), []);

  // 2-Tier Module & Menu Navigation + Persistent Launcher State
  const [isLauncherOpen, setIsLauncherOpen] = useState(initialNav.isLauncherOpen);
  const [activeModuleId, setActiveModuleId] = useState(initialNav.moduleId);
  const [activeMenuId, setActiveMenuId] = useState(initialNav.menuId);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  // Quick Access Panel Visibility Setting (default false, persisted to localStorage 'larea_enable_quick_access')
  const [enableQuickAccess, setEnableQuickAccess] = useState(() => {
    try {
      return localStorage.getItem('larea_enable_quick_access') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncSetting = () => {
      try {
        setEnableQuickAccess(localStorage.getItem('larea_enable_quick_access') === 'true');
      } catch {
        setEnableQuickAccess(false);
      }
    };

    window.addEventListener('storage', syncSetting);
    window.addEventListener('larea_settings_updated', syncSetting);
    return () => {
      window.removeEventListener('storage', syncSetting);
      window.removeEventListener('larea_settings_updated', syncSetting);
    };
  }, []);

  // User Management List/Form View Mode
  const [userViewMode, setUserViewMode] = useState(initialNav.userViewMode);
  const [employeeResetKey, setEmployeeResetKey] = useState(0);
  const [menuResetKey, setMenuResetKey] = useState(0);
  const [pendingUrlUserId, setPendingUrlUserId] = useState(
    initialNav.selectedUserId && initialNav.selectedUserId !== 'new' ? initialNav.selectedUserId : null
  );
  const [targetContractEmployeeId, setTargetContractEmployeeId] = useState(null);
  const [selectedUserForForm, setSelectedUserForForm] = useState(() => {
    if (initialNav.selectedUserId && initialNav.selectedUserId !== 'new' && users?.length > 0) {
      return users.find((u) => u.id === initialNav.selectedUserId) || null;
    }
    return null;
  });

  // Shift Rosters State and API Persistence (/api/v1/rosters)
  const [rosterRecords, setRosterRecords] = useState([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(false);

  const fetchRosters = React.useCallback(async () => {
    try {
      setIsLoadingRosters(true);
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
        : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/v1/rosters?limit=500', { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.rosters || data.records || [];
        setRosterRecords(list);
      }
    } catch (err) {
      console.warn('Failed to fetch shift rosters from backend:', err);
    } finally {
      setIsLoadingRosters(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeMenuId === 'rosters' && session?.token) {
      fetchRosters();
    }
  }, [activeMenuId, session?.token, fetchRosters]);

  React.useEffect(() => {
    if (tenantEpoch > 0) {
      if (refreshAttendanceData) refreshAttendanceData();
      if (activeMenuId === 'rosters') fetchRosters();
    }
  }, [tenantEpoch, refreshAttendanceData, activeMenuId, fetchRosters]);

  const handleCreateRoster = React.useCallback(async (record) => {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
        : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/v1/rosters', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          employee_id: record.employee_id,
          employee_name: record.employee_name,
          department: record.department,
          shift_name: record.shift_name,
          start_time: record.start_time || record.check_in,
          end_time: record.end_time || record.check_out,
          duration_hours: record.duration_hours,
          location: record.location,
          status: record.status || 'scheduled',
          notes: record.notes
        })
      });
      if (res.ok) {
        const created = await res.json();
        setRosterRecords((prev) => [created, ...prev.filter((r) => r.id !== record.id)]);
        return created;
      }
    } catch (err) {
      console.error('Failed to persist created shift roster:', err);
    }
  }, []);

  const handleUpdateRoster = React.useCallback(async (record) => {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
        : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/v1/rosters/${record.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          employee_id: record.employee_id,
          employee_name: record.employee_name,
          department: record.department,
          shift_name: record.shift_name,
          start_time: record.start_time || record.check_in,
          end_time: record.end_time || record.check_out,
          duration_hours: record.duration_hours,
          location: record.location,
          status: record.status,
          notes: record.notes
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setRosterRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
        return updated;
      }
    } catch (err) {
      console.error('Failed to update shift roster:', err);
    }
  }, []);

  const handleDeleteRoster = React.useCallback(async (rosterId) => {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
        : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/v1/rosters/${rosterId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setRosterRecords((prev) => prev.filter((r) => r.id !== rosterId));
      }
    } catch (err) {
      console.error('Failed to delete shift roster:', err);
    }
  }, []);

  // Re-hydrate selectedUserForForm if users list is populated or updated
  React.useEffect(() => {
    if (userViewMode === 'form' && pendingUrlUserId && users?.length > 0) {
      const found = users.find((u) => String(u.id) === String(pendingUrlUserId));
      if (found) {
        setSelectedUserForForm(found);
      }
      setPendingUrlUserId(null);
    }
  }, [users, userViewMode, pendingUrlUserId]);

  // Flags to distinguish initial mount vs user interaction vs popstate
  const isInitialMountRef = useRef(true);
  const isPopStateRef = useRef(false);
  const prevNavRef = useRef({
    app: initialNav.moduleId,
    menu: initialNav.menuId,
    launcher: initialNav.isLauncherOpen,
  });

  // 1. Persist navigation state to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NAV_VIEW_KEY, isLauncherOpen ? 'launcher' : 'workspace');
      localStorage.setItem(STORAGE_NAV_MODULE_KEY, activeModuleId);
      localStorage.setItem(STORAGE_NAV_MENU_KEY, activeMenuId);
      localStorage.setItem(STORAGE_NAV_USER_VIEW_KEY, userViewMode);
      const effectiveUserId = selectedUserForForm?.id || pendingUrlUserId;
      if (effectiveUserId) {
        localStorage.setItem(STORAGE_NAV_USER_ID_KEY, effectiveUserId);
      } else if (userViewMode !== 'form') {
        localStorage.removeItem(STORAGE_NAV_USER_ID_KEY);
      }
    } catch (e) {
      console.error('Failed to persist navigation state to localStorage:', e);
    }
  }, [isLauncherOpen, activeModuleId, activeMenuId, userViewMode, selectedUserForForm, pendingUrlUserId]);

  // 2. Synchronize navigation state with browser URL search parameters and history
  React.useEffect(() => {
    let newPath = window.location.pathname === '/apps' ? '/apps' : '/';
    let newQuery = '';

    const didChangeSection =
      prevNavRef.current.app !== activeModuleId ||
      prevNavRef.current.menu !== activeMenuId ||
      prevNavRef.current.launcher !== isLauncherOpen;

    prevNavRef.current = {
      app: activeModuleId,
      menu: activeMenuId,
      launcher: isLauncherOpen,
    };

    if (isLauncherOpen) {
      if (window.location.pathname === '/apps') {
        newPath = '/apps';
        newQuery = '';
      } else {
        newPath = '/';
        newQuery = '?view=launcher';
      }
    } else {
      newPath = '/';
      // Preserve child form/detail parameters (view, id, tab, batchId, roleId) when staying on the same menu
      const params = didChangeSection
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);

      params.delete('launcher');
      if (params.get('view') === 'launcher') {
        params.delete('view');
      }
      params.set('app', activeModuleId);
      params.set('menu', activeMenuId);

      if (activeModuleId === 'iam' && activeMenuId === 'users') {
        if (userViewMode === 'form') {
          params.set('view', 'form');
          const uid = selectedUserForForm?.id || pendingUrlUserId || 'new';
          params.set('userId', uid);
        } else {
          params.delete('view');
          params.delete('userId');
        }
      }
      newQuery = `?${params.toString()}`;
    }

    const newUrl = `${newPath}${newQuery}`;
    const currentFullUrl = `${window.location.pathname}${window.location.search}`;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      if (currentFullUrl !== newUrl) {
        window.history.replaceState(null, '', newUrl);
      }
      return;
    }

    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }

    if (currentFullUrl !== newUrl) {
      window.history.pushState(null, '', newUrl);
    }
  }, [isLauncherOpen, activeModuleId, activeMenuId, userViewMode, selectedUserForForm, pendingUrlUserId]);

  // 3. Listen to browser Back/Forward (popstate)
  React.useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
      const nav = parseNavigationState();
      setIsLauncherOpen(nav.isLauncherOpen);
      setActiveModuleId(nav.moduleId);
      setActiveMenuId(nav.menuId);
      setUserViewMode(nav.userViewMode);
      if (nav.selectedUserId && users) {
        setSelectedUserForForm(users.find((u) => u.id === nav.selectedUserId) || null);
      } else {
        setSelectedUserForForm(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [users]);

  // Global Ctrl+K / Cmd+K Command Palette listener
  React.useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Dropdown states with click-outside refs
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Legal & Enterprise Compliance Modals
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState('privacy');
  const [bizModalOpen, setBizModalOpen] = useState(false);
  const [isOperationalFormActive, setIsOperationalFormActive] = useState(false);

  React.useEffect(() => {
    const handleFormEvent = (e) => {
      setIsOperationalFormActive(Boolean(e.detail?.active));
    };
    const handlePolicyEvent = (e) => {
      setSelectedPolicyKey(e.detail?.policyKey || 'privacy');
      setPolicyModalOpen(true);
    };
    const handleBizEvent = () => {
      setBizModalOpen(true);
    };
    window.addEventListener('larea-operational-form', handleFormEvent);
    window.addEventListener('larea-open-legal-policy', handlePolicyEvent);
    window.addEventListener('larea-open-business-verification', handleBizEvent);
    return () => {
      window.removeEventListener('larea-operational-form', handleFormEvent);
      window.removeEventListener('larea-open-legal-policy', handlePolicyEvent);
      window.removeEventListener('larea-open-business-verification', handleBizEvent);
    };
  }, []);

  React.useEffect(() => {
    setIsOperationalFormActive(false);
  }, [activeMenuId, activeModuleId]);

  const isOperationalForm =
    isOperationalFormActive ||
    (activeModuleId === 'iam' && activeMenuId === 'users' && userViewMode === 'form') ||
    (activeModuleId === 'hr' && activeMenuId === 'new_employee');

  const handleOpenPolicy = (policyKey = 'privacy') => {
    setSelectedPolicyKey(policyKey);
    setPolicyModalOpen(true);
  };

  const handleOpenBusinessModal = () => {
    setBizModalOpen(true);
  };

  const branchMenuRef = useRef(null);
  const userMenuRef = useRef(null);

  // Click-outside dismissal for Organization / Branch switcher and User menu
  useClickOutside(branchMenuRef, () => setShowBranchMenu(false), showBranchMenu);
  useClickOutside(userMenuRef, () => setShowUserMenu(false), showUserMenu);

  const activeModule = getModuleById(activeModuleId);
  const activeMenu = getMenuById(activeModuleId, activeMenuId);

  const handleToggleLauncher = (forcedState) => {
    setIsLauncherOpen((prev) => {
      const next = typeof forcedState === 'boolean' ? forcedState : !prev;
      return next;
    });
  };

  const resetCurrentUrlViewParams = () => {
    try {
      const p = new URLSearchParams(window.location.search);
      clearChildViewUrlParams(p);
      const qs = p.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    } catch (e) {}
  };

  const handleSelectModule = (modId) => {
    resetCurrentUrlViewParams();
    setActiveModuleId(modId);
    const targetModule = getModuleById(modId);
    const permitted = targetModule.menus.filter((m) => hasMenuAccess(m.id));
    if (permitted.length > 0) {
      setActiveMenuId(permitted[0].id);
    } else if (targetModule.menus.length > 0) {
      setActiveMenuId(targetModule.menus[0].id);
    }
    // If switching module, reset userViewMode
    if (modId === 'iam') {
      setUserViewMode('list');
      setSelectedUserForForm(null);
      setPendingUrlUserId(null);
    }
    setMenuResetKey((prev) => prev + 1);
    setIsLauncherOpen(false);
  };

  const handleSelectMenu = (menuId) => {
    resetCurrentUrlViewParams();
    setActiveMenuId(menuId);
    if (menuId === 'users') {
      setUserViewMode('list');
      setSelectedUserForForm(null);
      setPendingUrlUserId(null);
    }
    if (menuId === 'employees') {
      setEmployeeResetKey((prev) => prev + 1);
    }
    setMenuResetKey((prev) => prev + 1);
    setIsLauncherOpen(false);
  };

  // Fallback to first accessible module if active selection is unpermitted
  React.useEffect(() => {
    if (activeUser && !hasAppAccess(activeModuleId)) {
      const firstAccessible = APP_MODULES.find((m) => hasAppAccess(m.id));
      if (firstAccessible && firstAccessible.id !== activeModuleId) {
        handleSelectModule(firstAccessible.id);
      }
    }
  }, [activeUser, activeModuleId, hasAppAccess]);

  const handleSignOut = () => {
    setShowUserMenu(false);
    try {
      localStorage.removeItem(STORAGE_NAV_VIEW_KEY);
      localStorage.removeItem(STORAGE_NAV_MODULE_KEY);
      localStorage.removeItem(STORAGE_NAV_MENU_KEY);
      localStorage.removeItem(STORAGE_NAV_USER_VIEW_KEY);
      localStorage.removeItem(STORAGE_NAV_USER_ID_KEY);
      window.history.replaceState(null, '', '/');
    } catch (e) { }
    logout();
  };

  const toggleThemeQuick = () => {
    if (themeMode === 'light') {
      setThemeMode('dark');
    } else if (themeMode === 'dark') {
      setThemeMode('system');
    } else {
      setThemeMode('light');
    }
  };

  const permittedMenus = React.useMemo(() => {
    return (activeModule?.menus || []).filter((menu) => hasMenuAccess(menu.id));
  }, [activeModule, hasMenuAccess]);

  const permittedModules = React.useMemo(() => {
    return APP_MODULES.filter((m) => hasAppAccess(m.id));
  }, [hasAppAccess]);

  return (
    <div className="app-scalable-root min-h-screen bg-[#f8fafc] dark:bg-slate-950 flex flex-col font-sans text-slate-800 dark:text-slate-100 antialiased selection:bg-blue-100 selection:text-blue-900 transition-colors duration-150">

      {/* 2. USER PROFILE & APPEARANCE CUSTOMIZER MODAL */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* 2b. STATUTORY POLICIES MODAL (Privacy, Terms, Refund, Cookie) */}
      <LegalPolicyModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        initialPolicyKey={selectedPolicyKey}
      />

      {/* 2c. BUSINESS VERIFICATION MODAL */}
      <BusinessVerificationModal
        isOpen={bizModalOpen}
        onClose={() => setBizModalOpen(false)}
      />

      {/* 2d. GRANULAR COOKIE & STORAGE CONSENT BANNER (Non-blocking floating) */}
      <CookieConsentBanner
        onOpenPolicy={handleOpenPolicy}
      />

      {/* 3. UNIFIED COMMAND PALETTE (Ctrl+K / ⌘K) */}
      <ErrorBoundary title="Command Palette Error">
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={({ moduleId, menuId }) => {
            setIsLauncherOpen(false);
            handleSelectModule(moduleId);
            if (menuId) handleSelectMenu(menuId);
          }}
          onOpenNewUser={() => {
            setIsLauncherOpen(false);
            handleSelectModule('iam');
            handleSelectMenu('users');
            setSelectedUserForForm(null);
            setUserViewMode('form');
          }}
          onOpenNewEmployee={() => {
            setIsLauncherOpen(false);
            handleSelectModule('hr');
            handleSelectMenu('new_employee');
          }}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenPolicy={handleOpenPolicy}
          onOpenBusinessModal={handleOpenBusinessModal}
          onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
        />
      </ErrorBoundary>

      {/* 3b. PERMISSION-SCOPED AI ASSISTANT MODAL */}
      <ErrorBoundary title="AI Assistant Error">
        <AIAssistantModal
          isOpen={isAIAssistantOpen}
          onClose={() => setIsAIAssistantOpen(false)}
          onNavigate={({ moduleId, menuId }) => {
            setIsLauncherOpen(false);
            handleSelectModule(moduleId);
            if (menuId) handleSelectMenu(menuId);
          }}
        />
      </ErrorBoundary>

      {/* 4. GLOBAL TOP BAR (56px) - Minimal, Clean, Uncluttered */}
      <header className="h-14 bg-[#0f172a] text-white flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 border-b border-slate-800/80 select-none gap-3">
        {/* LEFT SIDE: App Switcher + Current Workspace Name (No brand clutter or misleading breadcrumb) */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => handleToggleLauncher()}
            aria-label={isLauncherOpen ? 'Close Applications (Esc)' : 'Open Applications'}
            className={`p-2 rounded-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isLauncherOpen
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title={isLauncherOpen ? 'Close Applications (Esc)' : 'Applications'}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {!isLauncherOpen && activeModule && (
            <span className="text-[15px] font-semibold text-slate-100 truncate">
              {activeModule.name}
            </span>
          )}
        </div>

        {/* RIGHT SIDE: Search (hidden on Main Menu to avoid duplicate search box), Company Selector, Alerts, Profile */}
        <div className="flex items-center gap-2">
          {/* 1. Search (Ctrl+K) - Only shown inside workspaces; Main Menu has its own centered search bar */}
          {!isLauncherOpen && (
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Search (Ctrl+K)"
              className="flex items-center gap-2 h-9 px-2.5 sm:px-3 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="hidden md:inline text-slate-400 text-xs">Search...</span>
              <kbd className="hidden lg:inline px-1.5 py-0.5 text-[11px] rounded bg-slate-900/80 text-slate-400 border border-slate-700/80">
                Ctrl K
              </kbd>
            </button>
          )}

          {/* 2. Clean Single-Line Company & Branch Selector */}
          <div className="relative" ref={branchMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowBranchMenu(!showBranchMenu);
                setShowUserMenu(false);
              }}
              aria-label={`Current company: ${currentOrganization?.legal_name || 'Company'}`}
              aria-haspopup="true"
              aria-expanded={showBranchMenu}
              className="flex items-center gap-2 h-9 px-3 rounded-lg hover:bg-slate-800 text-sm text-slate-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium truncate max-w-[150px] lg:max-w-[200px] hidden sm:inline">
                {currentOrganization?.legal_name || 'Company'}
              </span>
              {!isAllBranchesSelected && (
                <span className="hidden xl:inline px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-medium truncate max-w-[110px]">
                  {selectedBranchIds.length > 1
                    ? `${selectedBranchIds.length} branches`
                    : userBranchesInCurrentOrg.find((b) => b.id === selectedBranchIds[0])?.name || currentBranch?.name}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            </button>

            {/* Company & Branch Dropdown */}
            {showBranchMenu && (
              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-40 text-sm animate-fadeIn text-slate-800 dark:text-slate-200">
                <div className="px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t('company') || 'Company'}
                </div>
                {userOrganizations.map((org) => {
                  const isOrgActive = org.id === currentOrganization?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => {
                        switchOrganization(org.id);
                        setShowBranchMenu(false);
                      }}
                      className={`w-full px-3.5 py-2 text-left rtl:text-right flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                        isOrgActive
                          ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/50 dark:bg-slate-800/60'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="truncate">{org.legal_name}</span>
                      {isOrgActive && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}

                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1.5" />

                <div className="px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Branches
                </div>

                <button
                  type="button"
                  onClick={() => {
                    selectAllBranches();
                    setShowBranchMenu(false);
                  }}
                  className={`w-full px-3.5 py-2 text-left rtl:text-right flex items-center justify-between transition cursor-pointer ${
                    isAllBranchesSelected
                      ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/50 dark:bg-slate-800/60'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span>All Branches</span>
                  {isAllBranchesSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                </button>

                {userBranchesInCurrentOrg.map((br) => {
                  const isSelected = selectedBranchIds.includes(br.id);
                  return (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() => toggleBranchSelection(br.id)}
                      className={`w-full px-3.5 py-2 text-left rtl:text-right flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition cursor-pointer ${
                        isSelected
                          ? 'text-blue-600 dark:text-blue-400 font-semibold'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="truncate">{br.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{br.city}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Notifications & Internal Messages */}
          <NotificationBell onNavigate={handleSelectMenu} />
          <ChatPopover />

          {/* 4. Minimal User Profile Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowBranchMenu(false);
              }}
              aria-label={`Account menu for ${activeUser?.full_name || 'User'}`}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div
                className="w-7 h-7 rounded-full text-white flex items-center justify-center font-semibold text-xs"
                style={{ backgroundColor: currentAccent.primary }}
              >
                {activeUser?.full_name
                  ? activeUser.full_name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  : (activeUser?.email?.slice(0, 2).toUpperCase() || 'U')}
              </div>
              <span className="text-sm font-medium text-slate-200 hidden lg:inline truncate max-w-[110px]">
                {activeUser?.full_name ? activeUser.full_name.split(' ')[0] : 'Account'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" aria-hidden="true" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 z-40 text-sm animate-fadeIn text-slate-700 dark:text-slate-200">
                <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {activeUser?.full_name || 'User'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {activeUser?.email}
                  </div>
                </div>

                {/* Quick Theme Switcher */}
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-400 mb-1.5">Theme</div>
                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                    {[
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'system', label: 'Auto', icon: Laptop },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const active = themeMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setThemeMode(opt.id)}
                          className={`flex items-center justify-center gap-1 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                            active
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsAIAssistantOpen(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full px-3.5 py-2 text-left rtl:text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span>AI Assistant</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full px-3.5 py-2 text-left rtl:text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4 text-blue-500" />
                  <span>{t('profile_settings') || 'Preferences'}</span>
                </button>

                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-3.5 py-2 text-left rtl:text-right hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2.5 text-rose-600 dark:text-rose-400 cursor-pointer transition font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('sign_out') || 'Sign Out'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 5. SECONDARY SUB-BAR: Context-Aware Top Sub-Navigation (Hidden in Launcher View) */}
      {!isLauncherOpen && (
        <SubNavBar
          activeModuleId={activeModuleId}
          activeMenuId={activeMenuId}
          onSelectMenu={handleSelectMenu}
          onOpenLauncher={() => handleToggleLauncher(true)}
        />
      )}

      {/* 6. WORKSPACE RENDERER ACCORDING TO 2-TIER MODULE & SUB-MENU */}
      <ErrorBoundary title="Workspace Viewport Error">
        <main key={`workspace-${tenantEpoch}`} className="flex-1 flex flex-col">
          {isLauncherOpen ? (
            <AppGridOverlay
              activeModuleId={activeModuleId}
              onSelectModule={handleSelectModule}
              onSelectMenu={handleSelectMenu}
              onClose={() => setIsLauncherOpen(false)}
              onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              isCommandPaletteOpen={isCommandPaletteOpen}
              enableQuickAccess={enableQuickAccess}
            />
          ) : !hasMenuAccess(activeMenuId) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto animate-fadeIn select-none">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-500 mb-4 shadow-sm">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Access Restricted
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                You do not have permission to view this section.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleLauncher(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition cursor-pointer"
                >
                  Back to Applications
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Unified Configuration & Settings Screens */}
              {['hr_config', 'salary_rules', 'wps_config', 'api_keys', 'orgs', 'general_settings', 'about', 'paper_format', 'windows_sso', 'compliance_alerts', 'mail_servers', 'mail_templates', 'mail_logs', 'sms_gateways', 'whatsapp_configs', 'whatsapp_accounts', 'whatsapp_templates', 'communication_logs', 'sms_whatsapp_logs', 'automation_triggers'].includes(activeMenuId) && (
                <div className="p-4 sm:p-6">
                  <ConfigurationView key={`cfg-${activeMenuId}-${menuResetKey}`} activeMenuId={activeMenuId} />
                </div>
              )}

              {/* Module HR: Attendance Logs */}
              {activeModuleId === 'hr' && activeMenuId === 'attendances' && (
                <ViewEngine
                  key={`hr-attendances-${menuResetKey}-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}
                  initialView="list"
                  schema={VIEW_SCHEMA}
                  initialData={attendanceRecords || []}
                />
              )}

              {/* Module HR: Shift Rosters */}
              {activeModuleId === 'hr' && activeMenuId === 'rosters' && (
                <div className="p-4 sm:p-6 space-y-4">
                  <ViewEngine
                    key={`hr-rosters-${menuResetKey}`}
                    initialView="gantt"
                    schema={SHIFT_ROSTER_VIEW_SCHEMA}
                    initialData={rosterRecords || []}
                    onRecordCreated={handleCreateRoster}
                    onRecordUpdated={handleUpdateRoster}
                    onRecordDeleted={handleDeleteRoster}
                  />
                </div>
              )}

              {/* Module HR: Global Contracts Management */}
              {activeModuleId === 'hr' && activeMenuId === 'contracts' && (
                <div className="p-4 sm:p-6">
                  <ContractListView
                    key={`contracts-${menuResetKey}-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}
                    onSelectEmployee={(empId) => {
                      setTargetContractEmployeeId(empId);
                      handleSelectMenu('employees');
                    }}
                  />
                </div>
              )}

              {/* Module HR: Leave & Time Off */}
              {activeModuleId === 'hr' && activeMenuId === 'leaves' && (
                <div className="p-4 sm:p-6">
                  <LeaveManagementView key={`leaves-${menuResetKey}-${currentOrganization?.id || ''}`} />
                </div>
              )}

              {/* Module HR: Employees & Create New Employee */}
              {activeModuleId === 'hr' && (activeMenuId === 'employees' || activeMenuId === 'new_employee') && (
                <EmployeesView
                  key={`emp-view-${employeeResetKey}-${currentOrganization?.id || ''}-${currentBranch?.id || ''}-${targetContractEmployeeId || 'none'}`}
                  activeMenuId={activeMenuId}
                  initialEmployeeId={targetContractEmployeeId}
                  onBackToList={() => {
                    setTargetContractEmployeeId(null);
                    handleSelectMenu('employees');
                  }}
                />
              )}

              {/* Module IAM: Users & Identities */}
              {activeModuleId === 'iam' && activeMenuId === 'users' && (
                <div className="p-4 sm:p-6">
                  {userViewMode === 'list' ? (
                    <UserListView
                      onSelectUser={(u) => {
                        setPendingUrlUserId(null);
                        setSelectedUserForForm(u);
                        setUserViewMode('form');
                      }}
                      onCreateNewUser={() => {
                        setPendingUrlUserId(null);
                        setSelectedUserForForm(null);
                        setUserViewMode('form');
                      }}
                    />
                  ) : pendingUrlUserId && (!users || users.length === 0) ? (
                    <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                      <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading user profile...</span>
                    </div>
                  ) : (
                    <UserFormView
                      key={selectedUserForForm?.id || 'new'}
                      user={selectedUserForForm}
                      usersList={users || []}
                      onSelectUser={(u) => {
                        setPendingUrlUserId(null);
                        setSelectedUserForForm(u);
                      }}
                      onBackToList={() => {
                        setPendingUrlUserId(null);
                        setUserViewMode('list');
                        setSelectedUserForForm(null);
                      }}
                    />
                  )}
                </div>
              )}

              {/* Module IAM: Roles & Permissions Matrix */}
              {activeModuleId === 'iam' && activeMenuId === 'roles' && (
                <div className="p-4 sm:p-6">
                  <PermissionMatrix key={`roles-${menuResetKey}`} />
                </div>
              )}

              {/* Module Operations: Hardware Terminals */}
              {activeModuleId === 'operations' && activeMenuId === 'terminals' && (
                <div className="p-4 sm:p-6" key={`terminals-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}>
                  <HardwareTerminalsView />
                </div>
              )}

              {/* Module Payroll: Batches */}
              {activeModuleId === 'payroll' && activeMenuId === 'batches' && (
                <div className="p-4 sm:p-6" key={`payroll-batches-${menuResetKey}-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}>
                  <PayrollBatchesView />
                </div>
              )}

              {/* Module Payroll: Variable Pay & Approvals */}
              {activeModuleId === 'payroll' && activeMenuId === 'payroll_adjustments' && (
                <div className="p-4 sm:p-6" key={`payroll-adjustments-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}>
                  <PayrollAdjustmentsView />
                </div>
              )}

              {/* Module Payroll: EOSB & Final Settlement */}
              {activeModuleId === 'payroll' && activeMenuId === 'eosb' && (
                <div className="p-4 sm:p-6" key={`payroll-eosb-${currentOrganization?.id || ''}-${currentBranch?.id || ''}`}>
                  <EOSBGratuityView />
                </div>
              )}
            </>
          )}
        </main>
      </ErrorBoundary>

      {/* 7. ENTERPRISE STATUTORY COMPLIANCE & LEGAL FOOTER */}
      {isLauncherOpen && !isOperationalForm && (
        <LegalFooter
          onOpenPolicy={handleOpenPolicy}
          onOpenBusinessModal={handleOpenBusinessModal}
        />
      )}

      {/* 8. REAL-TIME FLOATING CHAT DOCK (ODOO PATTERN) */}
      <ChatDock />
    </div>
  );
}

function AppContent() {
  const { isSystemInitialized, isLoading, isAuthenticated } = useAuth();
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState('privacy');
  const [bizModalOpen, setBizModalOpen] = useState(false);

  const handleOpenPolicy = (policyKey = 'privacy') => {
    setSelectedPolicyKey(policyKey);
    setPolicyModalOpen(true);
  };

  const handleOpenBusinessModal = () => {
    setBizModalOpen(true);
  };

  // 1. Boot Loading State (Verifying PostgreSQL connection & initialization status)
  // NEVER render protected contexts or trigger redirects while isLoading is true!
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center font-sans text-slate-100 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-300">
            Loading workspace...
          </span>
        </div>
      </div>
    );
  }

  // 2. First-Run Setup: If system is not initialized, force setup wizard
  if (!isSystemInitialized) {
    return (
      <div className="app-scalable-root min-h-screen bg-[#0f172a] flex flex-col font-sans text-slate-100">
        <SetupWizard isOpen={true} />
        <CookieConsentBanner onOpenPolicy={handleOpenPolicy} />
        <LegalPolicyModal
          isOpen={policyModalOpen}
          onClose={() => setPolicyModalOpen(false)}
          initialPolicyKey={selectedPolicyKey}
        />
        <BusinessVerificationModal
          isOpen={bizModalOpen}
          onClose={() => setBizModalOpen(false)}
        />
      </div>
    );
  }

  // 3. Enterprise Authentication: If initialized but unauthenticated, show login screen
  if (!isAuthenticated) {
    return (
      <div className="app-scalable-root min-h-screen bg-[#0f172a] flex flex-col font-sans text-slate-100">
        <LoginView
          onOpenPolicy={handleOpenPolicy}
          onOpenBusinessModal={handleOpenBusinessModal}
        />
        <CookieConsentBanner onOpenPolicy={handleOpenPolicy} />
        <LegalPolicyModal
          isOpen={policyModalOpen}
          onClose={() => setPolicyModalOpen(false)}
          initialPolicyKey={selectedPolicyKey}
        />
        <BusinessVerificationModal
          isOpen={bizModalOpen}
          onClose={() => setBizModalOpen(false)}
        />
      </div>
    );
  }

  // 4. Authenticated: Mount protected contexts (Tenancy, AccessControl, Chat) ONLY when isAuthenticated is confirmed
  return (
    <TenancyProvider>
      <AccessControlProvider>
        <ChatProvider>
          <ErrorBoundary title="Application View Engine Error">
            <MainAppShell />
          </ErrorBoundary>
        </ChatProvider>
      </AccessControlProvider>
    </TenancyProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;
