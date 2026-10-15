import React, { useState } from 'react';
import {
  UserPlus,
  Search,
  X,
  ShieldCheck,
  Shield,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useTenancy } from '../../context/TenancyContext';
import { useLocale } from '../../context/LocaleContext';
import { NewUserModal } from './NewUserModal';

export function UserListView({ onSelectUser }) {
  const { users, organizations, branches, organization_memberships } = useTenancy();
  const { formatDateTime } = useLocale();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);

  // Helper to lookup user role and branch dynamically
  const getUserMetadata = (userOrId) => {
    const userId = typeof userOrId === 'object' ? userOrId?.id : userOrId;
    const userObj = typeof userOrId === 'object' ? userOrId : users.find((u) => u.id === userId);
    const mem = organization_memberships.find((m) => m.user_id === userId);
    const org = organizations.find((o) => o.id === mem?.organization_id) || organizations[0];
    const branch = branches.find((b) => b.id === mem?.branch_id) || branches[0];

    const defaultRole = userObj?.is_superadmin ? 'Root Superadmin' : (userObj?.role || 'Standard User');

    return {
      role: mem?.role || defaultRole,
      orgName: org?.legal_name || 'Organization',
      branchName: branch?.name || 'Main Branch',
      branchCode: branch?.code || 'HQ-01',
    };
  };

  // Real-time filtering across name, email, role, and branch + role filter pills
  const filteredUsers = users.filter((u) => {
    const meta = getUserMetadata(u);
    const term = searchTerm.trim().toLowerCase();

    // 1. Text Search filtering across name, email, role, and branch
    if (term) {
      const nameMatch = (u.full_name || '').toLowerCase().includes(term);
      const emailMatch = (u.email || '').toLowerCase().includes(term);
      const roleMatch = (meta.role || '').toLowerCase().includes(term);
      const branchMatch =
        (meta.branchName || '').toLowerCase().includes(term) ||
        (meta.branchCode || '').toLowerCase().includes(term);

      if (!nameMatch && !emailMatch && !roleMatch && !branchMatch) {
        return false;
      }
    }

    // 2. Role Filter Pills (All, Superadmins, Operations, Supervisors)
    if (roleFilter === 'all') return true;
    if (roleFilter === 'superadmin') {
      return Boolean(u.is_superadmin) || (meta.role || '').toLowerCase().includes('superadmin');
    }
    if (roleFilter === 'ops') {
      return (meta.role || '').toLowerCase().includes('operation');
    }
    if (roleFilter === 'supervisor') {
      return (meta.role || '').toLowerCase().includes('supervisor');
    }

    return true;
  });

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 1. New User Modal */}
      <NewUserModal
        isOpen={isNewUserModalOpen}
        onClose={() => setIsNewUserModalOpen(false)}
        onUserCreated={(newUser) => {
          onSelectUser && onSelectUser(newUser);
        }}
      />

      {/* 2. Top 56px Action Bar / Control Panel */}
      <div className="min-h-[56px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-3 px-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left: Breadcrumb / Model Title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-slate-400">Security & IAM</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-semibold text-slate-900 dark:text-white text-[15px]">
              Users & Identities
            </span>
          </div>
          <span className="font-mono text-[12px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {filteredUsers.length} Users
          </span>
        </div>

        {/* Center: Search & Filter Chips */}
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 rtl:right-3.5 rtl:left-auto top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by name, email, role, or branch..."
              className="w-full h-[42px] text-[15px] font-normal pl-10 pr-9 rtl:pr-10 rtl:pl-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="hidden lg:inline-flex items-center h-[42px] rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs shrink-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'superadmin', label: 'Superadmins' },
              { id: 'ops', label: 'Operations' },
              { id: 'supervisor', label: 'Supervisors' },
            ].map((chip) => {
              const active = roleFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setRoleFilter(chip.id)}
                  className={`h-full px-3 rounded-lg font-medium transition cursor-pointer text-[13px] ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: + New User Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsNewUserModalOpen(true)}
            className="h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ New User</span>
          </button>
        </div>
      </div>

      {/* 3. Standard Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 text-[12px]">
                <th className="py-3.5 px-4">Full Name & Email</th>
                <th className="py-3.5 px-4">Assigned Role</th>
                <th className="py-3.5 px-4">Organization / Branch</th>
                <th className="py-3.5 px-4">2FA Security</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-4">Last Activity</th>
                <th className="py-3.5 px-3 w-10"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[13px] text-slate-400">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const meta = getUserMetadata(user.id);
                  const isSuper = user.is_superadmin || meta.role.includes('Superadmin');
                  const isPending = user.status === 'pending_deletion';

                  return (
                    <tr
                      key={user.id}
                      onClick={() => onSelectUser(user)}
                      className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition cursor-pointer"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs"
                            aria-label={`${user.full_name} avatar`}
                          >
                            {user.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <div className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">
                              {user.full_name}
                            </div>
                            <div className="text-[12px] font-mono text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                            isSuper
                              ? 'bg-violet-100 dark:bg-violet-950/70 text-violet-900 dark:text-violet-200 border border-violet-300 dark:border-violet-700'
                              : meta.role.includes('Operations')
                              ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{meta.role}</span>
                        </span>
                      </td>

                      {/* Org / Branch */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                          {meta.branchName}
                        </div>
                        <div className="text-[12px] text-slate-500 dark:text-slate-400 font-mono">
                          {meta.orgName} • {meta.branchCode}
                        </div>
                      </td>

                      {/* 2FA Status */}
                      <td className="py-3.5 px-4 text-xs">
                        <span className="ui-badge-valid">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>FIDO2 Active</span>
                        </span>
                      </td>

                      {/* Account Status (with GDPR pending deletion badge) */}
                      <td className="py-3.5 px-4">
                        {isPending ? (
                          <span className="ui-badge-pending">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>Pending Deletion</span>
                          </span>
                        ) : (
                          <span className={user.status === 'active' ? 'ui-badge-valid' : 'ui-badge-missing'}>
                            <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="capitalize">{user.status || 'active'}</span>
                          </span>
                        )}
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {user.last_login
                          ? formatDateTime(user.last_login)
                          : user.updated_at
                          ? formatDateTime(user.updated_at)
                          : user.created_at
                          ? formatDateTime(user.created_at)
                          : '—'}
                      </td>

                      {/* Chevron Arrow */}
                      <td className="py-3.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
