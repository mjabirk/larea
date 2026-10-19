import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

export function TenancyProvider({ children }) {
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

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch live Tenancy & User data from PostgreSQL backend
  const refreshTenancyData = useCallback(async () => {
    try {
      const [tenancyRes, usersRes] = await Promise.all([
        fetch('/api/v1/iam/tenancy', { headers: getAuthHeaders() }).catch(() => null),
        fetch('/api/v1/iam/users', { headers: getAuthHeaders() }).catch(() => null),
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

        const getAuthenticatedUserId = () => {
          try {
            const raw = typeof window !== 'undefined'
              ? (localStorage.getItem('enterprise_session_cache') || sessionStorage.getItem('enterprise_session_cache'))
              : null;
            if (raw) {
              const parsed = JSON.parse(raw);
              return parsed?.user?.id || parsed?.id || null;
            }
          } catch (e) {
            // ignore
          }
          return null;
        };

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
    }
  }, []);

  const refreshAttendanceData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/attendance', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.records && Array.isArray(data.records) && data.records.length > 0) {
          setAttendanceRecords(data.records);
          localStorage.setItem('enterprise_attendance_records', JSON.stringify(data.records));
        }
      }
    } catch (e) {
      console.warn('Failed to load attendance records from backend:', e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initializeData = async () => {
      try {
        await refreshTenancyData();
        if (isMounted) {
          await refreshAttendanceData();
        }
      } catch (err) {
        console.warn('Initial data load error:', err);
      }
    };
    initializeData();
    return () => {
      isMounted = false;
    };
  }, [refreshTenancyData, refreshAttendanceData]);

  // Synchronize activeUserId with logged-in user session in storage
  useEffect(() => {
    const syncAuthUser = () => {
      const authUid = getAuthenticatedUserId();
      if (authUid && tenancyState.activeUserId !== authUid) {
        setTenancyState((prev) => ({
          ...prev,
          activeUserId: authUid,
        }));
      }
    };
    syncAuthUser();
    window.addEventListener('storage', syncAuthUser);
    return () => window.removeEventListener('storage', syncAuthUser);
  }, [tenancyState.activeUserId]);

  // Active entities
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

  const currentAuthUid = getAuthenticatedUserId();
  const targetUserId = currentAuthUid || tenancyState.activeUserId;
  const currentUser =
    (targetUserId ? tenancyState.users.find((u) => u.id === targetUserId) : null) ||
    (!currentAuthUid ? tenancyState.users[0] : null) ||
    null;

  const currentOrganization =
    tenancyState.organizations.find((o) => o.id === tenancyState.activeOrgId) ||
    tenancyState.organizations[0] ||
    null;

  const currentBranch =
    tenancyState.branches.find((b) => b.id === tenancyState.activeBranchId) ||
    tenancyState.branches[0] ||
    null;

  const memberships =
    tenancyState.organization_memberships || tenancyState.memberships || [];

  const userMemberships = memberships.filter((m) => m.user_id === currentUser?.id);
  const userOrganizations = tenancyState.organizations.filter((o) =>
    userMemberships.some((m) => m.organization_id === o.id)
  );
  const userBranchesInCurrentOrg = tenancyState.branches.filter(
    (b) =>
      b.organization_id === currentOrganization?.id &&
      userMemberships.some((m) => m.branch_id === b.id)
  );

  const switchOrganization = (orgId) => {
    const targetBranches = tenancyState.branches.filter(
      (b) => b.organization_id === orgId
    );
    setTenancyState((prev) => ({
      ...prev,
      activeOrgId: orgId,
      activeBranchId: targetBranches[0]?.id || prev.activeBranchId,
    }));
  };

  const switchBranch = (branchId) => {
    const targetBranch = tenancyState.branches.find((b) => b.id === branchId);
    setTenancyState((prev) => ({
      ...prev,
      activeBranchId: branchId,
      activeOrgId: targetBranch ? targetBranch.organization_id : prev.activeOrgId,
    }));
  };

  const switchActiveUser = (userId) => {
    setTenancyState((prev) => ({
      ...prev,
      activeUserId: userId,
    }));
  };

  // Complete setup wizard helper
  const completeSetupWizard = ({ orgData, adminData, prefData }) => {
    // Re-sync directly from PostgreSQL
    refreshTenancyData();
    return {
      newUser: {
        email: adminData.email,
        full_name: adminData.full_name,
        is_superadmin: true,
      },
    };
  };

  // Create User: Persists to PostgreSQL via POST /api/v1/iam/users
  const createUser = async ({
    full_name,
    email,
    role,
    branch_id,
    initial_password,
    date_of_birth,
    age,
    guardian_name,
    guardian_email,
  }) => {
    const targetBranchId = branch_id || currentBranch?.id || tenancyState.branches[0]?.id;
    const targetOrgId = currentOrganization?.id || tenancyState.organizations[0]?.id;

    try {
      const res = await fetch('/api/v1/iam/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          full_name,
          email,
          role,
          branch_id: targetBranchId,
          organization_id: targetOrgId,
          initial_password: initial_password || 'InitPass@2026',
          date_of_birth,
          age,
          guardian_name,
          guardian_email,
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
  };

  // Update User: Persists to PostgreSQL via PUT /api/v1/iam/users/{id}
  const updateUser = async (userId, updatedFields) => {
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
  };

  // Reset User Password: Calls POST /api/v1/iam/users/{id}/reset-password
  const resetUserPassword = async (userId, newPassword) => {
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
  };

  // Delete User: Calls DELETE /api/v1/iam/users/{id}
  const deleteUser = async (userId) => {
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
  };

  const requestDataDeletion = (userId, deletionMetadata = {}) => {
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
  };

  const cancelDataDeletion = (userId) => {
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
  };

  // Attendance management (persisted to PostgreSQL /api/v1/attendance)
  const addAttendanceRecord = async (record) => {
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
  };

  const updateAttendanceRecord = async (id, updatedFields) => {
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
  };

  const deleteAttendanceRecord = async (id) => {
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
  };

  const value = {
    organizations: tenancyState.organizations,
    branches: tenancyState.branches,
    users: tenancyState.users,
    organization_memberships: memberships,
    memberships: memberships,
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
  };

  return (
    <TenancyContext.Provider value={value}>{children}</TenancyContext.Provider>
  );
}

export function useTenancy() {
  const context = useContext(TenancyContext);
  if (!context) {
    throw new Error('useTenancy must be used within a TenancyProvider');
  }
  return context;
}
