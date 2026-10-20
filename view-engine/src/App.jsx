import React, { useState, useRef } from 'react';
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
import { LegalPolicyModal } from './components/legal/LegalPolicyModal';
import { BusinessVerificationModal } from './components/legal/BusinessVerificationModal';
import { CookieConsentBanner } from './components/legal/CookieConsentBanner';
import { LegalFooter } from './components/legal/LegalFooter';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { EmployeesView } from './components/Employees/EmployeesView';
import { ContractListView } from './components/Employees/ContractListView';
import { ConfigurationView } from './components/Configuration/ConfigurationView';
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
  if (paramView === 'launcher' || isAppsPath) {
    isLauncherOpen = true;
  } else if (!paramApp && !paramMenu) {
    // When loaded at application root without specific parameters, route to Workspace Launcher
    isLauncherOpen = paramView !== 'workspace';
  } else if (storedActiveView === 'launcher') {
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
    if (paramView === 'form' || storedView === 'form') {
      resolvedUserViewMode = 'form';
      resolvedUserId = paramUserId || storedUserId || null;
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

  // User Management List/Form View Mode
  const [userViewMode, setUserViewMode] = useState(initialNav.userViewMode);
  const [employeeResetKey, setEmployeeResetKey] = useState(0);
  const [targetContractEmployeeId, setTargetContractEmployeeId] = useState(null);
  const [selectedUserForForm, setSelectedUserForForm] = useState(() => {
    if (initialNav.selectedUserId && users?.length > 0) {
      return users.find((u) => u.id === initialNav.selectedUserId) || null;
    }
    return null;
  });

  // Re-hydrate selectedUserForForm if users list is populated or updated
  React.useEffect(() => {
    if (userViewMode === 'form' && !selectedUserForForm && initialNav.selectedUserId && users?.length > 0) {
      const found = users.find((u) => u.id === initialNav.selectedUserId);
      if (found) {
        setSelectedUserForForm(found);
      }
    }
  }, [users, userViewMode, selectedUserForForm, initialNav.selectedUserId]);

  // Flags to distinguish initial mount vs user interaction vs popstate
  const isInitialMountRef = useRef(true);
  const isPopStateRef = useRef(false);

  // 1. Persist navigation state to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NAV_VIEW_KEY, isLauncherOpen ? 'launcher' : 'workspace');
      localStorage.setItem(STORAGE_NAV_MODULE_KEY, activeModuleId);
      localStorage.setItem(STORAGE_NAV_MENU_KEY, activeMenuId);
      localStorage.setItem(STORAGE_NAV_USER_VIEW_KEY, userViewMode);
      if (selectedUserForForm?.id) {
        localStorage.setItem(STORAGE_NAV_USER_ID_KEY, selectedUserForForm.id);
      } else {
        localStorage.removeItem(STORAGE_NAV_USER_ID_KEY);
      }
    } catch (e) {
      console.error('Failed to persist navigation state to localStorage:', e);
    }
  }, [isLauncherOpen, activeModuleId, activeMenuId, userViewMode, selectedUserForForm]);

  // 2. Synchronize navigation state with browser URL search parameters and history
  React.useEffect(() => {
    let newPath = window.location.pathname === '/apps' ? '/apps' : '/';
    let newQuery = '';

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
      const params = new URLSearchParams();
      params.set('app', activeModuleId);
      params.set('menu', activeMenuId);
      if (activeModuleId === 'iam' && activeMenuId === 'users' && userViewMode === 'form') {
        params.set('view', 'form');
        if (selectedUserForForm?.id) {
          params.set('userId', selectedUserForForm.id);
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
  }, [isLauncherOpen, activeModuleId, activeMenuId, userViewMode, selectedUserForForm]);

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
    window.addEventListener('larea-operational-form', handleFormEvent);
    return () => window.removeEventListener('larea-operational-form', handleFormEvent);
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

  const handleSelectModule = (modId) => {
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
    }
    setIsLauncherOpen(false);
  };

  const handleSelectMenu = (menuId) => {
    setActiveMenuId(menuId);
    if (menuId === 'users') {
      setUserViewMode('list');
      setSelectedUserForForm(null);
    }
    if (menuId === 'employees') {
      setEmployeeResetKey((prev) => prev + 1);
    }
    setIsLauncherOpen(false);
  };

  // Fallback to first accessible module if active selection is unpermitted
  React.useEffect(() => {
    if (!hasAppAccess(activeModuleId)) {
      const firstAccessible = APP_MODULES.find((m) => hasAppAccess(m.id));
      if (firstAccessible) {
        handleSelectModule(firstAccessible.id);
      }
    }
  }, [activeModuleId, hasAppAccess]);

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
        />
      </ErrorBoundary>

      {/* 4. TIER 1: GLOBAL CONSOLIDATED TOP BAR (56px) - Always Mounted Across All Views */}
      <header className="h-14 bg-[#0f172a] text-white flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30 border-b border-slate-800/80 shadow-xs select-none gap-2">
        {/* LEFT SIDE: 9-Dots Launcher Icon + Brand + Static Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Static 9-Dots App Launcher Icon (Single Entry Point to Switch Apps) */}
          <button
            type="button"
            onClick={() => handleToggleLauncher()}
            aria-label={isLauncherOpen ? "Close Workspace Launcher (Esc)" : "Open Application Launcher (9-dots)"}
            className={`p-2 rounded-lg transition cursor-pointer shadow-2xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isLauncherOpen
                ? 'bg-blue-600 text-white border border-blue-500 shadow-blue-500/30'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
            }`}
            title={isLauncherOpen ? "Close Workspace Launcher (Esc)" : "Open Application Launcher (9-dots)"}
          >
            <LayoutGrid className="w-4 h-4 group-hover:scale-105 transition-transform"/>
          </button>

          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs text-white shadow-xs">
              L
            </div>
            <span className="font-bold text-sm text-white tracking-tight">
              Larea ERP
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Static Location Breadcrumb (No dropdown, no menu switching) */}
          {!isLauncherOpen && (
            <div className="hidden sm:flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: activeModule?.color }}
              />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-200">
                  {activeModule?.name}
                </span>
                <span className="text-slate-500 font-light">/</span>
                <span className="text-slate-400">
                  {activeMenu?.label}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT SIDE: Strict Order (Search -> Org Switcher -> Setup Wizard -> Theme -> Bell -> User) */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* 1. Global Command Palette Search (Ctrl+K) */}
          <div className="hidden xl:flex items-center">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Open Global Command Palette (Ctrl+K)"
              className="flex items-center gap-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 w-56 transition cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-left rtl:text-right"
              title="Search records, apps, or commands (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-slate-400 truncate">
                {t('global_search_placeholder')}
              </span>
              <kbd className="flex items-center gap-0.5 px-1 py-0.5 bg-slate-900/90 border border-slate-700 rounded text-[9px] font-mono text-slate-400 shrink-0">
                <Command className="w-2.5 h-2.5" /> K
              </kbd>
            </button>
          </div>

          {/* Mobile/Compact Search Trigger */}
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            aria-label="Search & Commands (Ctrl+K)"
            className="xl:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Search & Commands (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 2. Organization & Branch Switcher (Moved to Top-Right with Click-Outside) */}
          <div className="relative" ref={branchMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowBranchMenu(!showBranchMenu);
                setShowUserMenu(false);
              }}
              aria-label={`Current organization: ${currentOrganization?.legal_name || 'Organization'}, operating branch: ${currentBranch?.name || 'Branch'}`}
              aria-haspopup="true"
              aria-expanded={showBranchMenu}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px]"
                style={{ backgroundColor: currentAccent.primary }}
                role="img"
                aria-label={`Logo badge for ${currentOrganization?.legal_name || 'Organization'}`}
              >
                {currentOrganization?.legal_name ? currentOrganization.legal_name.slice(0, 1) : 'A'}
              </div>
              <div className="text-left rtl:text-right hidden sm:block">
                <div className="font-semibold text-slate-200 tracking-tight leading-none text-xs truncate max-w-[130px]">
                  {currentOrganization?.legal_name || 'Organization'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5 truncate max-w-[130px]">
                  {currentBranch?.name || 'Branch'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5 shrink-0" aria-hidden="true" />
            </button>

            {/* Dropdown Menu */}
            {showBranchMenu && (
              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-2 z-40 text-xs animate-fadeIn">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t('company')}
                </div>
                {userOrganizations.map((org) => {
                  const isOrgActive = org.id === currentOrganization?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => switchOrganization(org.id)}
                      className={`w-full px-3 py-2 text-left rtl:text-right flex items-center justify-between hover:bg-slate-800 transition cursor-pointer ${isOrgActive ? 'text-blue-400 font-semibold bg-slate-800/60' : 'text-slate-300'
                        }`}
                    >
                      <span className="truncate">{org.legal_name}</span>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
                        {org.base_currency}
                      </span>
                    </button>
                  );
                })}

                <div className="h-[1px] bg-slate-800 my-2" />

                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t('operating_branch')}
                </div>
                {userBranchesInCurrentOrg.map((br) => {
                  const isBrActive = br.id === currentBranch?.id;
                  return (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() => {
                        switchBranch(br.id);
                        setShowBranchMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left rtl:text-right flex items-center justify-between hover:bg-slate-800 transition cursor-pointer ${isBrActive ? 'text-blue-400 font-semibold bg-slate-800/60' : 'text-slate-300'
                        }`}
                    >
                      <div className="truncate">
                        <div>{br.name}</div>
                        <div className="text-[10px] text-slate-500">{br.city}</div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
                        {br.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>



          {/* 4. Dark/Light Theme Toggle */}
          <button
            type="button"
            onClick={toggleThemeQuick}
            aria-label={`Cycle theme. Current theme mode is ${themeMode}`}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            title={`Mode: ${themeMode} (${effectiveTheme}). Click to cycle.`}
          >
            {themeMode === 'system' ? (
              <Laptop className="w-4 h-4 text-slate-300" aria-hidden="true" />
            ) : effectiveTheme === 'dark' ? (
              <Moon className="w-4 h-4 text-violet-300" aria-hidden="true" />
            ) : (
              <Sun className="w-4 h-4 text-amber-300" aria-hidden="true" />
            )}
          </button>

          {/* 5. Dynamic Enterprise Notifications Bell */}
          <NotificationBell onNavigate={handleSelectMenu} />

          {/* Real-time Internal Chat & Discuss Popover */}
          <ChatPopover />

          {/* 6. User Profile Avatar & Dropdown (with Click-Outside) */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowBranchMenu(false);
              }}
              aria-label={`User account menu for ${activeUser?.full_name || 'User'}`}
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-800/70 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <div
                className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs ring-2 ring-slate-800"
                style={{ backgroundColor: currentAccent.primary }}
                role="img"
                aria-label={`Avatar for ${activeUser?.full_name || 'User'}`}
              >
                {activeUser?.full_name
                  ? activeUser.full_name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  : (activeUser?.email?.slice(0, 2).toUpperCase() || activeUser?.username?.slice(0, 2).toUpperCase() || 'AU')}
              </div>
              <div className="text-left rtl:text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-200 leading-none">
                  {activeUser?.full_name || activeUser?.email || 'Authenticated User'}
                </div>
                <div className="text-[10px] text-slate-400 leading-none mt-0.5 truncate max-w-[120px]">
                  {activeUser?.is_superadmin ? 'Root Superadmin' : (activeUser?.role || userMemberships[0]?.role || 'Standard User')}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" aria-hidden="true" />
            </button>

            {/* Profile Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1.5 z-40 text-xs animate-fadeIn text-slate-300">
                <div className="px-3 py-2 border-b border-slate-800">
                  <div className="font-semibold text-white">{activeUser?.full_name || 'Authenticated User'}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">{activeUser?.email}</div>
                  <div className="mt-1 inline-block px-1.5 py-0.5 bg-blue-900/60 text-blue-300 border border-blue-700 rounded text-[10px] font-medium">
                    {activeUser?.is_superadmin ? 'Root Superadmin' : (activeUser?.role || userMemberships[0]?.role || 'Member')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left rtl:text-right hover:bg-slate-800 flex items-center gap-2 text-slate-300 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                  <span>{t('profile_settings')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSelectModule('iam');
                    handleSelectMenu('users');
                    setShowUserMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left rtl:text-right hover:bg-slate-800 flex items-center gap-2 text-slate-300 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Users & Identities</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSelectModule('iam');
                    handleSelectMenu('roles');
                    setShowUserMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left rtl:text-right hover:bg-slate-800 flex items-center gap-2 text-slate-300 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
                  <span>Roles & Permissions Matrix</span>
                </button>

                {/* Red Sign Out Action */}
                <div className="h-[1px] bg-slate-800 my-1" />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-3 py-2 text-left rtl:text-right hover:bg-rose-500/10 flex items-center gap-2 text-rose-400 hover:text-rose-300 cursor-pointer transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
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
        <main className="flex-1 flex flex-col">
          {isLauncherOpen ? (
            <AppGridOverlay
              activeModuleId={activeModuleId}
              onSelectModule={handleSelectModule}
              onSelectMenu={handleSelectMenu}
              onClose={() => setIsLauncherOpen(false)}
            />
          ) : !hasMenuAccess(activeMenuId) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto animate-fadeIn select-none">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-rose-500 mb-4 shadow-sm">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                403 Forbidden • Access Denied
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Access Denied: You do not have the required permissions for this menu.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleLauncher(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Open Workspace Launcher
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Unified Configuration & Settings Screens */}
              {['hr_config', 'salary_rules', 'wps_config', 'api_keys', 'orgs', 'windows_sso', 'compliance_alerts', 'mail_servers', 'mail_templates', 'mail_logs', 'sms_gateways', 'whatsapp_configs', 'whatsapp_accounts', 'whatsapp_templates', 'communication_logs', 'sms_whatsapp_logs', 'automation_triggers'].includes(activeMenuId) && (
                <div className="p-4 sm:p-6">
                  <ConfigurationView activeMenuId={activeMenuId} />
                </div>
              )}

              {/* Module HR: Attendance Logs */}
              {activeModuleId === 'hr' && activeMenuId === 'attendances' && (
                <ViewEngine
                  key="hr-attendances"
                  initialView="list"
                  schema={VIEW_SCHEMA}
                  initialData={attendanceRecords || []}
                />
              )}

              {/* Module HR: Shift Rosters */}
              {activeModuleId === 'hr' && activeMenuId === 'rosters' && (
                <div className="p-4 sm:p-6 space-y-4">
                  <ViewEngine
                    key="hr-rosters"
                    initialView="gantt"
                    schema={{
                      ...VIEW_SCHEMA,
                      title: "Shift Rosters & Department Schedules",
                      default_view: "gantt",
                      newButtonLabel: "+ Assign Shift",
                      filterChips: [
                        { id: 'all', label: 'All' },
                        { id: 'draft', label: 'Draft' },
                        { id: 'published', label: 'Published' },
                        { id: 'confirmed', label: 'Confirmed' },
                      ],
                    }}
                    initialData={attendanceRecords || []}
                  />
                </div>
              )}

              {/* Module HR: Global Contracts Management */}
              {activeModuleId === 'hr' && activeMenuId === 'contracts' && (
                <div className="p-4 sm:p-6">
                  <ContractListView
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
                  <LeaveManagementView />
                </div>
              )}

              {/* Module HR: Employees & Create New Employee */}
              {activeModuleId === 'hr' && (activeMenuId === 'employees' || activeMenuId === 'new_employee') && (
                <EmployeesView
                  key={`emp-view-${employeeResetKey}-${targetContractEmployeeId || 'none'}`}
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
                        setSelectedUserForForm(u);
                        setUserViewMode('form');
                      }}
                      onCreateNewUser={() => {
                        setSelectedUserForForm(null);
                        setUserViewMode('form');
                      }}
                    />
                  ) : (
                    <UserFormView
                      key={selectedUserForForm?.id || 'new'}
                      user={selectedUserForForm}
                      usersList={users || []}
                      onSelectUser={(u) => setSelectedUserForForm(u)}
                      onBackToList={() => {
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
                  <PermissionMatrix />
                </div>
              )}

              {/* Module Operations: Hardware Terminals */}
              {activeModuleId === 'operations' && activeMenuId === 'terminals' && (
                <div className="p-4 sm:p-6">
                  <HardwareTerminalsView />
                </div>
              )}

              {/* Module Payroll: Batches */}
              {activeModuleId === 'payroll' && activeMenuId === 'batches' && (
                <div className="p-4 sm:p-6">
                  <PayrollBatchesView />
                </div>
              )}

              {/* Module Payroll: Variable Pay & Approvals */}
              {activeModuleId === 'payroll' && activeMenuId === 'payroll_adjustments' && (
                <div className="p-4 sm:p-6">
                  <PayrollAdjustmentsView />
                </div>
              )}

              {/* Module Payroll: EOSB & Final Settlement */}
              {activeModuleId === 'payroll' && activeMenuId === 'eosb' && (
                <div className="p-4 sm:p-6">
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
          <span className="text-xs font-semibold text-slate-400 font-mono tracking-wide">
            Connecting to PostgreSQL Core Platform...
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
          <MainAppShell />
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
