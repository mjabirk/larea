import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Archive,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';
import { DeleteBlockedModal } from '../common/DeleteBlockedModal';
import { useSystemLookups } from '../../services/lookupService';

export function OrganizationsView() {
  const { organizations, branches, refreshTenancyData, isTenancyLoading } = useTenancy();
  const { getAuthHeaders } = useAuth();
  const { currencies } = useSystemLookups();

  const [feedback, setFeedback] = useState(null);
  const [editingOrg, setEditingOrg] = useState(null);
  const [isOrgDirty, setIsOrgDirty] = useState(false);
  const [branchModal, setBranchModal] = useState({ isOpen: false, isEdit: false, data: null });
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived' | 'all'

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

  useEffect(() => {
    if (refreshTenancyData) {
      refreshTenancyData();
    }
  }, [refreshTenancyData]);

  const showToast = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const activeOrgsCount = organizations.filter((o) => o.is_active !== false).length;
  const archivedOrgsCount = organizations.filter((o) => o.is_active === false).length;

  const visibleOrganizations = organizations.filter((org) => {
    if (activeTab === 'archived') return org.is_active === false;
    if (activeTab === 'active') return org.is_active !== false;
    return true;
  });

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgData.legal_name.trim()) return;
    setIsSubmittingOrg(true);
    try {
      const res = await fetch('/api/v1/iam/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newOrgData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create company');
      }
      showToast(`Company "${newOrgData.legal_name}" created.`);
      setIsCreatingOrg(false);
      setActiveTab('active');
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
    const isOrgActive = org.is_active !== false;
    if (isOrgActive && activeOrgsCount <= 1) {
      showToast('At least one active company must remain in the workspace.', 'error');
      return;
    }
    const confirmed = window.confirm(
      `Permanently delete "${org.legal_name}" and all its branches?`
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
            item_id: org.id,
          });
          setIsBlockedModalOpen(true);
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete company');
      }
      showToast(`Company "${org.legal_name}" permanently deleted.`);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleArchiveOrg = async (org) => {
    const isCurrentlyActive = org.is_active !== false;
    if (isCurrentlyActive && activeOrgsCount <= 1) {
      showToast('At least one active company must remain active.', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/v1/iam/organizations/${org.id}/toggle-archive`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to update company status');
      }
      const data = await res.json();
      showToast(data.message || (data.is_active ? 'Company restored to active.' : 'Company archived.'));
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
        throw new Error(err.detail || 'Failed to update branch status');
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
      const url =
        blockedError.item_type === 'branch'
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
      showToast(data.message || 'Record archived.');
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(editingOrg),
      });
      if (!res.ok) throw new Error('Failed to save company details');
      showToast('Company details saved.');
      setEditingOrg(null);
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

    const cidrs =
      typeof b.ip_allowlist === 'string'
        ? b.ip_allowlist
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : b.ip_allowlist || ['127.0.0.1/32'];

    try {
      const url = branchModal.isEdit ? `/api/v1/iam/branches/${b.id}` : '/api/v1/iam/branches';
      const method = branchModal.isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          organization_id: b.organization_id,
          name: b.name,
          code: b.code,
          city: b.city || 'Doha',
          ip_allowlist: cidrs.length > 0 ? cidrs : ['127.0.0.1/32'],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save branch');
      }
      showToast(branchModal.isEdit ? 'Branch updated.' : 'Branch added.');
      setBranchModal({ isOpen: false, isEdit: false, data: null });
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteBranch = async (branchId, branchName) => {
    if (!window.confirm(`Delete branch "${branchName}"?`)) return;
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
            item_id: branchId,
          });
          setIsBlockedModalOpen(true);
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Cannot delete branch');
      }
      showToast(`Branch "${branchName}" deleted.`);
      await refreshTenancyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Clean Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
              Companies & Branches
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isTenancyLoading && organizations.length === 0
                ? 'Loading companies...'
                : `${activeOrgsCount} active ${activeOrgsCount === 1 ? 'company' : 'companies'}${archivedOrgsCount > 0 ? ` • ${archivedOrgsCount} archived` : ''} • ${branches.length} branches`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active / Archived / All Filter Tabs */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Active ({activeOrgsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'archived'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archived ({archivedOrgsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({organizations.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreatingOrg(!isCreatingOrg);
              setEditingOrg(null);
              setBranchModal({ isOpen: false, isEdit: false, data: null });
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Company</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-current opacity-60 hover:opacity-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline Form Panel: Create Company */}
      {isCreatingOrg && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800/60 shadow-sm p-6 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">New Company</h3>
            <button
              type="button"
              onClick={() => setIsCreatingOrg(false)}
              className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>

          <form onSubmit={handleCreateOrg} className="space-y-4 text-sm">
            <div>
              <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Company Legal Name *</label>
              <input
                type="text"
                required
                value={newOrgData.legal_name}
                onChange={(e) => setNewOrgData({ ...newOrgData, legal_name: e.target.value })}
                placeholder="e.g. Apex Qatar Construction W.L.L."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">CR / Tax Registration Number</label>
                <input
                  type="text"
                  value={newOrgData.tax_id}
                  onChange={(e) => setNewOrgData({ ...newOrgData, tax_id: e.target.value })}
                  placeholder="e.g. QA-10928374"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Currency *</label>
                <select
                  value={newOrgData.base_currency}
                  onChange={(e) => setNewOrgData({ ...newOrgData, base_currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {currencies.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} — {curr.name} ({curr.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Timezone</label>
                <select
                  value={newOrgData.default_timezone}
                  onChange={(e) => setNewOrgData({ ...newOrgData, default_timezone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Default Language</label>
                <select
                  value={newOrgData.default_locale}
                  onChange={(e) => setNewOrgData({ ...newOrgData, default_locale: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreatingOrg(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingOrg || !newOrgData.legal_name.trim()}
                className="px-5 py-2 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmittingOrg ? 'Creating...' : 'Create Company'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Form Panel: Edit Company */}
      {editingOrg && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800/60 shadow-sm p-6 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Edit Company — {editingOrg.legal_name}
            </h3>
            <button
              type="button"
              onClick={() => {
                setEditingOrg(null);
                setIsOrgDirty(false);
              }}
              className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
          <form onSubmit={handleSaveOrg} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Legal Entity Name *</label>
                <input
                  type="text"
                  required
                  value={editingOrg.legal_name}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, legal_name: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">CR / Tax Registration Number</label>
                <input
                  type="text"
                  value={editingOrg.tax_id || ''}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, tax_id: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Currency</label>
                <select
                  value={editingOrg.base_currency || 'QAR'}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, base_currency: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
                >
                  {currencies.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} — {curr.name} ({curr.symbol})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Timezone</label>
                <select
                  value={editingOrg.default_timezone || 'Asia/Qatar'}
                  onChange={(e) => {
                    setEditingOrg({ ...editingOrg, default_timezone: e.target.value });
                    setIsOrgDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="Asia/Qatar">Asia/Qatar (GMT+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEditingOrg(null);
                  setIsOrgDirty(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isOrgDirty}
                className={`px-5 py-2 rounded-xl font-semibold transition ${
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

      {/* Inline Form Panel: Add / Edit Branch */}
      {branchModal.isOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-800/60 shadow-sm p-6 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {branchModal.isEdit ? `Edit Branch — ${branchModal.data?.name}` : 'Add Branch'}
            </h3>
            <button
              type="button"
              onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })}
              className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
          <form onSubmit={handleSaveBranch} className="space-y-4 text-sm">
            <div>
              <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Branch Name *</label>
              <input
                type="text"
                required
                value={branchModal.data.name}
                onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, name: e.target.value } })}
                placeholder="e.g. Doha Main Office"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">Branch Code *</label>
                <input
                  type="text"
                  required
                  value={branchModal.data.code}
                  onChange={(e) =>
                    setBranchModal({ ...branchModal, data: { ...branchModal.data, code: e.target.value.toUpperCase() } })
                  }
                  placeholder="HQ-01"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">City / Location</label>
                <input
                  type="text"
                  value={branchModal.data.city}
                  onChange={(e) => setBranchModal({ ...branchModal, data: { ...branchModal.data, city: e.target.value } })}
                  placeholder="Doha"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1.5 text-slate-700 dark:text-slate-300">
                Allowed Office IP Addresses <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={branchModal.data.ip_allowlist}
                onChange={(e) =>
                  setBranchModal({ ...branchModal, data: { ...branchModal.data, ip_allowlist: e.target.value } })
                }
                placeholder="e.g. 192.168.1.0/24"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
              >
                {branchModal.isEdit ? 'Save Branch' : 'Add Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Companies Grid */}
      {isTenancyLoading && organizations.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading companies and branches...</span>
          </div>
        </div>
      ) : visibleOrganizations.length === 0 ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <Archive className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-base font-medium text-slate-700 dark:text-slate-300">
            {activeTab === 'archived' ? 'No archived companies' : 'No active companies found'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeTab === 'archived'
              ? 'Companies you archive will appear here and can be restored anytime.'
              : 'Create a new company or check the Archived tab.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibleOrganizations.map((org) => {
            const orgBranches = branches.filter((b) => b.organization_id === org.id);
            const activeBranchCount = orgBranches.filter((b) => b.is_active !== false).length;
            const isOrgArchived = org.is_active === false;
            const canDeleteThisOrg = isOrgArchived || activeOrgsCount > 1;
            const canArchiveThisOrg = isOrgArchived || activeOrgsCount > 1;

            return (
              <div
                key={org.id}
                className={`rounded-2xl border p-6 shadow-2xs space-y-5 transition ${
                  isOrgArchived
                    ? 'bg-amber-50/30 dark:bg-slate-900/60 border-amber-200/80 dark:border-amber-900/40'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Company Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0 ${
                        isOrgArchived ? 'bg-slate-500' : 'bg-blue-600'
                      }`}
                    >
                      {org.legal_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug truncate">
                          {org.legal_name}
                        </h3>
                        {isOrgArchived && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {org.tax_id ? `Reg. No: ${org.tax_id}` : 'No registration number set'} • {org.base_currency}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOrgArchived ? (
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveOrg(org)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
                        title="Restore company to active workspace"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOrg({ ...org });
                            setIsOrgDirty(false);
                          }}
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition"
                          title="Edit Company"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={!canArchiveThisOrg}
                          onClick={() => handleToggleArchiveOrg(org)}
                          className={`p-2 rounded-xl border border-slate-200 dark:border-slate-700 transition ${
                            !canArchiveThisOrg
                              ? 'opacity-40 cursor-not-allowed text-slate-400'
                              : 'text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer'
                          }`}
                          title={
                            !canArchiveThisOrg
                              ? 'Cannot archive the only active company'
                              : 'Archive Company'
                          }
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteOrg(org)}
                      disabled={!canDeleteThisOrg}
                      className={`p-2 rounded-xl border border-slate-200 dark:border-slate-700 transition ${
                        !canDeleteThisOrg
                          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                          : 'text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer'
                      }`}
                      title={
                        !canDeleteThisOrg
                          ? 'At least one active company must remain'
                          : `Delete ${org.legal_name}`
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Company Details Summary */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Timezone</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{org.default_timezone}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Language</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {org.default_locale === 'ar' ? 'Arabic' : 'English'}
                    </span>
                  </div>
                </div>

                {/* Operating Branches List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Branches ({orgBranches.length})
                    </span>
                    {!isOrgArchived && (
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
                              ip_allowlist: '',
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Branch</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {orgBranches.map((branch) => {
                      const isBranchArchived = branch.is_active === false;
                      return (
                        <div
                          key={branch.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm transition ${
                            isBranchArchived
                              ? 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/20 opacity-80'
                              : 'border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/30'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {branch.name}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
                                {branch.code}
                              </span>
                              {isBranchArchived && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                  Archived
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{branch.city || 'Doha'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setBranchModal({
                                  isOpen: true,
                                  isEdit: true,
                                  data: {
                                    ...branch,
                                    ip_allowlist: (branch.ip_allowlist || []).filter((ip) => ip !== '127.0.0.1/32').join(', '),
                                  },
                                })
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition"
                              title="Edit Branch"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleArchiveBranch(branch)}
                              className={`p-1.5 rounded-lg cursor-pointer transition ${
                                isBranchArchived
                                  ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                  : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              }`}
                              title={isBranchArchived ? 'Restore Branch' : 'Archive Branch'}
                            >
                              {isBranchArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            </button>
                            {(isBranchArchived || activeBranchCount > 1) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBranch(branch.id, branch.name)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition"
                                title="Delete Branch"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
