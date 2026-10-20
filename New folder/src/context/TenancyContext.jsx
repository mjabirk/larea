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
  const { isAuthenticated, isLoading, token } = useAuth();
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

  const getAuthHeaders = useCallback((customToken = null) => {
    const activeToken = customToken || token;
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  }, [token]);

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

        setTenancyState((prev) => ({
          ...prev,
          organizations: orgs,
          branches: branches,
          users: users,
          organization_memberships: memberships,
          memberships: memberships,
          activeOrgId: prev.activeOrgId || orgs[0]?.id || null,
          activeBranchId: prev.activeBranchId || branches[0]?.id || null,
          activeUserId: authUid || prev.activeUserId || users[0]?.id || null,
        }));
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
    return (
      tenancyState.organizations.find((o) => o.id === tenancyState.activeOrgId) ||
      tenancyState.organizations[0] ||
      null
    );
  }, [tenancyState.organizations, tenancyState.activeOrgId]);

  const currentBranch = useMemo(() => {
    return (
      tenancyState.branches.find((b) => b.id === tenancyState.activeBranchId) ||
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

  const userOrganizations = useMemo(() => {
    return tenancyState.organizations.filter((o) =>
      userMemberships.some((m) => m.organization_id === o.id)
    );
  }, [tenancyState.organizations, userMemberships]);

  const userBranchesInCurrentOrg = useMemo(() => {
    if (!currentOrganization?.id) return [];
    return tenancyState.branches.filter(
      (b) =>
        b.organization_id === currentOrganization.id &&
        userMemberships.some((m) => m.branch_id === b.id)
    );
  }, [tenancyState.branches, currentOrganization?.id, userMemberships]);

  const switchOrganization = useCallback((orgId) => {
    if (!orgId) return;
    setTenancyState((prev) => {
      if (prev.activeOrgId === orgId) return prev;
      const targetBranches = prev.branches.filter((b) => b.organization_id === orgId);
      return {
        ...prev,
        activeOrgId: orgId,
        activeBranchId: targetBranches[0]?.id || prev.activeBranchId,
      };
    });
  }, []);

  const switchBranch = useCallback((branchId) => {
    if (!branchId) return;
    setTenancyState((prev) => {
      if (prev.activeBranchId === branchId) return prev;
      const targetBranch = prev.branches.find((b) => b.id === branchId);
      return {
        ...prev,
        activeBranchId: branchId,
        activeOrgId: targetBranch ? targetBranch.organization_id : prev.activeOrgId,
      };
    });
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
    }),
    [
      tenancyState.organizations,
      tenancyState.branches,
      tenancyState.users,
      tenancyState.user_preferences,
      memberships,
      attendanceRecords,
      currentUser,
      currentOrganization,
      currentBranch,
      userOrganizations,
      userBranchesInCurrentOrg,
      userMemberships,
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
