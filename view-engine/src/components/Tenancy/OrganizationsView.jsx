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
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useAuth } from '../../context/AuthContext';

export function OrganizationsView() {
  const { organizations, branches, refreshTenancyData } = useTenancy();
  const { getAuthHeaders } = useAuth();

  const [feedback, setFeedback] = useState(null);
  const [editingOrg, setEditingOrg] = useState(null);
  const [branchModal, setBranchModal] = useState({ isOpen: false, isEdit: false, data: null });

  const showToast = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3500);
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
      setEditingOrg(null);
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
            {organizations.length} Organizations • {branches.length} Branches
          </span>
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

      {/* Organizations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {organizations.map((org) => {
          const orgBranches = branches.filter((b) => b.organization_id === org.id);

          return (
            <div
              key={org.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5"
            >
              {/* Org Header */}
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    {org.legal_name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                      {org.legal_name}
                    </h3>
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
                    onClick={() => setEditingOrg({ ...org })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                    title="Edit Company Details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
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
                      className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {branch.name}
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

      {/* Edit Organization Modal */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Company Profile</h3>
              <button onClick={() => setEditingOrg(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveOrg} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">Legal Entity Name *</label>
                <input
                  type="text"
                  required
                  value={editingOrg.legal_name}
                  onChange={(e) => setEditingOrg({ ...editingOrg, legal_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Commercial Registration (CR) / Tax ID</label>
                <input
                  type="text"
                  value={editingOrg.tax_id || ''}
                  onChange={(e) => setEditingOrg({ ...editingOrg, tax_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Base Currency</label>
                  <select
                    value={editingOrg.base_currency || 'QAR'}
                    onChange={(e) => setEditingOrg({ ...editingOrg, base_currency: e.target.value })}
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
                    onChange={(e) => setEditingOrg({ ...editingOrg, default_timezone: e.target.value })}
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
                <button type="button" onClick={() => setEditingOrg(null)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Branch Modal */}
      {branchModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {branchModal.isEdit ? 'Edit Operating Branch' : 'Add Operating Branch'}
              </h3>
              <button onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBranch} className="space-y-3.5 text-xs">
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
              <div className="grid grid-cols-2 gap-3">
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
                <button type="button" onClick={() => setBranchModal({ isOpen: false, isEdit: false, data: null })} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold">
                  {branchModal.isEdit ? 'Update Branch' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}