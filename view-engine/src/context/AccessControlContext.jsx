import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useTenancy } from './TenancyContext';
import { useAuth } from './AuthContext';
import {
  security_groups,
  app_access_profiles,
  DEFAULT_ROLE_PROFILES,
  MENU_PERMISSIONS,
  normalizeAppId,
} from '../schema/access_control';
import {
  DEFAULT_ROLES,
  INITIAL_ROLE_PERMISSIONS,
  RBAC_ENTITIES,
} from '../schema/rbacSchema';
import { APP_MODULES } from '../registry/moduleRegistry';

const AccessControlContext = createContext(null);

const STORAGE_CUSTOM_ACCESS_KEY = 'enterprise_user_access_control';

export function AccessControlProvider({ children }) {
  const tenancy = useTenancy();
  const auth = useAuth();

  // Active user resolution
  const currentUser = auth?.currentUser || tenancy?.currentUser || null;
  const userMemberships = tenancy?.userMemberships || [];
  const allUsers = tenancy?.users || [];

  // =========================================================================
  // 1. Dynamic Roles Store (Fetched from PostgreSQL backend)
  // =========================================================================
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [rolePermissions, setRolePermissions] = useState(INITIAL_ROLE_PERMISSIONS);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/iam/roles');
      if (res.ok) {
        const data = await res.json();
        const loadedRoles = data.roles || [];
        if (loadedRoles.length > 0) {
          setRoles(loadedRoles);
          const permsMap = {};
          loadedRoles.forEach((r) => {
            if (r.permissions) {
              permsMap[r.id] = r.permissions;
            }
          });
          setRolePermissions((prev) => ({ ...prev, ...permsMap }));
        }
      }
    } catch (e) {
      console.warn('Failed to load roles from backend, falling back to defaults:', e);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Local storage cache for customized user access profile bindings
  const [customUserProfiles, setCustomUserProfiles] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_ACCESS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Failed to load customized access profiles:', e);
      return {};
    }
  });

  // =========================================================================
  // 2. Role CRUD Operations with PostgreSQL Persistence
  // =========================================================================

  /**
   * Create a new custom role with deletion safeguards and initial permissions
   */
  const createRole = useCallback(async (roleData) => {
    const name = (roleData.name || '').trim();
    if (!name) {
      return { success: false, error: 'Role name is required.' };
    }

    const rawCode = (roleData.code || name).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const code = rawCode.startsWith('ROLE_') ? rawCode : `ROLE_${rawCode}`;

    const basePerms = roleData.permissions || {
      attendance_logs: { create: false, read: true, update: false, delete: false },
      organizations: { create: false, read: false, update: false, delete: false },
      users: { create: false, read: false, update: false, delete: false },
    };
    const menuAccess = roleData.menu_access || ['attendances'];

    try {
      const res = await fetch('/api/v1/iam/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          description: (roleData.description || '').trim() || 'Custom user-defined security role.',
          badge_color: roleData.badgeColor || 'amber',
          permissions: basePerms,
          menu_access: menuAccess,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.detail || 'Failed to create role.' };
      }

      const created = await res.json();
      setRoles((prev) => [...prev, created]);
      setRolePermissions((prev) => ({ ...prev, [created.id]: basePerms }));
      return { success: true, role: created };
    } catch (e) {
      console.error('Error creating role:', e);
      return { success: false, error: 'Network error creating role.' };
    }
  }, []);

  /**
   * Update role details
   */
  const updateRole = useCallback(async (roleId, updates) => {
    try {
      const res = await fetch(`/api/v1/iam/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updates.name,
          description: updates.description,
          badge_color: updates.badgeColor,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.detail || 'Failed to update role.' };
      }

      setRoles((prev) =>
        prev.map((r) => (r.id === roleId ? { ...r, ...updates } : r))
      );
      return { success: true };
    } catch (e) {
      console.error('Error updating role:', e);
      return { success: false, error: 'Network error updating role.' };
    }
  }, []);

  /**
   * Delete role with active user assignment safeguard
   */
  const deleteRole = useCallback(
    async (roleId) => {
      const target = roles.find((r) => r.id === roleId);
      if (!target) {
        return { success: false, error: 'Role not found.' };
      }

      // Safeguard 1: System-defined roles are protected
      if (target.is_system) {
        return {
          success: false,
          error: 'System-defined roles are protected and cannot be deleted.',
        };
      }

      // Safeguard 2: Check for active assigned user identities
      const assignedUsers = allUsers.filter((u) => {
        const userRole = (u.role || '').toLowerCase();
        return (
          u.role_id === roleId ||
          userRole === target.name.toLowerCase() ||
          userRole === target.code?.toLowerCase() ||
          userRole === target.id.toLowerCase()
        );
      });

      if (assignedUsers.length > 0) {
        const userListSample = assignedUsers
          .slice(0, 3)
          .map((u) => u.full_name || u.email)
          .join(', ');
        const extraCount = assignedUsers.length > 3 ? ` and ${assignedUsers.length - 3} more` : '';

        return {
          success: false,
          error: `Cannot delete role "${target.name}": ${assignedUsers.length} active user identity(ies) (${userListSample}${extraCount}) are currently assigned to this role. Please reassign all users before deleting.`,
          assignedCount: assignedUsers.length,
          assignedUsers,
        };
      }

      try {
        const res = await fetch(`/api/v1/iam/roles/${roleId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const err = await res.json();
          return { success: false, error: err.detail || 'Failed to delete role.' };
        }

        setRoles((prev) => prev.filter((r) => r.id !== roleId));
        setRolePermissions((prev) => {
          const updated = { ...prev };
          delete updated[roleId];
          return updated;
        });
        return { success: true };
      } catch (e) {
        console.error('Error deleting role:', e);
        return { success: false, error: 'Network error deleting role.' };
      }
    },
    [roles, allUsers]
  );

  /**
   * Update granular CRUD permission for a role on an entity
   */
  const updateRolePermission = useCallback((roleId, entityKey, actionKey, value) => {
    if (roleId === 'role_superadmin') return; // Superadmin privileges are immutable

    setRolePermissions((prev) => {
      const currentRolePerms = prev[roleId] || {};
      const currentEntityPerms = currentRolePerms[entityKey] || {
        create: false,
        read: false,
        update: false,
        delete: false,
      };

      const updatedRolePerms = {
        ...currentRolePerms,
        [entityKey]: {
          ...currentEntityPerms,
          [actionKey]: value,
        },
      };

      // Persist to backend PostgreSQL
      fetch(`/api/v1/iam/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: updatedRolePerms }),
      }).catch((e) => console.warn('Failed to persist permissions to backend:', e));

      return {
        ...prev,
        [roleId]: updatedRolePerms,
      };
    });
  }, []);

  /**
   * Toggle menu navigation visibility for a role
   */
  const toggleRoleMenuAccess = useCallback((roleId, menuId) => {
    if (roleId === 'role_superadmin') return; // Superadmin has unrestricted menu access

    setRoles((prev) => {
      return prev.map((r) => {
        if (r.id !== roleId) return r;

        const currentMenus = Array.isArray(r.menu_access) ? [...r.menu_access] : [];
        const isGranted = currentMenus.includes(menuId);
        const newMenus = isGranted
          ? currentMenus.filter((m) => m !== menuId)
          : [...currentMenus, menuId];

        // Persist to backend PostgreSQL
        fetch(`/api/v1/iam/roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menu_access: newMenus }),
        }).catch((e) => console.warn('Failed to persist menu access to backend:', e));

        return {
          ...r,
          menu_access: newMenus,
        };
      });
    });
  }, []);

  // =========================================================================
  // 3. Resolve Active User's Security Role and Permissions
  // =========================================================================

  const activeRoleId = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.is_superadmin) return 'role_superadmin';

    const rawRole = currentUser.role || userMemberships[0]?.role || 'Standard User';
    const normalized = rawRole.toLowerCase();

    // Check exact match in dynamic roles first
    const matchedRole = roles.find(
      (r) =>
        r.id === currentUser.role_id ||
        r.name.toLowerCase() === normalized ||
        r.code?.toLowerCase() === normalized ||
        r.id.toLowerCase() === normalized
    );

    if (matchedRole) return matchedRole.id;

    if (normalized.includes('superadmin') || normalized.includes('root')) return 'role_superadmin';
    if (normalized.includes('ops') || normalized.includes('operation')) return 'role_ops_lead';
    if (normalized.includes('supervisor')) return 'role_supervisor';
    return 'role_standard';
  }, [currentUser, userMemberships, roles]);

  // Resolve assigned App Access Profiles for current user
  const assignedProfileIds = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.is_superadmin) {
      return app_access_profiles.map((p) => p.id);
    }

    if (customUserProfiles[currentUser.id]) {
      return customUserProfiles[currentUser.id];
    }

    if (Array.isArray(currentUser.app_access_profiles) && currentUser.app_access_profiles.length > 0) {
      return currentUser.app_access_profiles;
    }

    return DEFAULT_ROLE_PROFILES[activeRoleId] || DEFAULT_ROLE_PROFILES.role_standard || [];
  }, [currentUser, activeRoleId, customUserProfiles]);

  // Full assigned profile objects
  const userProfiles = useMemo(() => {
    return app_access_profiles.filter((p) => assignedProfileIds.includes(p.id));
  }, [assignedProfileIds]);

  // Union of atomic security groups granted to current user
  const userSecurityGroups = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.is_superadmin) {
      return security_groups.map((g) => g.key);
    }

    const groupSet = new Set();
    userProfiles.forEach((profile) => {
      (profile.granted_groups || []).forEach((grp) => groupSet.add(grp));
    });

    const activePerms = rolePermissions[activeRoleId] || {};
    if (activePerms.attendance_logs?.read) groupSet.add('attendance.read');
    if (activePerms.attendance_logs?.create || activePerms.attendance_logs?.update) groupSet.add('attendance.write');
    if (activePerms.attendance_logs?.delete) groupSet.add('attendance.delete');
    if (activePerms.organizations?.read) groupSet.add('org.read');
    if (activePerms.organizations?.create || activePerms.organizations?.update) groupSet.add('org.manage');
    if (activePerms.users?.read) groupSet.add('users.read');
    if (activePerms.users?.create || activePerms.users?.update) groupSet.add('users.manage');

    if (Array.isArray(currentUser.security_groups)) {
      currentUser.security_groups.forEach((grp) => groupSet.add(grp));
    }

    return Array.from(groupSet);
  }, [currentUser, userProfiles, rolePermissions, activeRoleId]);

  const securityGroupLookup = useMemo(() => {
    return new Set(userSecurityGroups);
  }, [userSecurityGroups]);

  /**
   * Check if user has permission for a specific atomic security group
   */
  const hasPermission = useCallback(
    (permission, requireAll = false) => {
      if (!currentUser) return false;
      if (currentUser.is_superadmin) return true;
      if (!permission) return true;

      if (Array.isArray(permission)) {
        if (permission.length === 0) return true;
        if (requireAll) {
          return permission.every((p) => securityGroupLookup.has(p));
        }
        return permission.some((p) => securityGroupLookup.has(p));
      }

      return securityGroupLookup.has(permission);
    },
    [currentUser, securityGroupLookup]
  );

  /**
   * Check if user has access to an entire application module
   */
  const hasAppAccess = useCallback(
    (appId) => {
      if (!currentUser) return false;
      if (currentUser.is_superadmin) return true;
      if (!appId) return false;

      const normAppId = normalizeAppId(appId);

      const hasMatchingProfile = userProfiles.some(
        (p) => normalizeAppId(p.app_id) === normAppId
      );
      if (hasMatchingProfile) return true;

      const hasMatchingGroup = security_groups.some(
        (g) => normalizeAppId(g.app_id) === normAppId && securityGroupLookup.has(g.key)
      );
      if (hasMatchingGroup) return true;

      // Check if user's role has any menu access in this module
      const targetMod = APP_MODULES.find((m) => m.id === appId);
      const currentRole = roles.find((r) => r.id === activeRoleId);
      if (targetMod && currentRole?.menu_access) {
        if (targetMod.menus.some((m) => currentRole.menu_access.includes(m.id))) {
          return true;
        }
      }

      return false;
    },
    [currentUser, userProfiles, securityGroupLookup, roles, activeRoleId]
  );

  /**
   * Check if user has permission for a specific sub-menu / model
   */
  const hasMenuAccess = useCallback(
    (menuId) => {
      if (!currentUser) return false;
      if (currentUser.is_superadmin) return true;

      // 1. Check role menu_access from active role
      const currentRole = roles.find((r) => r.id === activeRoleId);
      if (currentRole && Array.isArray(currentRole.menu_access)) {
        if (currentRole.menu_access.includes(menuId)) {
          return true;
        }
      }

      // 2. Check menu required_groups from module registry
      for (const mod of APP_MODULES) {
        const foundMenu = mod.menus?.find((m) => m.id === menuId);
        if (foundMenu?.required_groups) {
          const hasGroup = foundMenu.required_groups.some((grp) =>
            securityGroupLookup.has(grp) || (currentUser.security_groups || []).includes(grp)
          );
          if (hasGroup) return true;
        }
      }

      // 3. Fallback to MENU_PERMISSIONS lookup
      const reqPermission = MENU_PERMISSIONS[menuId];
      if (reqPermission) {
        return hasPermission(reqPermission);
      }

      return false;
    },
    [currentUser, activeRoleId, roles, securityGroupLookup, hasPermission]
  );

  const value = {
    roles,
    rolePermissions,
    activeRoleId,
    userProfiles,
    userSecurityGroups,
    hasPermission,
    hasAppAccess,
    hasMenuAccess,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermission,
    toggleRoleMenuAccess,
    refreshRoles: fetchRoles,
  };

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

export function useAccessControl() {
  const context = useContext(AccessControlContext);
  if (!context) {
    throw new Error('useAccessControl must be used within an AccessControlProvider');
  }
  return context;
}
