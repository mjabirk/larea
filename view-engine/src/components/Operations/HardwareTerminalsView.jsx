import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Cpu,
  Server,
  Wifi,
  WifiOff,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Fingerprint,
  ScanFace,
  ShieldAlert,
  RefreshCw,
  Play,
  Plus,
  Trash2,
  Settings,
  Key,
  Users,
  Radio,
  FileText,
  Check,
  X,
  ChevronRight,
  Search,
  ArrowUpRight,
  HardDrive,
  Power,
  Terminal as TerminalIcon,
  Sliders,
  Calendar,
  Info,
  Lock,
  Unlock,
  Layers,
  Sparkles,
  Eye,
  Hand
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

export function HardwareTerminalsView() {
  const auth = useAuth();
  const { hasPermission } = useAccessControl();

  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const isSuperadmin = Boolean(auth?.currentUser?.is_superadmin || auth?.user?.is_superadmin);
  const canManageHardware = hasPermission('attendance.manage') || hasPermission('operations.terminals_admin') || isSuperadmin;

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
  }), [sessionToken]);

  // Tab State
  const [activeTab, setActiveTab] = useState('terminals'); // 'terminals', 'directory', 'transactions', 'commands'

  // Data States
  const [terminals, setTerminals] = useState([]);
  const [accessGroups, setAccessGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [commands, setCommands] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [autoRefreshCommands, setAutoRefreshCommands] = useState(false);

  // Filters
  const [txTerminalFilter, setTxTerminalFilter] = useState('ALL');
  const [txStateFilter, setTxStateFilter] = useState('ALL');
  const [txSearchTerm, setTxSearchTerm] = useState('');

  const [cmdTerminalFilter, setCmdTerminalFilter] = useState('ALL');
  const [cmdStatusFilter, setCmdStatusFilter] = useState('ALL');

  const [empSearchTerm, setEmpSearchTerm] = useState('');

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState(null);
  const [terminalForm, setTerminalForm] = useState({
    sn: '',
    alias: '',
    group_id: '',
    branch_id: '',
    state: 'active',
    is_enrollment_terminal: false,
    time_offset_hours: 0.0,
    lan_ip_address: '',
    fp_algo: '10',
    face_algo: '39',
    palm_algo: '12'
  });

  const [showOplogModal, setShowOplogModal] = useState(false);
  const [selectedTerminalOplog, setSelectedTerminalOplog] = useState(null);

  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simulateForm, setSimulateForm] = useState({
    employee_id: '',
    terminal_sn: 'ZK-QAT-HQ01',
    verify_method: '15',
    timing_mode: 'now', // 'now', 'double_punch', 'custom'
    punch_time: ''
  });
  const [simulateResult, setSimulateResult] = useState(null);

  const [showEditBadgeModal, setShowEditBadgeModal] = useState(false);
  const [editingBadgeEmp, setEditingBadgeEmp] = useState(null);
  const [badgeForm, setBadgeForm] = useState({
    zk_emp_code: '',
    zk_card_no: '',
    zk_pin: '',
    zk_is_admin: false,
    zk_access_enabled: true
  });

  // Fetch Terminals & Access Groups
  const fetchTerminals = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/zkteco/terminals', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setTerminals(data.terminals || []);
      }
    } catch (err) {
      console.error('Error fetching terminals:', err);
    }
  }, [authHeaders]);

  const fetchAccessGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/zkteco/access-groups', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setAccessGroups(data.access_groups || []);
      }
    } catch (err) {
      console.error('Error fetching access groups:', err);
    }
  }, [authHeaders]);

  // Fetch Employees
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=300', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.items || data.employees || []);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  }, [authHeaders]);

  // Fetch Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      let url = '/api/v1/zkteco/transactions?limit=150';
      if (txTerminalFilter !== 'ALL') url += `&terminal_sn=${encodeURIComponent(txTerminalFilter)}`;
      if (txStateFilter !== 'ALL') url += `&punch_state=${encodeURIComponent(txStateFilter)}`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, [authHeaders, txTerminalFilter, txStateFilter]);

  // Fetch Commands
  const fetchCommands = useCallback(async () => {
    try {
      let url = '/api/v1/zkteco/commands?limit=150';
      if (cmdTerminalFilter !== 'ALL') url += `&terminal_sn=${encodeURIComponent(cmdTerminalFilter)}`;
      if (cmdStatusFilter !== 'ALL') url += `&status=${encodeURIComponent(cmdStatusFilter)}`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCommands(data.commands || []);
      }
    } catch (err) {
      console.error('Error fetching commands:', err);
    }
  }, [authHeaders, cmdTerminalFilter, cmdStatusFilter]);

  // Initial Load
  const reloadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      fetchTerminals(),
      fetchAccessGroups(),
      fetchEmployees(),
      fetchTransactions(),
      fetchCommands()
    ]);
    setIsLoading(false);
  }, [fetchTerminals, fetchAccessGroups, fetchEmployees, fetchTransactions, fetchCommands]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Auto-refresh for commands tab if enabled
  useEffect(() => {
    if (!autoRefreshCommands || activeTab !== 'commands') return;
    const interval = setInterval(() => {
      fetchCommands();
      fetchTerminals();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefreshCommands, activeTab, fetchCommands, fetchTerminals]);

  // Terminal Action Dispatcher
  const handleTerminalAction = async (terminalId, actionName) => {
    try {
      setActionMessage({ type: 'info', text: `Dispatching ${actionName} to terminal...` });
      const res = await fetch(`/api/v1/zkteco/terminals/${terminalId}/command`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: actionName })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Command '${actionName}' successfully queued (ID: ${data.command_id || 'Batch'})`
        });
        await fetchTerminals();
        await fetchCommands();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to dispatch command.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Network error dispatching command.' });
    }
  };

  // Register / Edit Terminal
  const handleSaveTerminal = async (e) => {
    e.preventDefault();
    try {
      const url = editingTerminal
        ? `/api/v1/zkteco/terminals/${editingTerminal.id}`
        : '/api/v1/zkteco/terminals';
      const method = editingTerminal ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(terminalForm)
      });
      const data = await res.json();

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Terminal ${terminalForm.sn} ${editingTerminal ? 'updated' : 'registered'} successfully.`
        });
        setShowRegisterModal(false);
        setEditingTerminal(null);
        await fetchTerminals();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to save terminal.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Error saving terminal.' });
    }
  };

  const handleDeleteTerminal = async (t) => {
    if (!window.confirm(`Are you sure you want to delete terminal ${t.alias} (${t.sn})?`)) return;
    try {
      const res = await fetch(`/api/v1/zkteco/terminals/${t.id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Terminal ${t.sn} deleted successfully.` });
        await fetchTerminals();
      } else {
        const data = await res.json();
        setActionMessage({ type: 'error', text: data.detail || 'Failed to delete terminal.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Error deleting terminal.' });
    }
  };

  // Remote Biometric Enrollment
  const handleRemoteEnroll = async (emp, enrollType) => {
    try {
      setActionMessage({
        type: 'info',
        text: `Triggering remote ${enrollType} enrollment for ${emp.full_name}...`
      });
      const res = await fetch('/api/v1/zkteco/enroll', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          employee_id: emp.id,
          enroll_type: enrollType,
          finger_index: 0
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Enrollment command queued (ID: ${data.command_id}) on '${data.terminal_alias}'. Instruct ${emp.full_name} to place their ${enrollType} on device.`
        });
        await fetchCommands();
        await fetchTerminals();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Enrollment dispatch failed.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Error dispatching enrollment.' });
    }
  };

  // Update Employee Biometric Credentials
  const handleSaveBadge = async (e) => {
    e.preventDefault();
    if (!editingBadgeEmp) return;
    try {
      const res = await fetch(`/api/v1/zkteco/employees/${editingBadgeEmp.id}/biometrics`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(badgeForm)
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Biometric credentials updated & sync queued for ${editingBadgeEmp.full_name}.`
        });
        setShowEditBadgeModal(false);
        setEditingBadgeEmp(null);
        await fetchEmployees();
        await fetchCommands();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Failed to update credentials.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Error updating credentials.' });
    }
  };

  // Simulate Punch Engine
  const handleSimulatePunch = async (e) => {
    e.preventDefault();
    if (!simulateForm.employee_id) {
      setActionMessage({ type: 'error', text: 'Please select an employee to simulate punch.' });
      return;
    }
    try {
      let punchTime = null;
      if (simulateForm.timing_mode === 'custom' && simulateForm.punch_time) {
        punchTime = simulateForm.punch_time;
      }

      const res = await fetch('/api/v1/zkteco/simulate-punch', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          employee_id: simulateForm.employee_id,
          terminal_sn: simulateForm.terminal_sn,
          verify_method: simulateForm.verify_method,
          punch_time: punchTime
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSimulateResult(data);
        setActionMessage({
          type: 'success',
          text: `Punch simulated: Outcome '${data.punch_state}' for ${data.employee_name}.`
        });
        await fetchTransactions();
        await fetchTerminals();
      } else {
        setActionMessage({ type: 'error', text: data.detail || 'Punch simulation failed.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Error simulating punch.' });
    }
  };

  // Helper: Open Edit Terminal
  const openEditTerminalModal = (t) => {
    setEditingTerminal(t);
    setTerminalForm({
      sn: t.sn,
      alias: t.alias,
      group_id: t.group_id || '',
      branch_id: t.branch_id || '',
      state: t.state || 'active',
      is_enrollment_terminal: Boolean(t.is_enrollment_terminal),
      time_offset_hours: t.time_offset_hours || 0.0,
      lan_ip_address: t.lan_ip_address || '',
      fp_algo: t.fp_algo || '10',
      face_algo: t.face_algo || '39',
      palm_algo: t.palm_algo || '12'
    });
    setShowRegisterModal(true);
  };

  // Helper: Open Edit Badge
  const openEditBadgeModal = (emp) => {
    setEditingBadgeEmp(emp);
    setBadgeForm({
      zk_emp_code: emp.zk_emp_code || (emp.employee_number ? emp.employee_number.replace('EMP-', '') : ''),
      zk_card_no: emp.zk_card_no || '',
      zk_pin: emp.zk_pin || '',
      zk_is_admin: Boolean(emp.zk_is_admin),
      zk_access_enabled: emp.zk_access_enabled !== false
    });
    setShowEditBadgeModal(true);
  };

  // Filtered Lists
  const filteredEmployees = useMemo(() => {
    if (!empSearchTerm.trim()) return employees;
    const term = empSearchTerm.toLowerCase();
    return employees.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(term) ||
        e.employee_number?.toLowerCase().includes(term) ||
        e.zk_emp_code?.toLowerCase().includes(term) ||
        e.zk_card_no?.toLowerCase().includes(term) ||
        e.department_id?.toLowerCase().includes(term)
    );
  }, [employees, empSearchTerm]);

  const filteredTransactions = useMemo(() => {
    if (!txSearchTerm.trim()) return transactions;
    const term = txSearchTerm.toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.emp_code?.toLowerCase().includes(term) ||
        tx.employee_name?.toLowerCase().includes(term) ||
        tx.terminal_sn?.toLowerCase().includes(term) ||
        tx.punch_state?.toLowerCase().includes(term)
    );
  }, [transactions, txSearchTerm]);

  // Status Badge Helper
  const getPunchStateBadge = (state) => {
    switch (state) {
      case 'Employee Check-In':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Check-In
          </span>
        );
      case 'Employee Check-Out':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
            <Clock className="w-3.5 h-3.5" />
            Check-Out
          </span>
        );
      case 'Ignored (Double Punch)':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3.5 h-3.5" />
            Ignored (≤120s)
          </span>
        );
      case 'Employee Check-In (Prior Auto-Closed)':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            <RefreshCw className="w-3.5 h-3.5" />
            Check-In (&gt;16h Reset)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {state || 'Logged'}
          </span>
        );
    }
  };

  // Verify Method Icon Helper
  const getVerifyIcon = (method) => {
    const m = (method || '').toLowerCase();
    if (m.includes('face')) return <ScanFace className="w-3.5 h-3.5 text-indigo-500" />;
    if (m.includes('finger')) return <Fingerprint className="w-3.5 h-3.5 text-emerald-500" />;
    if (m.includes('palm')) return <Hand className="w-3.5 h-3.5 text-amber-500" />;
    if (m.includes('card')) return <Radio className="w-3.5 h-3.5 text-cyan-500" />;
    return <Key className="w-3.5 h-3.5 text-slate-400" />;
  };

  // Command status badge helper
  const getCommandStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Pending
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-800 animate-pulse">
            In-Flight (Sent)
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            Success (0)
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            Failed
          </span>
        );
      default:
        return <span className="text-[11px] text-slate-500">{status}</span>;
    }
  };

  // Summary counts
  const totalActiveTerminals = terminals.filter((t) => t.state === 'active').length;
  const enrollmentTerminal = terminals.find((t) => t.is_enrollment_terminal);
  const totalPendingCommands = commands.filter((c) => c.status === 'pending').length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-10 pointer-events-none flex items-center justify-center">
          <Cpu className="w-96 h-96 -mr-20 -mt-10" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-1">
              <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>ZKTeco ADMS Biometric Gateway • Zero-Trust Hardware Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              Hardware Terminals & Biometric Ingestion
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl mt-1">
              Live ADMS device listener for ZKTeco facial, fingerprint, and palm attendance clocks.
              Hardware sync, smart shift pairing (&le;120s double-punch filter &gt;16h auto-close), and remote biometric enrollment.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={reloadAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm border border-white/15 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {canManageHardware && (
              <button
                onClick={() => {
                  setSimulateResult(null);
                  setSimulateForm({
                    employee_id: employees[0]?.id || '',
                    terminal_sn: terminals[0]?.sn || 'ZK-QAT-HQ01',
                    verify_method: '15',
                    timing_mode: 'now',
                    punch_time: ''
                  });
                  setShowSimulateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                Simulate Punch
              </button>
            )}

            {canManageHardware && (
              <button
                onClick={() => {
                  setEditingTerminal(null);
                  setTerminalForm({
                    sn: '',
                    alias: '',
                    group_id: accessGroups[0]?.id || '',
                    branch_id: '',
                    state: 'active',
                    is_enrollment_terminal: false,
                    time_offset_hours: 0.0,
                    lan_ip_address: '',
                    fp_algo: '10',
                    face_algo: '39',
                    palm_algo: '12'
                  });
                  setShowRegisterModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Terminal
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-white/10 text-xs">
          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Total Clocks Registered</span>
            <div className="text-lg font-bold text-white mt-0.5 flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              {terminals.length}
              <span className="text-[10px] text-emerald-400 font-normal">({totalActiveTerminals} Active)</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Master Enrollment Station</span>
            <div className="text-sm font-semibold text-emerald-300 mt-1 flex items-center gap-1.5 truncate">
              <ScanFace className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{enrollmentTerminal ? enrollmentTerminal.alias : 'None Assigned'}</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">ADMS Command Queue</span>
            <div className="text-lg font-bold text-white mt-0.5 flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-amber-400" />
              {totalPendingCommands}
              <span className="text-[10px] text-slate-400 font-normal">Pending Dispatch</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Raw Punches Ingested</span>
            <div className="text-lg font-bold text-white mt-0.5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              {transactions.length}
              <span className="text-[10px] text-sky-300 font-normal">Transactions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : actionMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-x-auto">
        <button
          onClick={() => setActiveTab('terminals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'terminals'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Server className="w-4 h-4 text-indigo-500" />
          <span>Biometric Terminals Grid & Controls</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
            {terminals.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('directory')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'directory'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Fingerprint className="w-4 h-4 text-emerald-500" />
          <span>Biometric Enrollment & Badge Directory</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            {employees.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4 text-sky-500" />
          <span>Raw ADMS Transactions & Smart Pairing Feed</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
            {transactions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('commands')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'commands'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <TerminalIcon className="w-4 h-4 text-amber-500" />
          <span>ADMS Command Queue (C:ID:CMD)</span>
          {totalPendingCommands > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold animate-pulse">
              {totalPendingCommands}
            </span>
          )}
        </button>
      </div>

      {/* ====================================================================== */}
      {/* TAB 1: BIOMETRIC TERMINALS GRID & CONTROLS                            */}
      {/* ====================================================================== */}
      {activeTab === 'terminals' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {terminals.map((t) => (
              <div
                key={t.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {t.sn}
                        </span>
                        {t.is_enrollment_terminal && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            <ScanFace className="w-3 h-3 text-indigo-500" />
                            Enrollment Station
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5">
                        {t.alias}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Group: <strong className="text-slate-700 dark:text-slate-300">{t.group_name || 'Standard Access'}</strong>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          t.state === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.state === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        {t.state === 'active' ? 'Active' : 'Idle'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {t.last_activity ? new Date(t.last_activity).toLocaleTimeString() : 'No Heartbeat'}
                      </span>
                    </div>
                  </div>

                  {/* Network & Firmware Algorithm Badges */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] mb-3">
                    <div>
                      <span className="text-slate-400 block text-[10px]">LAN IP</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {t.lan_ip_address || 'DHCP'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">WAN Ingress</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {t.ip_address || '127.0.0.1'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Firmware Algos</span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        FP: v{t.fp_algo} • Face: v{t.face_algo}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Palm Shift Algo</span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {t.palm_algo !== 'unknown' ? `v${t.palm_algo}` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Enrolled Counts Pill */}
                  <div className="grid grid-cols-4 gap-1.5 py-2 px-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/60 dark:border-indigo-900/40 text-center mb-4">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Users</span>
                      <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">{t.user_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Fingers</span>
                      <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">{t.finger_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Faces</span>
                      <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">{t.face_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Palms</span>
                      <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">{t.palm_count}</span>
                    </div>
                  </div>

                  {/* Queue Status summary */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-4 px-1">
                    <span>Queue:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-[10px]">
                        {t.pending_commands} pend
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-semibold text-[10px]">
                        {t.sent_commands} sent
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[10px]">
                        {t.success_commands} ok
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hardware 1-Click Control Panel */}
                {canManageHardware && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <button
                        onClick={() => handleTerminalAction(t.id, 'sync_users')}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:hover:bg-indigo-950 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                        title="Broadcast all active employees & cards to terminal"
                      >
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Sync Users</span>
                      </button>

                      <button
                        onClick={() => handleTerminalAction(t.id, 'fix_time_qatar')}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 hover:bg-amber-50 hover:text-amber-700 dark:bg-slate-800 dark:hover:bg-amber-950 dark:hover:text-amber-300 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                        title="Set terminal internal RTC to Qatar Time (GMT+3)"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Qatar Time</span>
                      </button>

                      <button
                        onClick={() => handleTerminalAction(t.id, 'clear_admin')}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 hover:bg-purple-50 hover:text-purple-700 dark:bg-slate-800 dark:hover:bg-purple-950 dark:hover:text-purple-300 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                        title="Remove admin lockout if password is lost"
                      >
                        <Unlock className="w-3.5 h-3.5 text-purple-500" />
                        <span>Clear Admin</span>
                      </button>

                      <button
                        onClick={() => handleTerminalAction(t.id, 'reboot')}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg font-medium bg-slate-100 hover:bg-rose-50 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-950 dark:hover:text-rose-300 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                        title="Reboot terminal device"
                      >
                        <Power className="w-3.5 h-3.5 text-rose-500" />
                        <span>Reboot</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <button
                        onClick={() => {
                          setSelectedTerminalOplog(t);
                          setShowOplogModal(true);
                        }}
                        className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View OPLOG
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditTerminalModal(t)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Edit Terminal Parameters"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTerminal(t)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete Terminal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 2: BIOMETRIC ENROLLMENT & BADGE DIRECTORY                          */}
      {/* ====================================================================== */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, PIN, RFID card, or dept..."
                value={empSearchTerm}
                onChange={(e) => setEmpSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ScanFace className="w-4 h-4 text-emerald-500" />
              <span>Target Enrollment Station:</span>
              <strong className="text-slate-800 dark:text-slate-200">
                {enrollmentTerminal ? enrollmentTerminal.alias : 'None (Select in Terminals Grid)'}
              </strong>
            </div>
          </div>

          {/* Directory Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-3">Device PIN / Code</th>
                    <th className="py-3 px-3">RFID Card #</th>
                    <th className="py-3 px-3">Terminal Admin</th>
                    <th className="py-3 px-3">Access State</th>
                    <th className="py-3 px-3">Biometrics Registered</th>
                    <th className="py-3 px-4 text-right">Remote Capture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No employees found matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {emp.full_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {emp.employee_number} • {emp.job_title || emp.department_id || 'Staff'}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {emp.zk_emp_code || (emp.employee_number ? emp.employee_number.replace('EMP-', '') : '—')}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {emp.zk_card_no ? (
                            <span className="px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                              {emp.zk_card_no}
                            </span>
                          ) : (
                            <span className="text-slate-400">Not assigned</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {emp.zk_is_admin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <ShieldAlert className="w-3 h-3 text-amber-500" />
                              Device Admin (14)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">User (0)</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {emp.zk_access_enabled !== false ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                              <X className="w-3.5 h-3.5" />
                              Revoked
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {emp.zk_has_face ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <ScanFace className="w-3 h-3" />
                                Face OK
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">No Face</span>
                            )}
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              <Fingerprint className="w-3 h-3 text-slate-400" />
                              {emp.zk_finger_count || 0} FP
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManageHardware && (
                              <>
                                <button
                                  onClick={() => handleRemoteEnroll(emp, 'finger')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all"
                                  title="Remote Enroll Fingerprint on Master Station"
                                >
                                  <Fingerprint className="w-3 h-3 text-emerald-500" />
                                  <span>Enroll FP</span>
                                </button>
                                <button
                                  onClick={() => handleRemoteEnroll(emp, 'face')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all"
                                  title="Remote Enroll Facial Template on Master Station"
                                >
                                  <ScanFace className="w-3 h-3 text-indigo-500" />
                                  <span>Enroll Face</span>
                                </button>
                                <button
                                  onClick={() => openEditBadgeModal(emp)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                  title="Edit Hardware PIN / Card"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 3: RAW ADMS TRANSACTIONS & SMART PAIRING FEED                     */}
      {/* ====================================================================== */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search punches by name or PIN..."
                  value={txSearchTerm}
                  onChange={(e) => setTxSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={txTerminalFilter}
                onChange={(e) => setTxTerminalFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Terminals</option>
                {terminals.map((t) => (
                  <option key={t.sn} value={t.sn}>
                    {t.alias} ({t.sn})
                  </option>
                ))}
              </select>

              <select
                value={txStateFilter}
                onChange={(e) => setTxStateFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Outcomes</option>
                <option value="Employee Check-In">Check-In</option>
                <option value="Employee Check-Out">Check-Out</option>
                <option value="Ignored (Double Punch)">Ignored (Double Punch &le;120s)</option>
                <option value="Employee Check-In (Prior Auto-Closed)">Check-In (&gt;16h Auto-Closed)</option>
              </select>
            </div>

            <button
              onClick={fetchTransactions}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Feed
            </button>
          </div>

          {/* Transactions Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Punch Time</th>
                    <th className="py-3 px-3">Device PIN</th>
                    <th className="py-3 px-3">Employee</th>
                    <th className="py-3 px-3">Terminal SN</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-3">Smart Pairing Outcome</th>
                    <th className="py-3 px-4 text-right">Attendance Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No transactions found. Use "Simulate Punch" above to trigger a live punch event.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {new Date(tx.punch_time).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {tx.emp_code}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {tx.employee_name || 'Unmapped Badge'}
                          </div>
                          {tx.employee_number && (
                            <div className="text-[10px] text-slate-400">{tx.employee_number}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {tx.terminal_sn}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            {getVerifyIcon(tx.verify_method)}
                            {tx.verify_method}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {getPunchStateBadge(tx.punch_state)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[10px] text-slate-400">
                          {tx.attendance_log_id ? (
                            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                              <Check className="w-3 h-3 text-emerald-500" />
                              {tx.attendance_log_id.slice(0, 8)}...
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TAB 4: ADMS COMMAND QUEUE (C:ID:CMD)                                  */}
      {/* ====================================================================== */}
      {activeTab === 'commands' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
              <select
                value={cmdTerminalFilter}
                onChange={(e) => setCmdTerminalFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Terminals</option>
                {terminals.map((t) => (
                  <option key={t.sn} value={t.sn}>
                    {t.alias} ({t.sn})
                  </option>
                ))}
              </select>

              <select
                value={cmdStatusFilter}
                onChange={(e) => setCmdStatusFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="sent">In-Flight (Sent)</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefreshCommands}
                  onChange={(e) => setAutoRefreshCommands(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Auto-refresh (4s)</span>
              </label>

              <button
                onClick={fetchCommands}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Commands Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Command ID</th>
                    <th className="py-3 px-3">Terminal SN</th>
                    <th className="py-3 px-3">ADMS Payload (C:ID:CMD)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Dispatched At</th>
                    <th className="py-3 px-4 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {commands.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No commands in queue.
                      </td>
                    </tr>
                  ) : (
                    commands.map((cmd) => (
                      <tr key={cmd.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          C:{cmd.id}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                          {cmd.terminal_sn}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] max-w-md truncate text-slate-600 dark:text-slate-300">
                          {cmd.command_text}
                        </td>
                        <td className="py-3 px-3">{getCommandStatusBadge(cmd.status)}</td>
                        <td className="py-3 px-3 text-[11px] text-slate-500">
                          {cmd.created_at ? new Date(cmd.created_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] text-slate-400 font-mono">
                          {cmd.updated_at ? new Date(cmd.updated_at).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL 1: REGISTER / EDIT TERMINAL                                      */}
      {/* ====================================================================== */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-500" />
                {editingTerminal ? 'Edit Terminal Configuration' : 'Register New Biometric Terminal'}
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTerminal} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Serial Number (SN) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ZK-QAT-HQ01"
                  value={terminalForm.sn}
                  onChange={(e) => setTerminalForm({ ...terminalForm, sn: e.target.value.toUpperCase() })}
                  disabled={Boolean(editingTerminal)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Alias / Location Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Terminal #01 (Doha HQ Main Gate)"
                  value={terminalForm.alias}
                  onChange={(e) => setTerminalForm({ ...terminalForm, alias: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    LAN IP Address
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.10.104"
                    value={terminalForm.lan_ip_address}
                    onChange={(e) => setTerminalForm({ ...terminalForm, lan_ip_address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Access Group
                  </label>
                  <select
                    value={terminalForm.group_id}
                    onChange={(e) => setTerminalForm({ ...terminalForm, group_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">Default Standard Group</option>
                    {accessGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    FP Algo
                  </label>
                  <input
                    type="text"
                    value={terminalForm.fp_algo}
                    onChange={(e) => setTerminalForm({ ...terminalForm, fp_algo: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Face Algo
                  </label>
                  <input
                    type="text"
                    value={terminalForm.face_algo}
                    onChange={(e) => setTerminalForm({ ...terminalForm, face_algo: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Palm Algo
                  </label>
                  <input
                    type="text"
                    value={terminalForm.palm_algo}
                    onChange={(e) => setTerminalForm({ ...terminalForm, palm_algo: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={terminalForm.is_enrollment_terminal}
                    onChange={(e) =>
                      setTerminalForm({ ...terminalForm, is_enrollment_terminal: e.target.checked })
                    }
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Designate as Master Enrollment Station</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  {editingTerminal ? 'Save Changes' : 'Register Terminal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL 2: SIMULATE BIOMETRIC PUNCH                                      */}
      {/* ====================================================================== */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-500" />
                Simulate Hardware Punch Event
              </h3>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulatePunch} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Select Employee *
                </label>
                <select
                  required
                  value={simulateForm.employee_id}
                  onChange={(e) => setSimulateForm({ ...simulateForm, employee_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Choose employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_number} • PIN: {emp.zk_emp_code || emp.employee_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Terminal Ingress
                  </label>
                  <select
                    value={simulateForm.terminal_sn}
                    onChange={(e) => setSimulateForm({ ...simulateForm, terminal_sn: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {terminals.map((t) => (
                      <option key={t.sn} value={t.sn}>
                        {t.alias} ({t.sn})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Biometric Method
                  </label>
                  <select
                    value={simulateForm.verify_method}
                    onChange={(e) => setSimulateForm({ ...simulateForm, verify_method: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="15">Face (Method 15)</option>
                    <option value="1">Fingerprint (Method 1)</option>
                    <option value="25">Palm (Method 25)</option>
                    <option value="3">RFID Card (Method 3)</option>
                    <option value="0">Password (Method 0)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Punch Timing Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSimulateForm({ ...simulateForm, timing_mode: 'now', punch_time: '' })}
                    className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                      simulateForm.timing_mode === 'now'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Current Time (Now)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulateForm({ ...simulateForm, timing_mode: 'custom' })}
                    className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                      simulateForm.timing_mode === 'custom'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Custom Timestamp
                  </button>
                </div>
              </div>

              {simulateForm.timing_mode === 'custom' && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Custom Punch Time (ISO or YYYY-MM-DD HH:MM:SS)
                  </label>
                  <input
                    type="text"
                    placeholder="2026-10-14 18:30:00"
                    value={simulateForm.punch_time}
                    onChange={(e) => setSimulateForm({ ...simulateForm, punch_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tip: Set a time &gt;16 hours after prior check-in to verify auto-close reset.
                  </p>
                </div>
              )}

              {/* Simulation Outcome Banner */}
              {simulateResult && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">Smart Engine Outcome:</span>
                    {getPunchStateBadge(simulateResult.punch_state)}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Employee: <strong>{simulateResult.employee_name}</strong> • Time: {new Date(simulateResult.punch_time).toLocaleTimeString()}
                  </div>
                  {simulateResult.duration_hours !== null && (
                    <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Calculated Shift Duration: {simulateResult.duration_hours} hrs
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSimulateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Trigger ADMS Punch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL 3: VIEW OPLOG                                                    */}
      {/* ====================================================================== */}
      {showOplogModal && selectedTerminalOplog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  Terminal Operational Audit Log (OPLOG)
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedTerminalOplog.alias} • SN: {selectedTerminalOplog.sn}
                </p>
              </div>
              <button
                onClick={() => setShowOplogModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="pt-4 space-y-3">
              <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-y-auto max-h-80 whitespace-pre-wrap border border-slate-800">
                {selectedTerminalOplog.operlog || 'No OPLOG entries received from device yet.'}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>Recent 25 operational security events buffered.</span>
                <button
                  onClick={() => setShowOplogModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* MODAL 4: EDIT EMPLOYEE HARDWARE CREDENTIALS                             */}
      {/* ====================================================================== */}
      {showEditBadgeModal && editingBadgeEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-500" />
                  Hardware Credentials
                </h3>
                <p className="text-xs text-slate-400">{editingBadgeEmp.full_name}</p>
              </div>
              <button
                onClick={() => setShowEditBadgeModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBadge} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Biometric PIN / Emp Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="1001"
                  value={badgeForm.zk_emp_code}
                  onChange={(e) => setBadgeForm({ ...badgeForm, zk_emp_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  RFID Badge / Card Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10482910"
                  value={badgeForm.zk_card_no}
                  onChange={(e) => setBadgeForm({ ...badgeForm, zk_card_no: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Device Keypad Password (PIN)
                </label>
                <input
                  type="password"
                  placeholder="Leave empty if none"
                  value={badgeForm.zk_pin}
                  onChange={(e) => setBadgeForm({ ...badgeForm, zk_pin: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={badgeForm.zk_is_admin}
                    onChange={(e) => setBadgeForm({ ...badgeForm, zk_is_admin: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Device Super Administrator (Pri = 14)</span>
                </label>

                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={badgeForm.zk_access_enabled}
                    onChange={(e) => setBadgeForm({ ...badgeForm, zk_access_enabled: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Biometric Terminal Access Permitted</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditBadgeModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Save & Push to Clocks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HardwareTerminalsView;
