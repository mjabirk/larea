import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';
import { DeleteBlockedModal } from '../common/DeleteBlockedModal';

export function OrganizationsView() {
  const { organizations, branches, refreshTenancyData, isTenancyLoading } = useTenancy();
  const { getAuthHeaders } = useAuth();

  const [feedback, setFeedback] = useState(null);
  const [editingOrg, setEditingOrg] = useState(null);
  const [isOrgDirty, setIsOrgDirty] = useState(false);
  const [branchModal, setBranchModal] = useState({ isOpen: false, isEdit: false, data: null });
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'

  // Relational deletion blockage state
  const [blockedError, setBlockedError] = useState(null);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);

  // Organization creation state
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);
  const [newOrgData, setNewOrgData] = useState({
    legal_name: '',
    tax_id: '',
    base_currency: 'QAR',
    default_timezone: 'Asia/Qatar',
    default_locale: 'en',
  });

  React.useEffect(() => {
    if (refreshTenancyData) {
      refreshTenancyData();
    }
  }, []);

  const showToast = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgData.legal_name.trim()) return;
    setIsSubmittingOrg(true);
    try {
      const res = await fetch('/api/v1/iam/organizations', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newOrgData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create organization');
      }
      showToast(`Organization "${newOrgData.legal_name}" created with primary operating branch.`);
      setIsCreatingOrg(false);
      setNewOrgData({
        legal_name: '',
        tax_id: '',
        base_currency: 'QAR',
        default_timezone: 'Asia/Qatar',
        default_locale: 'en',
      });
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  const handleDeleteOrg = async (org) => {
    if (organizations.length <= 1) {
      showToast('Cannot delete organization: At least 1 active organization must remain in the system.', 'error');
      return;
    }
    const confirmed = window.confirm(
      `Permanently delete organization '${org.legal_name}' and all associated branches?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/v1/iam/organizations/${org.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          setBlockedError({
            ...errData.detail,
            item_type: 'organization',
            item_id: org.id
          });
          setIsBlockedModalOpen(true);
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete organization');
      }
      showToast(`Organization "${org.legal_name}" and its branches were permanently deleted.`);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleArchiveOrg = async (org) => {
    try {
      const res = await fetch(`/api/v1/iam/organizations/${org.id}/toggle-archive`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to toggle archive');
      }
      const data = await res.json();
      showToast(data.message || (data.is_active ? 'Company restored.' : 'Company archived.'));
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleArchiveBranch = async (branch) => {
    try {
      const res = await fetch(`/api/v1/iam/branches/${branch.id}/toggle-archive`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to toggle archive');
      }
      const data = await res.json();
      showToast(data.message || (data.is_active ? 'Branch restored.' : 'Branch archived.'));
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleArchiveInstead = async () => {
    if (!blockedError) return;
    try {
      const url = blockedError.item_type === 'branch'
        ? `/api/v1/iam/branches/${blockedError.item_id}/toggle-archive`
        : `/api/v1/iam/organizations/${blockedError.item_id}/toggle-archive`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to archive record');
      }
      const data = await res.json();
      showToast(data.message || 'Record successfully archived.');
      setIsBlockedModalOpen(false);
      setBlockedError(null);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveOrg = async (e) => {
    e.preventDefault();
    if (!editingOrg) return;
    try {
      const res = await fetch(`/api/v1/iam/organizations/${editingOrg.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editingOrg),
      });
      if (!res.ok) throw new Error('Failed to update organization');
      showToast('Organization details updated in PostgreSQL.');
      setIsOrgDirty(false);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    const b = branchModal.data;
    if (!b?.name?.trim() || !b?.code?.trim()) return;

    const cidrs = typeof b.ip_allowlist === 'string'
      ? b.ip_allowlist.split(',').map((s) => s.trim()).filter(Boolean)
      : b.ip_allowlist || ['127.0.0.1/32'];

    try {
      const url = branchModal.isEdit ? `/api/v1/iam/branches/${b.id}` : '/api/v1/iam/branches';
      const method = branchModal.isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          organization_id: b.organization_id,
          name: b.name,
          code: b.code,
          city: b.city || 'Doha',
          ip_allowlist: cidrs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save branch');
      }
      showToast(branchModal.isEdit ? 'Branch updated.' : 'New operating branch created.');
      setBranchModal({ isOpen: false, isEdit: false, data: null });
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteBranch = async (branchId, branchName) => {
    if (!window.confirm(`Delete operating branch "${branchName}"?`)) return;
    try {
      const res = await fetch(`/api/v1/iam/branches/${branchId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          setBlockedError({
            ...errData.detail,
            item_type: 'branch',
            item_id: branchId
          });
          setIsBlockedModalOpen(true);
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Cannot delete branch');
      }
      showToast(`Branch "${branchName}" removed.`);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Control Panel */}
      <div className="h-14 min-h-[56px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">System Configuration</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              Companies & Operating Branches
            </span>
          </div>
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {isTenancyLoading && organizations.length === 0
              ? 'Loading...'
              : `${organizations.length} Organizations • ${branches.length} Branches`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Active vs Archived Filter Segment */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Active Companies ({organizations.filter((o) => o.is_active !== false).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                activeTab === 'archived'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Archived ({organizations.filter((o) => o.is_active === false).length})
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsCreatingOrg(!isCreatingOrg);
              setEditingOrg(null);
              setBranchModal({ isOpen: false, isEdit: false, data: null });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Organization</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
        >
          {feedback.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Inline Form Panel: Create Organization */}
      {isCreatingOrg && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-blue-500/30 dark:border-blue-500/40 shadow-sm p-6 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>System Configuration</span>
                <span>/</span>
                <span>Companies & Branches</span>
                <span>/</span>
                <span className="text-slate-900 dark:text-white font-medium">New Company</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">Create New Organization</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsCreatingOrg(false)}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>

          <form onSubmit={handleCreateOrg} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Company Legal Name *</label>
              <input
                type="text"
                required
                value={newOrgData.legal_name}
                onChange={(e) => setNewOrgData({ ...newOrgData, legal_name: e.target.value })}
                placeholder="e.g. Apex Qatar Construction W.L.L."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Tax ID / CR Number</label>
                <input
                  type="text"
                  value={newOrgData.tax_id}
                  onChange={(e) => setNewOrgData({ ...newOrgData, tax_id: e.target.value })}
                  placeholder="e.g. QA-10928374"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Base Currency *</label>
                <select
                  value={newOrgData.base_currency}
                  onChange={(e) => setNewOrgData({ ...newOrgData, base_currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold text-slate-900 dark:text-white"
                >
                  <option value="QAR">QAR (Qatari Riyal)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="SAR">SAR (Saudi Riyal)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Timezone *</label>
                <select
                  value={newOrgData.default_timezone}
                  onChange={(e) => setNewOrgData({ ...newOrgData, default_timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Default Locale *</label>
                <select
                  value={newOrgData.default_locale}
                  onChange={(e) => setNewOrgData({ ...newOrgData, default_locale: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 uppercase text-slate-900 dark:text-white"
                >
                  <option value="en">English (en)</option>
                  <option value="ar">Arabic (ar)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreatingOrg(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingOrg || !newOrgData.legal_name.trim()}
                className="px-4 py-2 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmittingOrg ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Provisioning...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Company</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Form Panel: Edit Organization */}
      {editingOrg && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-blue-500/30 dark:border-blue-500/40 shadow-sm p-6 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>System Configuration</span>
                <span>/</span>
                <span>Companies & Branches</span>
                <span>/</span>
                <span className="text-slate-900 dark:text-white font-medium">{editingOrg.legal_name}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">Edit Company Profile</h3>
            </div>
            <button
              type="button"
              onClick={() => { setEditingOrg(null); setIsOrgDirty(false); }}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>
          <form onSubmit={handleSaveOrg} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Legal Entity Name *</label>
                <input
                  type="text"
                  required
                  value={editingOrg.legal_name}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, legal_name: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Commercial Registration (CR) / Tax ID</label>
                <input
                  type="text"
                  value={editingOrg.tax_id || ''}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, tax_id: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Base Currency</label>
                <select
                  value={editingOrg.base_currency || 'QAR'}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, base_currency: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                >
                  <option value="QAR">QAR</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Timezone</label>
                <select
                  value={editingOrg.default_timezone || 'Asia/Qatar'}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, default_timezone: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEditingOrg(null);
                  setIsOrgDirty(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isOrgDirty}
                className={`px-4 py-2 rounded-xl font-semibold transition ${
                  isOrgDirty
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Form Panel: Create / Edit Branch */}
      {branchModal.isOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-purple-500/30 dark:border-purple-500/40 shadow-sm p-6 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>System Configuration</span>
                <span>/</span>
                <span>Companies & Branches</span>
                <span>/</span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {branchModal.isEdit ? `Edit Branch (${branchModal.data?.code})` : 'New Operating Branch'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {branchModal.isEdit ? 'Edit Operating Branch' : 'Add Operating Branch'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>
          <form onSubmit={handleSaveBranch} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Branch Name *</label>
              <input
                type="text"
                required
                value={branchModal.data.name}
                onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, name: e.target.value } })}
                placeholder="e.g. Ras Laffan Industrial Operations"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">Branch Code *</label>
                <input
                  type="text"
                  required
                  value={branchModal.data.code}
                  onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, code: e.target.value.toUpperCase() } })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">City / Municipality</label>
                <input
                  type="text"
                  value={branchModal.data.city}
                  onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, city: e.target.value } })}
                  placeholder="Doha / Al Wakra / Al Khor"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Allowed CIDR Subnets</label>
              <input
                type="text"
                value={branchModal.data.ip_allowlist}
                onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, ip_allowlist: e.target.value } })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer">
                {branchModal.isEdit ? 'Update Branch' : 'Create Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Organizations Grid */}
      {isTenancyLoading && organizations.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading companies and operating branches...</span>
          </div>
        </div>
      ) : organizations.filter((org) => (activeTab === 'archived' ? org.is_active === false : org.is_active !== false)).length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
          {activeTab === 'archived' ? 'No archived companies.' : 'No active organizations configured.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {organizations
            .filter((org) => (activeTab === 'archived' ? org.is_active === false : org.is_active !== false))
            .map((org) => {
              const orgBranches = branches.filter((b) => b.organization_id === org.id);
              const isOrgArchived = org.is_active === false;

          return (
            <div
              key={org.id}
              className={`rounded-2xl border p-6 shadow-2xs space-y-5 transition ${
                isOrgArchived
                  ? 'bg-slate-100/70 dark:bg-slate-950/60 border-dashed border-slate-300 dark:border-slate-800 opacity-90'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Org Header */}
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-xs ${isOrgArchived ? 'bg-slate-600' : 'bg-blue-600'}`}>
                    {org.legal_name.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                        {org.legal_name}
                      </h3>
                      {isOrgArchived && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Qatar CR / Tax ID: <strong className="text-slate-600 dark:text-slate-300">{org.tax_id}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {org.base_currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOrg({ ...org });
                      setIsOrgDirty(false);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    title="Edit Company Details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleArchiveOrg(org)}
                    className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer ${
                      isOrgArchived
                        ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                    }`}
                    title={isOrgArchived ? 'Restore / Unarchive Company' : 'Archive Company (Preserve History)'}
                  >
                    {isOrgArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOrg(org)}
                    disabled={organizations.length <= 1}
                    className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition ${
                      organizations.length <= 1
                        ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                        : 'text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/40 cursor-pointer'
                    }`}
                    title={
                      organizations.length <= 1
                        ? 'Cannot delete: At least 1 organization must remain'
                        : `Permanently delete ${org.legal_name}`
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Org Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 block">Default Timezone</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{org.default_timezone}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 block">Default Locale</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{org.default_locale || 'en'}</span>
                </div>
              </div>

              {/* Operating Branches List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Operating Branches ({orgBranches.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setBranchModal({
                        isOpen: true,
                        isEdit: false,
                        data: {
                          organization_id: org.id,
                          name: '',
                          code: `BR-0${orgBranches.length + 1}`,
                          city: 'Doha',
                          ip_allowlist: '127.0.0.1/32, 192.168.1.0/24',
                        },
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Branch</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {orgBranches.map((branch) => (
                    <div
                      key={branch.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                        branch.is_active === false
                          ? 'border-dashed border-slate-300 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/20 opacity-80'
                          : 'border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {branch.name}
                          </span>
                          {branch.is_active === false && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {branch.city} • Code: {branch.code}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono text-[11px]">
                          <span className="text-slate-400 block text-[10px]">IP Subnet Allowlist</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {(branch.ip_allowlist || ['127.0.0.1/32']).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setBranchModal({
                                isOpen: true,
                                isEdit: true,
                                data: {
                                  ...branch,
                                  ip_allowlist: (branch.ip_allowlist || ['127.0.0.1/32']).join(', '),
                                },
                              })
                            }
                            className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                            title="Edit Branch"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleArchiveBranch(branch)}
                            className={`p-1 cursor-pointer transition ${
                              branch.is_active === false ? 'text-emerald-600 hover:text-emerald-500' : 'text-slate-400 hover:text-amber-500'
                            }`}
                            title={branch.is_active === false ? 'Restore Branch' : 'Archive Branch'}
                          >
                            {branch.is_active === false ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                          </button>
                          {orgBranches.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBranch(branch.id, branch.name)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Delete Branch"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Relational Delete Blocked Modal */}
      <DeleteBlockedModal
        isOpen={isBlockedModalOpen}
        errorData={blockedError}
        onClose={() => {
          setIsBlockedModalOpen(false);
          setBlockedError(null);
        }}
        onArchiveInstead={handleArchiveInstead}
      />
    </div>
  );
}