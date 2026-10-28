import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const TenancyContext = createContext(null);

const EMPTY_TENANCY_DATA = {
  organizations: [],
  branches: [],
  users: [],
  organization_memberships: [],
  memberships: [],
  user_preferences: [],
  attendance_records: [],
  activeUserId: null,
  activeOrgId: null,
  activeBranchId: null,
};

const getAuthenticatedUserId = () => {
  try {
    const raw = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_session_cache') || sessionStorage.getItem('enterprise_session_cache'))
      : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.id || parsed?.id || parsed?.user_id || null;
    }
  } catch (e) {
    // ignore
  }
  return null;
};

export function TenancyProvider({ children }) {
  const { isAuthenticated, isLoading, token, session } = useAuth();
  const [tenancyState, setTenancyState] = useState(EMPTY_TENANCY_DATA);

  // Attendance Records Store
  const [attendanceRecords, setAttendanceRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('enterprise_attendance_records');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isTenancyLoading, setIsTenancyLoading] = useState(false);

  // Multi-Branch Selection & Reactive Invalidation
  const [selectedBranchIds, setSelectedBranchIds] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('enterprise_selected_branch_ids') : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ['all'];
  });
  const [tenantEpoch, setTenantEpoch] = useState(0);

  const isAllBranchesSelected = useMemo(() => {
    return selectedBranchIds.includes('all') || selectedBranchIds.length === 0;
  }, [selectedBranchIds]);

  const activeBranchId = useMemo(() => {
    if (isAllBranchesSelected) return 'all';
    if (selectedBranchIds.length === 1) return selectedBranchIds[0];
    return 'all';
  }, [isAllBranchesSelected, selectedBranchIds]);

  const getAuthHeaders = useCallback((customToken = null) => {
    const activeToken = customToken || token;
    const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
    if (tenancyState.activeOrgId) headers['X-Organization-Id'] = tenancyState.activeOrgId;
    headers['X-Branch-Ids'] = selectedBranchIds.join(',');
    if (!isAllBranchesSelected && selectedBranchIds.length === 1) {
      headers['X-Branch-Id'] = selectedBranchIds[0];
    }
    return headers;
  }, [token, tenancyState.activeOrgId, selectedBranchIds, isAllBranchesSelected]);

  // Fetch live Tenancy & User data from PostgreSQL backend
  const refreshTenancyData = useCallback(async (customToken = null) => {
    const headers = getAuthHeaders(customToken);
    if (!headers.Authorization) {
      return;
    }
    setIsTenancyLoading(true);
    try {
      const [tenancyRes, usersRes] = await Promise.all([
        fetch('/api/v1/iam/tenancy', { headers }).catch(() => null),
        fetch('/api/v1/iam/users', { headers }).catch(() => null),
      ]);

      let orgs = [];
      let branches = [];
      let users = [];

      if (tenancyRes && tenancyRes.ok) {
        const data = await tenancyRes.json();
        orgs = data.organizations || [];
        branches = data.branches || [];
      }

      if (usersRes && usersRes.ok) {
        const data = await usersRes.json();
        users = data.users || [];
      }

      if (orgs.length > 0 || users.length > 0) {
        // Synthesize memberships from users' branch and org assignments
        const memberships = users.map((u) => ({
          id: `mem_${u.id}`,
          user_id: u.id,
          organization_id: u.organization_id || orgs[0]?.id,
          branch_id: u.branch_id || branches[0]?.id,
          role: u.role || 'Standard User',
        }));

        const authUid = getAuthenticatedUserId();
        const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem('enterprise_active_org_id') : null;
        const savedBranchId = typeof window !== 'undefined' ? localStorage.getItem('enterprise_active_branch_id') : null;

        setTenancyState((prev) => {
          const activeOrgsPool = orgs.filter((o) => o.is_active !== false);
          const selectableOrgs = activeOrgsPool.length > 0 ? activeOrgsPool : orgs;

          const activeOrg = (prev.activeOrgId && selectableOrgs.some((o) => o.id === prev.activeOrgId))
            ? prev.activeOrgId
            : (savedOrgId && selectableOrgs.some((o) => o.id === savedOrgId))
              ? savedOrgId
              : selectableOrgs[0]?.id || null;

          const orgBranchesAll = branches.filter((b) => b.organization_id === activeOrg);
          const activeOrgBranches = orgBranchesAll.filter((b) => b.is_active !== false);
          const selectableBranches = activeOrgBranches.length > 0 ? activeOrgBranches : orgBranchesAll;

          const activeBranch = (prev.activeBranchId && selectableBranches.some((b) => b.id === prev.activeBranchId))
            ? prev.activeBranchId
            : (savedBranchId && selectableBranches.some((b) => b.id === savedBranchId))
              ? savedBranchId
              : selectableBranches[0]?.id || branches.find((b) => b.is_active !== false)?.id || branches[0]?.id || null;

          if (typeof window !== 'undefined') {
            if (activeOrg) localStorage.setItem('enterprise_active_org_id', activeOrg);
            if (activeBranch) localStorage.setItem('enterprise_active_branch_id', activeBranch);
          }

          return {
            ...prev,
            organizations: orgs,
            branches: branches,
            users: users,
            organization_memberships: memberships,
            memberships: memberships,
            activeOrgId: activeOrg,
            activeBranchId: activeBranch,
            activeUserId: authUid || prev.activeUserId || users[0]?.id || null,
          };
        });
      }
    } catch (err) {
      console.warn('Failed to load tenancy data from backend:', err);
    } finally {
      setIsTenancyLoading(false);
    }
  }, [getAuthHeaders]);

  const refreshAttendanceData = useCallback(async (customToken = null) => {
    try {
      const headers = getAuthHeaders(customToken);
      if (!headers.Authorization) {
        return;
      }
      const res = await fetch('/api/v1/attendance', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.records && Array.isArray(data.records)) {
          setAttendanceRecords(data.records);
          localStorage.setItem('enterprise_attendance_records', JSON.stringify(data.records));
        }
      }
    } catch (e) {
      console.warn('Failed to load attendance records from backend:', e);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) {
      setTenancyState(EMPTY_TENANCY_DATA);
      setAttendanceRecords([]);
      return;
    }

    let isMounted = true;
    const initializeData = async () => {
      try {
        await refreshTenancyData(token);
        if (isMounted) {
          await refreshAttendanceData(token);
        }
      } catch (err) {
        console.warn('Initial data load error:', err);
      }
    };
    initializeData();

    // Listen for authentication changes (login, session restored, logout)
    const handleAuthChange = (e) => {
      const detail = e?.detail;
      if (detail?.type === 'login' || detail?.type === 'session_restored') {
        const authToken = detail?.token;
        if (authToken) {
          refreshTenancyData(authToken);
          refreshAttendanceData(authToken);
        }
        if (detail?.user?.id) {
          setTenancyState((prev) => ({
            ...prev,
            activeUserId: detail.user.id,
          }));
        }
      } else if (detail?.type === 'logout') {
        setTenancyState(EMPTY_TENANCY_DATA);
        setAttendanceRecords([]);
      }
    };

    window.addEventListener('larea-auth-change', handleAuthChange);
    return () => {
      isMounted = false;
      window.removeEventListener('larea-auth-change', handleAuthChange);
    };
  }, [isLoading, isAuthenticated, token, refreshTenancyData, refreshAttendanceData]);

  // Synchronize activeUserId with logged-in user session in storage
  useEffect(() => {
    const syncAuthUser = () => {
      const authUid = getAuthenticatedUserId();
      if (authUid && tenancyState.activeUserId !== authUid) {
        setTenancyState((prev) => {
          if (prev.activeUserId === authUid) return prev;
          return {
            ...prev,
            activeUserId: authUid,
          };
        });
      }
    };
    syncAuthUser();
    window.addEventListener('storage', syncAuthUser);
    return () => window.removeEventListener('storage', syncAuthUser);
  }, [tenancyState.activeUserId]);

  // Active entities
  const currentAuthUid = getAuthenticatedUserId();
  const targetUserId = currentAuthUid || tenancyState.activeUserId;
  const currentUser = useMemo(() => {
    return (
      (targetUserId ? tenancyState.users.find((u) => u.id === targetUserId) : null) ||
      (!currentAuthUid ? tenancyState.users[0] : null) ||
      null
    );
  }, [targetUserId, tenancyState.users, currentAuthUid]);

  const currentOrganization = useMemo(() => {
    const activePool = tenancyState.organizations.filter((o) => o.is_active !== false);
    return (
      activePool.find((o) => o.id === tenancyState.activeOrgId) ||
      activePool[0] ||
      tenancyState.organizations.find((o) => o.id === tenancyState.activeOrgId) ||
      tenancyState.organizations[0] ||
      null
    );
  }, [tenancyState.organizations, tenancyState.activeOrgId]);

  const currentBranch = useMemo(() => {
    const activePool = tenancyState.branches.filter((b) => b.is_active !== false);
    return (
      activePool.find((b) => b.id === tenancyState.activeBranchId) ||
      tenancyState.branches.find((b) => b.id === tenancyState.activeBranchId) ||
      activePool[0] ||
      tenancyState.branches[0] ||
      null
    );
  }, [tenancyState.branches, tenancyState.activeBranchId]);

  const memberships = useMemo(() => {
    return tenancyState.organization_memberships || tenancyState.memberships || [];
  }, [tenancyState.organization_memberships, tenancyState.memberships]);

  const userMemberships = useMemo(() => {
    if (!currentUser?.id) return [];
    return memberships.filter((m) => m.user_id === currentUser.id);
  }, [memberships, currentUser?.id]);

  const isSuperadmin = Boolean(
    currentUser?.is_superadmin ||
    session?.user?.is_superadmin ||
    session?.is_superadmin ||
    currentUser?.role === 'superadmin' ||
    session?.user?.role === 'superadmin'
  );

  // Workspace switcher lists only active companies & branches
  const userOrganizations = useMemo(() => {
    const activeOrgs = tenancyState.organizations.filter((o) => o.is_active !== false);
    const baseOrgs = activeOrgs.length > 0 ? activeOrgs : tenancyState.organizations;
    return isSuperadmin
      ? baseOrgs
      : baseOrgs.filter((o) =>
          o.id === currentUser?.organization_id ||
          (currentUser?.allowed_company_ids || []).includes(o.id)
        );
  }, [isSuperadmin, tenancyState.organizations, currentUser?.organization_id, currentUser?.allowed_company_ids]);

  const userBranchesInCurrentOrg = useMemo(() => {
    if (!currentOrganization?.id) return [];
    const activeBranches = tenancyState.branches.filter(
      (b) => b.organization_id === currentOrganization?.id && b.is_active !== false
    );
    return isSuperadmin
      ? activeBranches
      : activeBranches.filter((b) =>
          b.id === currentUser?.branch_id || (currentUser?.allowed_branch_ids || []).includes(b.id)
        );
  }, [isSuperadmin, tenancyState.branches, currentOrganization?.id, currentUser?.branch_id, currentUser?.allowed_branch_ids]);

  const toggleBranchSelection = useCallback((branchId) => {
    if (!branchId) return;
    setSelectedBranchIds((prev) => {
      let next;
      if (prev.includes('all')) {
        next = [branchId];
      } else if (prev.includes(branchId)) {
        next = prev.filter((id) => id !== branchId);
        if (next.length === 0) {
          next = ['all'];
        }
      } else {
        next = [...prev, branchId];
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('enterprise_selected_branch_ids', JSON.stringify(next));
        if (next.length === 1 && next[0] !== 'all') {
          localStorage.setItem('enterprise_active_branch_id', next[0]);
        }
        window.dispatchEvent(
          new CustomEvent('enterprise-tenancy-switched', {
            detail: { branch_ids: next },
          })
        );
      }
      return next;
    });
    setTenantEpoch((prev) => prev + 1);
  }, []);

  const selectAllBranches = useCallback(() => {
    setSelectedBranchIds(['all']);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enterprise_selected_branch_ids', JSON.stringify(['all']));
      window.dispatchEvent(
        new CustomEvent('enterprise-tenancy-switched', {
          detail: { branch_ids: ['all'] },
        })
      );
    }
    setTenantEpoch((prev) => prev + 1);
  }, []);

  const switchOrganization = useCallback((orgId) => {
    if (!orgId) return;
    setSelectedBranchIds(['all']);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enterprise_selected_branch_ids', JSON.stringify(['all']));
      localStorage.setItem('enterprise_active_org_id', orgId);
    }
    setTenancyState((prev) => {
      const targetBranches = prev.branches.filter((b) => b.organization_id === orgId);
      const newBranchId = targetBranches[0]?.id || null;
      if (typeof window !== 'undefined') {
        localStorage.setItem('enterprise_active_branch_id', newBranchId || '');
        window.dispatchEvent(
          new CustomEvent('enterprise-tenancy-switched', {
            detail: { organization_id: orgId, branch_id: newBranchId, branch_ids: ['all'] },
          })
        );
      }
      return {
        ...prev,
        activeOrgId: orgId,
        activeBranchId: newBranchId,
      };
    });
    setTenantEpoch((prev) => prev + 1);
  }, []);

  const switchBranch = useCallback((branchId) => {
    if (!branchId) return;
    setSelectedBranchIds([branchId]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enterprise_selected_branch_ids', JSON.stringify([branchId]));
      localStorage.setItem('enterprise_active_branch_id', branchId);
    }
    setTenancyState((prev) => {
      if (prev.activeBranchId === branchId) return prev;
      const targetBranch = prev.branches.find((b) => b.id === branchId);
      const targetOrgId = targetBranch ? targetBranch.organization_id : prev.activeOrgId;
      if (typeof window !== 'undefined') {
        if (targetOrgId) {
          localStorage.setItem('enterprise_active_org_id', targetOrgId);
        }
        window.dispatchEvent(
          new CustomEvent('enterprise-tenancy-switched', {
            detail: { organization_id: targetOrgId, branch_id: branchId, branch_ids: [branchId] },
          })
        );
      }
      return {
        ...prev,
        activeBranchId: branchId,
        activeOrgId: targetOrgId,
      };
    });
    setTenantEpoch((prev) => prev + 1);
  }, []);

  const switchActiveUser = useCallback((userId) => {
    if (!userId) return;
    setTenancyState((prev) => {
      if (prev.activeUserId === userId) return prev;
      return {
        ...prev,
        activeUserId: userId,
      };
    });
  }, []);

  // Complete setup wizard helper
  const completeSetupWizard = useCallback(({ orgData, adminData, prefData }) => {
    // Re-sync directly from PostgreSQL
    refreshTenancyData();
    return {
      newUser: {
        email: adminData.email,
        full_name: adminData.full_name,
        is_superadmin: true,
      },
    };
  }, [refreshTenancyData]);

  // Create User: Persists to PostgreSQL via POST /api/v1/iam/users
  const createUser = useCallback(async ({
    full_name,
    email,
    role,
    role_id,
    department,
    branch_id,
    initial_password,
    date_of_birth,
    age,
    guardian_name,
    guardian_email,
    windows_upn,
    ad_sam_account,
    auth_provider,
    auto_sso_enabled,
  }) => {
    const targetBranchId = branch_id || tenancyState.activeBranchId || tenancyState.branches[0]?.id;
    const targetOrgId = tenancyState.activeOrgId || tenancyState.organizations[0]?.id;

    try {
      const res = await fetch('/api/v1/iam/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          full_name,
          email,
          role,
          role_id,
          department: department || 'Operations',
          branch_id: targetBranchId,
          organization_id: targetOrgId,
          initial_password: initial_password || 'InitPass@2026',
          date_of_birth,
          age,
          guardian_name,
          guardian_email,
          windows_upn: windows_upn || null,
          ad_sam_account: ad_sam_account || null,
          auth_provider: auth_provider || 'local',
          auto_sso_enabled: Boolean(auto_sso_enabled),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }

      const createdUser = await res.json();

      setTenancyState((prev) => ({
        ...prev,
        users: [createdUser, ...prev.users],
      }));

      return createdUser;
    } catch (err) {
      console.error('Error creating user in PostgreSQL:', err);
      throw err;
    }
  }, [tenancyState.activeBranchId, tenancyState.branches, tenancyState.activeOrgId, tenancyState.organizations]);

  // Update User: Persists to PostgreSQL via PUT /api/v1/iam/users/{id}
  const updateUser = useCallback(async (userId, updatedFields) => {
    try {
      await fetch(`/api/v1/iam/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(updatedFields),
      });
    } catch (err) {
      console.warn('Failed to update user in backend:', err);
    }

    setTenancyState((prev) => {
      const updatedUsers = prev.users.map((u) => {
        if (u.id === userId) {
          return { ...u, ...updatedFields };
        }
        return u;
      });
      return { ...prev, users: updatedUsers };
    });
  }, []);

  // Reset User Password: Calls POST /api/v1/iam/users/{id}/reset-password
  const resetUserPassword = useCallback(async (userId, newPassword) => {
    try {
      const res = await fetch(`/api/v1/iam/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update password');
      }
      return { success: true, timestamp: new Date().toISOString() };
    } catch (err) {
      console.error('Failed to persist reset password in backend:', err);
      throw err;
    }
  }, []);

  // Delete User: Calls DELETE /api/v1/iam/users/{id}
  const deleteUser = useCallback(async (userId) => {
    try {
      await fetch(`/api/v1/iam/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn('Failed to delete user in backend:', err);
    }

    setTenancyState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId),
    }));
  }, []);

  const requestDataDeletion = useCallback((userId, deletionMetadata = {}) => {
    setTenancyState((prev) => {
      const updatedUsers = prev.users.map((u) => {
        if (u.id === userId) {
          const pseudonym =
            deletionMetadata.pseudonym ||
            `DELETED_USER_${userId.slice(-4).toUpperCase()}`;
          const scheduled_purge_at =
            deletionMetadata.scheduled_purge_at ||
            new Date(Date.now() + 30 * 86400000).toISOString();
          return {
            ...u,
            status: 'pending_deletion',
            pseudonym,
            scheduled_purge_at,
            deletion_requested_at: new Date().toISOString(),
          };
        }
        return u;
      });
      return { ...prev, users: updatedUsers };
    });
  }, []);

  const cancelDataDeletion = useCallback((userId) => {
    setTenancyState((prev) => {
      const updatedUsers = prev.users.map((u) => {
        if (u.id === userId) {
          const userCopy = { ...u };
          delete userCopy.pseudonym;
          delete userCopy.scheduled_purge_at;
          delete userCopy.deletion_requested_at;
          userCopy.status = 'active';
          return userCopy;
        }
        return u;
      });
      return { ...prev, users: updatedUsers };
    });
  }, []);

  // Attendance management (persisted to PostgreSQL /api/v1/attendance)
  const addAttendanceRecord = useCallback(async (record) => {
    try {
      const payload = {
        employee_id: record.employee_id,
        employee_name: record.employee_name,
        department: record.department,
        terminal_id: record.terminal_id,
        check_in: record.check_in,
        check_out: record.check_out,
        duration_hours: record.duration_hours,
        status: record.status || 'draft',
        notes: record.notes,
      };
      if (payload.employee_id) {
        const res = await fetch('/api/v1/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const saved = await res.json();
          setAttendanceRecords((prev) => {
            const updated = [saved, ...prev.filter((r) => r.id !== record.id)];
            localStorage.setItem('enterprise_attendance_records', JSON.stringify(updated));
            return updated;
          });
          return saved;
        }
      }
    } catch (err) {
      console.warn('Failed to persist attendance record to PostgreSQL:', err);
    }

    setAttendanceRecords((prev) => {
      const updated = [record, ...prev];
      localStorage.setItem('enterprise_attendance_records', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateAttendanceRecord = useCallback(async (id, updatedFields) => {
    try {
      const res = await fetch(`/api/v1/attendance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(updatedFields),
      });
      if (res.ok) {
        const saved = await res.json();
        setAttendanceRecords((prev) => {
          const updated = prev.map((r) => (r.id === id ? { ...r, ...saved } : r));
          localStorage.setItem('enterprise_attendance_records', JSON.stringify(updated));
          return updated;
        });
        return saved;
      }
    } catch (err) {
      console.warn('Failed to update attendance record in PostgreSQL:', err);
    }

    setAttendanceRecords((prev) => {
      const updated = prev.map((r) =>
        r.id === id ? { ...r, ...updatedFields } : r
      );
      localStorage.setItem('enterprise_attendance_records', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteAttendanceRecord = useCallback(async (id) => {
    try {
      await fetch(`/api/v1/attendance/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.warn('Failed to delete attendance record in backend:', err);
    }

    setAttendanceRecords((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      localStorage.setItem('enterprise_attendance_records', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resetToSetup = useCallback(() => {
    window.history.pushState(null, '', '/?view=config');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const closeSetupWizard = useCallback(() => {
    window.history.replaceState(null, '', '/?view=launcher');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  // Refresh attendance when active company/branch context changes
  useEffect(() => {
    if (token && tenancyState.activeOrgId) {
      refreshAttendanceData(token);
    }
  }, [token, tenancyState.activeOrgId, tenancyState.activeBranchId, refreshAttendanceData]);

  const value = useMemo(
    () => ({
      organizations: tenancyState.organizations,
      branches: tenancyState.branches,
      users: tenancyState.users,
      organization_memberships: memberships,
      memberships,
      user_preferences: tenancyState.user_preferences || [],
      attendanceRecords,
      currentUser,
      currentOrganization,
      currentBranch,
      userOrganizations,
      userBranchesInCurrentOrg,
      userMemberships,
      isSuperadmin,
      activeOrgId: tenancyState.activeOrgId,
      activeBranchId: tenancyState.activeBranchId,
      getAuthHeaders,
      switchOrganization,
      switchBranch,
      switchActiveUser,
      selectedBranchIds,
      isAllBranchesSelected,
      activeBranchId,
      toggleBranchSelection,
      selectAllBranches,
      tenantEpoch,
      completeSetupWizard,
      resetToSetup,
      closeSetupWizard,
      createUser,
      updateUser,
      deleteUser,
      requestDataDeletion,
      cancelDataDeletion,
      resetUserPassword,
      addAttendanceRecord,
      updateAttendanceRecord,
      deleteAttendanceRecord,
      refreshTenancyData,
      refreshAttendanceData,
      isTenancyLoading,
    }),
    [
      tenancyState.organizations,
      tenancyState.branches,
      tenancyState.users,
      tenancyState.user_preferences,
      tenancyState.activeOrgId,
      tenancyState.activeBranchId,
      selectedBranchIds,
      isAllBranchesSelected,
      activeBranchId,
      toggleBranchSelection,
      selectAllBranches,
      tenantEpoch,
      memberships,
      attendanceRecords,
      currentUser,
      currentOrganization,
      currentBranch,
      userOrganizations,
      userBranchesInCurrentOrg,
      userMemberships,
      isSuperadmin,
      getAuthHeaders,
      switchOrganization,
      switchBranch,
      switchActiveUser,
      completeSetupWizard,
      resetToSetup,
      closeSetupWizard,
      createUser,
      updateUser,
      deleteUser,
      requestDataDeletion,
      cancelDataDeletion,
      resetUserPassword,
      addAttendanceRecord,
      updateAttendanceRecord,
      deleteAttendanceRecord,
      refreshTenancyData,
      refreshAttendanceData,
      isTenancyLoading,
    ]
  );

  return (
    <TenancyContext.Provider value={value}>{children}</TenancyContext.Provider>
  );
}

export function useTenancy() {
  const context = useContext(TenancyContext);
  if (!context) {
    return {
      organizations: [],
      branches: [],
      users: [],
      organization_memberships: [],
      memberships: [],
      user_preferences: [],
      attendanceRecords: [],
      currentUser: null,
      currentOrganization: null,
      currentBranch: null,
      userOrganizations: [],
      userBranchesInCurrentOrg: [],
      userMemberships: [],
      isSuperadmin: false,
      activeOrgId: null,
      activeBranchId: 'all',
      selectedBranchIds: ['all'],
      isAllBranchesSelected: true,
      tenantEpoch: 0,
      toggleBranchSelection: () => {},
      selectAllBranches: () => {},
      getAuthHeaders: () => ({}),
      switchOrganization: () => {},
      switchBranch: () => {},
      switchActiveUser: () => {},
      completeSetupWizard: () => {},
      resetToSetup: () => {},
      closeSetupWizard: () => {},
      createUser: async () => {},
      updateUser: async () => {},
      deleteUser: async () => {},
      requestDataDeletion: () => {},
      cancelDataDeletion: () => {},
      resetUserPassword: async () => {},
      addAttendanceRecord: async () => {},
      updateAttendanceRecord: async () => {},
      deleteAttendanceRecord: async () => {},
      refreshTenancyData: async () => {},
      refreshAttendanceData: async () => {},
      isTenancyLoading: false,
    };
  }
  return context;
}
