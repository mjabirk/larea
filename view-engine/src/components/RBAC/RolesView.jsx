import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Building2,
  Clock,
  Check,
  X,
  Lock,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  Layers,
  KeyRound,
  Shield,
  Cpu,
  Banknote,
  SlidersHorizontal,
} from 'lucide-react';
import { useAccessControl } from '../../context/AccessControlContext';
import { useTenancy } from '../../context/TenancyContext';
import { useLocale } from '../../context/LocaleContext';
import { RBAC_ENTITIES } from '../../schema/rbacSchema';
import { APP_MODULES } from '../../registry/moduleRegistry';

const MODULE_ICON_MAP = {
  Users,
  Shield,
  Cpu,
  Banknote,
};

const CRUD_ACTIONS = [
  { key: 'create', label: 'Create', desc: 'Can insert new records', color: 'emerald' },
  { key: 'read', label: 'Read', desc: 'Can query & view record details', color: 'blue' },
  { key: 'update', label: 'Update', desc: 'Can edit existing fields & state', color: 'amber' },
  { key: 'delete', label: 'Delete', desc: 'Can archive or hard delete records', color: 'rose' },
];

const PRESET_COLORS = [
  { id: 'blue', label: 'Blue', bg: 'bg-blue-600', ring: 'ring-blue-500' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-600', ring: 'ring-indigo-500' },
  { id: 'violet', label: 'Violet', bg: 'bg-violet-600', ring: 'ring-violet-500' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-600', ring: 'ring-emerald-500' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-600', ring: 'ring-amber-500' },
  { id: 'rose', label: 'Rose', bg: 'bg-rose-600', ring: 'ring-rose-500' },
  { id: 'teal', label: 'Teal', bg: 'bg-teal-600', ring: 'ring-teal-500' },
];

export function RolesView() {
  const {
    roles,
    rolePermissions,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermission,
    updateRoleEntityPermissions,
    toggleRoleMenuAccess,
    refreshRoles,
    resetRolesToDefaults,
  } = useAccessControl();

  const { users, refreshTenancyData } = useTenancy();
  const { t } = useLocale();

  useEffect(() => {
    if (refreshRoles) refreshRoles();
    if (refreshTenancyData) refreshTenancyData();
  }, []);

  const [selectedRoleId, setSelectedRoleId] = useState('role_ops_lead');
  const [roleSearch, setRoleSearch] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // View mode & state
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'form'
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, role: null, safeguardError: null });
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Create form state
  const [newRoleData, setNewRoleData] = useState({
    name: '',
    code: '',
    description: '',
    badgeColor: 'amber',
    cloneFromId: 'role_standard',
  });
  const [createError, setCreateError] = useState('');

  // Edit form state
  const [editRoleData, setEditRoleData] = useState({
    id: '',
    name: '',
    code: '',
    description: '',
    badgeColor: 'blue',
  });
  const [editError, setEditError] = useState('');

  // Find currently selected role (or fallback to first)
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || roles[0] || null;
  }, [roles, selectedRoleId]);

  const isSuperadmin = selectedRole?.id === 'role_superadmin';

  // Count assigned users per role
  const roleUserCounts = useMemo(() => {
    const counts = {};
    (roles || []).forEach((r) => {
      const rName = String(r?.name || '').toLowerCase();
      const rCode = String(r?.code || '').toLowerCase();
      const rId = String(r?.id || '').toLowerCase();
      counts[r.id] = (users || []).filter((u) => {
        const userRole = String(u?.role || '').toLowerCase();
        return (
          Boolean(u?.role_id && u.role_id === r.id) ||
          Boolean(userRole && (userRole === rName || (rCode && userRole === rCode) || (rId && userRole === rId)))
        );
      }).length;
    });
    return counts;
  }, [roles, users]);

  // Filtered roles by search query
  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return roles;
    return (roles || []).filter((r) => {
      const rName = String(r?.name || '').toLowerCase();
      const rCode = String(r?.code || '').toLowerCase();
      const rDesc = String(r?.description || '').toLowerCase();
      return rName.includes(q) || rCode.includes(q) || rDesc.includes(q);
    });
  }, [roles, roleSearch]);

  // Handle Toggle Permission
  const handleToggle = (roleId, entityKey, actionKey) => {
    if (roleId === 'role_superadmin') return;
    const rolePerms = rolePermissions[roleId] || {};
    const entityPerms = rolePerms[entityKey] || { create: false, read: false, update: false, delete: false };
    const nextValue = !entityPerms[actionKey];
    updateRolePermission(roleId, entityKey, actionKey, nextValue);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleToggleAllForEntity = (roleId, entityKey, enableAll) => {
    if (roleId === 'role_superadmin') return;
    const allPerms = {};
    CRUD_ACTIONS.forEach((action) => {
      allPerms[action.key] = enableAll;
    });
    if (updateRoleEntityPermissions) {
      updateRoleEntityPermissions(roleId, entityKey, allPerms);
    } else {
      CRUD_ACTIONS.forEach((action) => {
        updateRolePermission(roleId, entityKey, action.key, enableAll);
      });
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Open Create Form (In-Place Form View)
  const handleOpenCreateForm = () => {
    setNewRoleData({
      name: '',
      code: '',
      description: '',
      badgeColor: 'amber',
      cloneFromId: 'role_standard',
    });
    setCreateError('');
    setIsDirty(false);
    setViewMode('form');
  };

  const handleCreateSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingCreate) return;

    const trimmedName = newRoleData.name.trim();
    if (!trimmedName) {
      setCreateError('Role name is required.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError('');

    try {
      // Clone base permissions & menu access from source role
      const sourceRole = roles.find((r) => r.id === newRoleData.cloneFromId);
      const sourcePerms = rolePermissions[newRoleData.cloneFromId] || sourceRole?.permissions || {
        attendance_logs: { create: false, read: true, update: false, delete: false },
        organizations: { create: false, read: false, update: false, delete: false },
        users: { create: false, read: false, update: false, delete: false },
      };
      const sourceMenuAccess = sourceRole?.menu_access || ['attendances'];

      const result = await createRole({
        name: trimmedName,
        code: newRoleData.code,
        description: newRoleData.description,
        badgeColor: newRoleData.badgeColor,
        permissions: JSON.parse(JSON.stringify(sourcePerms)),
        menu_access: sourceMenuAccess,
      });

      if (!result.success) {
        setCreateError(result.error || 'Failed to create role.');
        return;
      }

      // Clear form inputs, reset dirty state, and select the newly created role in the sidebar
      setNewRoleData({
        name: '',
        code: '',
        description: '',
        badgeColor: 'amber',
        cloneFromId: 'role_standard',
      });
      setCreateError('');
      setIsDirty(false);
      setViewMode('list');

      if (refreshRoles) {
        await refreshRoles();
      }

      const newId = result.role?.id;
      if (newId) {
        setSelectedRoleId(newId);
      }
    } catch (err) {
      console.error('Failed to create role:', err);
      setCreateError('An unexpected error occurred while creating role.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (role) => {
    setEditRoleData({
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      badgeColor: role.badgeColor || 'blue',
      is_system: role.is_system,
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editRoleData.name.trim()) {
      setEditError('Role name is required.');
      return;
    }

    const result = await updateRole(editRoleData.id, editRoleData);
    if (!result.success) {
      setEditError(result.error || 'Failed to update role.');
      return;
    }

    setIsEditModalOpen(false);
    if (refreshRoles) {
      await refreshRoles();
    }
  };

  // Open Delete Safeguard Modal
  const handleOpenDeleteModal = (role) => {
    if (role.is_system) {
      setDeleteModalState({
        isOpen: true,
        role,
        safeguardError: 'System-defined role: Protected from deletion or slug modification under governance rules.',
      });
      return;
    }

    // Check assigned users safeguard
    const roleName = String(role?.name || '').toLowerCase();
    const roleCode = String(role?.code || '').toLowerCase();
    const roleId = String(role?.id || '').toLowerCase();
    const assigned = (users || []).filter((u) => {
      const userRole = String(u?.role || '').toLowerCase();
      return (
        Boolean(u?.role_id && u.role_id === role?.id) ||
        Boolean(userRole && (userRole === roleName || (roleCode && userRole === roleCode) || (roleId && userRole === roleId)))
      );
    });

    if (assigned.length > 0) {
      setDeleteModalState({
        isOpen: true,
        role,
        assignedUsers: assigned,
        safeguardError: `Cannot delete role "${role.name}": ${assigned.length} user identity(ies) are currently assigned to this role. Please reassign active users before deleting.`,
      });
      return;
    }

    // Safe to delete confirmation
    setDeleteModalState({
      isOpen: true,
      role,
      assignedUsers: [],
      safeguardError: null,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalState.role || isSubmittingDelete) return;
    setIsSubmittingDelete(true);

    try {
      const deletedRoleId = deleteModalState.role.id;
      const result = await deleteRole(deletedRoleId);

      if (result.success) {
        // Await the deletion handler and immediately close the confirmation modal upon successful deletion
        setDeleteModalState({ isOpen: false, role: null, safeguardError: null, assignedUsers: [] });

        // Reset the selected role to the default role and refresh the sidebar list
        const defaultRole = roles.find((r) => r.id === 'role_ops_lead') || roles.find((r) => r.is_system) || roles[0];
        setSelectedRoleId(defaultRole?.id || 'role_ops_lead');

        if (refreshRoles) {
          await refreshRoles();
        }
      } else {
        setDeleteModalState((prev) => ({
          ...prev,
          safeguardError: result.error,
        }));
      }
    } catch (err) {
      console.error('Failed to delete role:', err);
      setDeleteModalState((prev) => ({
        ...prev,
        safeguardError: 'An unexpected error occurred while deleting role.',
      }));
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  if (viewMode === 'form') {
    const selectedSourceRole = roles.find((r) => r.id === newRoleData.cloneFromId);
    const selectedBadgePreset = PRESET_COLORS.find((c) => c.id === newRoleData.badgeColor) || PRESET_COLORS[0];

    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
        {/* Top Control Bar Breadcrumb */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Breadcrumbs & Back */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Discard and return to roles list?")) return;
                setViewMode('list');
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Roles</span>
            </button>

            <span className="text-slate-400">/</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {newRoleData.name || 'New Custom Role'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200">
              New Role
            </span>
          </div>

          {/* Right: Save Changes and Discard / Back */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleCreateSubmit}
              disabled={!isDirty || isSubmittingCreate || !newRoleData.name.trim()}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer ${
                isDirty && newRoleData.name.trim() && !isSubmittingCreate
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmittingCreate ? 'Saving...' : 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Discard?")) return;
                setNewRoleData({
                  name: '',
                  code: '',
                  description: '',
                  badgeColor: 'amber',
                  cloneFromId: 'role_standard',
                });
                setIsDirty(false);
                setViewMode('list');
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard / Back</span>
            </button>
          </div>
        </div>

        {createError && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{createError}</span>
            </div>
            <button
              type="button"
              onClick={() => setCreateError('')}
              className="text-rose-700 dark:text-rose-400 hover:text-rose-900 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 12-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Form (8 Cols) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Role Configuration & Inheritance
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Role Name */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Role Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRoleData.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      const autoCode = val.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                      setNewRoleData((prev) => ({
                        ...prev,
                        name: val,
                        code: prev.code ? prev.code : `ROLE_${autoCode}`,
                      }));
                      setIsDirty(true);
                    }}
                    placeholder="e.g. Shift Quality Auditor"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    required
                  />
                </div>

                {/* Role Code / Slug */}
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Role Code / Slug (Unique identifier)
                  </label>
                  <input
                    type="text"
                    value={newRoleData.code}
                    onChange={(e) => {
                      setNewRoleData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }));
                      setIsDirty(true);
                    }}
                    placeholder="e.g. ROLE_SHIFT_AUDITOR"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>

                {/* Clone From Template */}
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Initial Permission Template (Clone from)
                  </label>
                  <select
                    value={newRoleData.cloneFromId}
                    onChange={(e) => {
                      setNewRoleData((prev) => ({ ...prev, cloneFromId: e.target.value }));
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        Clone from {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Description & Operational Scope
                  </label>
                  <textarea
                    rows={3}
                    value={newRoleData.description}
                    onChange={(e) => {
                      setNewRoleData((prev) => ({ ...prev, description: e.target.value }));
                      setIsDirty(true);
                    }}
                    placeholder="Brief explanation of responsibilities and scope..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Template Inherited Permissions Summary Card */}
            {selectedSourceRole && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Template Permissions Inherited from: {selectedSourceRole.name}
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This custom role will be provisioned with the full baseline permissions and menu entitlements of <strong className="text-slate-700 dark:text-slate-200">{selectedSourceRole.name}</strong>. After saving, you can freely tune individual entity CRUD flags and navigation menus.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(selectedSourceRole.menu_access || []).map((mId) => (
                    <span key={mId} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-mono">
                      {mId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Rail (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Visual Accent & Badge Preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Visual Badge Accent
                </h3>
              </div>

              <div className="space-y-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">
                  Select an accent color for user profile chips and identity badges:
                </span>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setNewRoleData((prev) => ({ ...prev, badgeColor: preset.id }));
                        setIsDirty(true);
                      }}
                      className={`w-7 h-7 rounded-full ${preset.bg} cursor-pointer transition flex items-center justify-center ${
                        newRoleData.badgeColor === preset.id ? `ring-2 ring-offset-2 ${preset.ring} scale-110` : 'opacity-80 hover:opacity-100'
                      }`}
                      title={preset.label}
                    >
                      {newRoleData.badgeColor === preset.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400 block mb-1">Badge Preview:</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${selectedBadgePreset.bg} text-white shadow-xs`}>
                    <Shield className="w-3.5 h-3.5" />
                    <span>{newRoleData.name || 'New Custom Role'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Governance Info Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <Info className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Governance Policy
                </h4>
              </div>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-2 list-disc list-inside">
                <li>Custom roles are isolated per tenant and can be deleted when no active users are assigned.</li>
                <li>Changes to role permissions take effect immediately for active user sessions.</li>
                <li>System-defined root roles cannot be renamed or deleted.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 animate-fadeIn">
      {/* Top Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200/80 dark:border-blue-800/60">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero-Trust Authorization & Dynamic RBAC Engine</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Security Roles & Permission Matrix
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Configure system and user-defined roles with granular CRUD rights across domain entities. System roles are protected against accidental deletion.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenCreateForm}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Custom Role</span>
          </button>

          <button
            type="button"
            onClick={resetRolesToDefaults}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Reset to Factory Defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Roles Sidebar (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Configured Roles ({roles.length})
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {roles.filter((r) => r.is_system).length} System • {roles.filter((r) => !r.is_system).length} Custom
            </span>
          </div>

          {/* Quick Search Roles */}
          <div className="relative">
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Filter roles by name or slug..."
              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Role Cards List */}
          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filteredRoles.map((role) => {
              const isSelected = role.id === selectedRole?.id;
              const userCount = roleUserCounts[role.id] || 0;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full p-4 rounded-xl border text-left rtl:text-right transition cursor-pointer flex flex-col gap-2 ${isSelected
                    ? 'bg-blue-50/60 dark:bg-slate-800/90 border-blue-500 dark:border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {role.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {role.is_system ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                          <Lock className="w-2.5 h-2.5" />
                          <span>SYSTEM</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          CUSTOM
                        </span>
                      )}

                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {userCount} {userCount === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                    {role.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[10px] font-mono text-slate-400">
                    <span>{role.code}</span>
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                      <span>Inspect Permissions</span>
                      <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Role Permission Editor & Management (8 Cols) */}
        {selectedRole && (
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6">
              {/* Role Header Info & Management Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {selectedRole.name}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      {selectedRole.code}
                    </span>
                    {selectedRole.is_system ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                        <Lock className="w-3 h-3" />
                        <span>System Protected</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <span>User-Defined Custom</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                    {selectedRole.description}
                  </p>
                </div>

                {/* Edit & Delete Role Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedRole)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-xs flex items-center gap-1"
                    title="Edit role details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit Details</span>
                  </button>

                  {!selectedRole.is_system ? (
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(selectedRole)}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer text-xs flex items-center gap-1 font-medium"
                      title="Delete role (with safeguard check)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Delete Role</span>
                    </button>
                  ) : (
                    <div
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 text-xs flex items-center gap-1 cursor-not-allowed opacity-60"
                      title="System roles cannot be deleted"
                    >
                      <Lock className="w-3 h-3" />
                      <span className="hidden sm:inline">Protected</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Superadmin Lockout Notice */}
              {isSuperadmin && (
                <div className="p-3.5 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 flex items-center gap-2.5 text-xs text-violet-800 dark:text-violet-300">
                  <Lock className="w-4 h-4 shrink-0 text-violet-500" />
                  <span>
                    <strong>Root Superadmin privileges are immutable:</strong> All domain models and CRUD actions are unconditionally permitted to maintain platform governance.
                  </span>
                </div>
              )}

              {/* Entity Permissions Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Granular Entity Authorizations
                  </span>
                  {!isSuperadmin && (
                    <span className="text-[11px] text-slate-400">
                      Changes persist automatically to RBAC security matrix
                    </span>
                  )}
                </div>

                {RBAC_ENTITIES.map((entity) => {
                  const rolePerms = rolePermissions[selectedRole.id] || {};
                  const entityPerms = rolePerms[entity.key] || {
                    create: false,
                    read: false,
                    update: false,
                    delete: false,
                  };

                  return (
                    <div
                      key={entity.key}
                      className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400">
                            {entity.key === 'attendance_logs' && <Clock className="w-4 h-4" />}
                            {entity.key === 'organizations' && <Building2 className="w-4 h-4" />}
                            {entity.key === 'users' && <Users className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {entity.name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {entity.description}
                            </div>
                          </div>
                        </div>

                        {!isSuperadmin && (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleToggleAllForEntity(selectedRole.id, entity.key, true)}
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer text-[11px]"
                            >
                              Grant All
                            </button>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <button
                              type="button"
                              onClick={() => handleToggleAllForEntity(selectedRole.id, entity.key, false)}
                              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer text-[11px]"
                            >
                              Revoke All
                            </button>
                          </div>
                        )}
                      </div>

                      {/* CRUD Checkbox Group */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        {CRUD_ACTIONS.map((action) => {
                          const isEnabled = isSuperadmin ? true : Boolean(entityPerms[action.key]);

                          return (
                            <button
                              key={action.key}
                              type="button"
                              disabled={isSuperadmin}
                              onClick={() => handleToggle(selectedRole.id, entity.key, action.key)}
                              className={`p-3 rounded-lg border text-left rtl:text-right transition flex items-center justify-between ${isSuperadmin
                                ? 'bg-violet-50/40 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 cursor-not-allowed opacity-90'
                                : isEnabled
                                  ? 'bg-white dark:bg-slate-800 border-blue-500 dark:border-blue-500 shadow-2xs cursor-pointer'
                                  : 'bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100 cursor-pointer'
                                }`}
                            >
                              <div>
                                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                                  {action.label}
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {action.desc}
                                </span>
                              </div>

                              <div
                                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition ${isEnabled
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800'
                                  }`}
                              >
                                {isEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ========================================================================= */}
              {/* NAVIGATION & MENU ACCESS SECTION */}
              {/* ========================================================================= */}
              <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Navigation & Menu Access
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Govern visibility and launch permissions for workspaces and sub-navigation menus.
                    </p>
                  </div>
                  {!isSuperadmin && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      Stored in PostgreSQL roles.menu_access
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {APP_MODULES.map((module) => {
                    const ModIcon = MODULE_ICON_MAP[module.iconName] || Layers;
                    const roleMenuAccess = selectedRole?.menu_access || [];

                    return (
                      <div
                        key={module.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] shadow-2xs"
                            style={{ backgroundColor: module.color }}
                          >
                            <ModIcon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-xs text-slate-900 dark:text-white block">
                              {module.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Workspace: {module.id}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 ml-auto bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {module.menus?.length} menus
                          </span>
                        </div>

                        <div className="space-y-2 pt-1">
                          {(module.menus || []).map((menu) => {
                            const isMenuAllowed = isSuperadmin ? true : roleMenuAccess.includes(menu.id);

                            return (
                              <button
                                key={menu.id}
                                type="button"
                                disabled={isSuperadmin}
                                onClick={() => toggleRoleMenuAccess && toggleRoleMenuAccess(selectedRole.id, menu.id)}
                                className={`w-full p-2.5 rounded-lg border text-left rtl:text-right transition flex items-center justify-between ${isSuperadmin
                                  ? 'bg-violet-50/40 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 cursor-not-allowed opacity-90'
                                  : isMenuAllowed
                                    ? 'bg-white dark:bg-slate-800 border-blue-500 dark:border-blue-500 shadow-2xs cursor-pointer'
                                    : 'bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100 cursor-pointer'
                                  }`}
                              >
                                <div className="pr-2 truncate">
                                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 block truncate">
                                    {menu.label}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-mono text-slate-400">
                                      id: {menu.id}
                                    </span>
                                    {menu.required_groups && menu.required_groups.length > 0 && (
                                      <span className="text-[9px] font-mono text-blue-500 dark:text-blue-400 truncate max-w-[150px]">
                                        grp: {menu.required_groups[0]}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition ${isMenuAllowed
                                    ? 'bg-blue-600 text-white'
                                    : 'border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800'
                                    }`}
                                >
                                  {isMenuAllowed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>



      {/* ========================================================================= */}
      {/* MODAL 2: EDIT ROLE DETAILS */}
      {/* ========================================================================= */}
      {isEditModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[90vh]"
          >
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Edit Role Details</h3>
                  <p className="text-[11px] text-slate-400">Update metadata and labels for {editRoleData.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 text-xs">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editRoleData.name}
                  onChange={(e) => setEditRoleData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {!editRoleData.is_system && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                    Role Code / Slug
                  </label>
                  <input
                    type="text"
                    value={editRoleData.code}
                    onChange={(e) => setEditRoleData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editRoleData.description}
                  onChange={(e) => setEditRoleData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE ROLE SAFEGUARD MODAL */}
      {/* ========================================================================= */}
      {deleteModalState.isOpen && createPortal(
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteModalState({ isOpen: false, role: null, safeguardError: null })}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[90vh]"
          >
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-600/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">
                    {deleteModalState.safeguardError ? 'Role Deletion Safeguard' : 'Confirm Role Deletion'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Target: {deleteModalState.role?.name} ({deleteModalState.role?.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalState({ isOpen: false, role: null, safeguardError: null })}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {deleteModalState.safeguardError ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>Deletion Safeguard Triggered</span>
                    </div>
                    <p className="leading-relaxed">
                      {deleteModalState.safeguardError}
                    </p>
                  </div>

                  {deleteModalState.assignedUsers && deleteModalState.assignedUsers.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">
                        Assigned User Accounts ({deleteModalState.assignedUsers.length}):
                      </span>
                      <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50">
                        {deleteModalState.assignedUsers.map((u) => (
                          <div key={u.id} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-200 dark:border-slate-800 last:border-0">
                            <span className="font-semibold text-slate-900 dark:text-white">{u.full_name}</span>
                            <span className="font-mono text-slate-400">{u.email}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    To maintain zero-trust security and prevent orphaned identities, all users assigned to this role must be reassigned to another role before this role can be removed.
                  </p>

                  <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDeleteModalState({ isOpen: false, role: null, safeguardError: null })}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                    >
                      Understood
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    Are you sure you want to permanently delete custom role <strong>{deleteModalState.role?.name}</strong>?
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    This role currently has <strong>0 assigned users</strong>. Deleting it will permanently purge its permissions configuration from the RBAC security matrix.
                  </p>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDeleteModalState({ isOpen: false, role: null, safeguardError: null })}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingDelete}
                      onClick={handleConfirmDelete}
                      className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      {isSubmittingDelete ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Deleting Role...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Permanently Delete Role</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Alias for backward compatibility
export const PermissionMatrix = RolesView;
