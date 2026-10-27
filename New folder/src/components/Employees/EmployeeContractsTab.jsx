import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  Percent,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Sparkles,
  X,
  FileCheck2,
} from 'lucide-react';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';

export function EmployeeContractsTab({
  employeeId,
  employeeName,
  employeeNumber,
  baseSalary = 0,
  currency = 'QAR',
  onContractSalarySync,
}) {
  const { hasPermission } = useAccessControl();
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const canReadContracts = hasPermission('hr.contracts_read');
  const canManageContracts = hasPermission('hr.contracts_manage');
  const canReadSalary = hasPermission('hr.salary_read');
  const canManageSalary = hasPermission('hr.salary_manage');

  const [contracts, setContracts] = useState([]);
  const [selectedContractId, setSelectedContractId] = useState(null);
  const [salaryRules, setSalaryRules] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Employee Grade Context
  const [employeeGrade, setEmployeeGrade] = useState({ id: null, name: null, code: null });

  // Modals & Panels
  const [isAddBenefitModalOpen, setIsAddBenefitModalOpen] = useState(false);
  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [benefitModalError, setBenefitModalError] = useState(null);

  // Add Benefit Form State
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [benefitCalcType, setBenefitCalcType] = useState('fixed_amount');
  const [benefitAmountValue, setBenefitAmountValue] = useState(0);

  // New Contract Form State
  const [newContractForm, setNewContractForm] = useState({
    title: 'Expat Fixed-Term Employment Agreement',
    contract_reference: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    isOpenEnded: false,
    wage_base: baseSalary || 20000,
    currency: currency || 'QAR',
    status: 'active',
    notice_period_days: 30,
    trial_period_days: 90,
    working_hours_per_week: 40.0,
    terms_notes: 'Standard bilateral employment contract compliant with Qatar Labour Law.',
  });

  const getHeaders = (hasBody = true) => {
    const headers = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
  };

  // Current selected contract object
  const activeContract = useMemo(() => {
    if (!contracts || contracts.length === 0) return null;
    if (selectedContractId) {
      return contracts.find((c) => c.id === selectedContractId) || contracts[0];
    }
    // Default to active contract first, or most recent
    return contracts.find((c) => c.status === 'active') || contracts[0];
  }, [contracts, selectedContractId]);

  // Fetch contracts & salary rules
  const fetchData = async () => {
    if (!employeeId) return;
    setIsLoading(true);
    try {
      const headers = getHeaders(false);
      const [contractsRes, rulesRes] = await Promise.all([
        fetch(`/api/v1/employees/${employeeId}/contracts`, { headers }),
        fetch('/api/v1/salary-rules', { headers }),
      ]);

      let currentGrade = { id: null, name: null, code: null };
      if (contractsRes.ok) {
        const cData = await contractsRes.json();
        setContracts(cData.contracts || []);
        currentGrade = {
          id: cData.grade_id || null,
          name: cData.grade_name || null,
          code: cData.grade_code || null,
        };
        setEmployeeGrade(currentGrade);
        if (cData.contracts && cData.contracts.length > 0 && !selectedContractId) {
          const active = cData.contracts.find((c) => c.status === 'active');
          setSelectedContractId(active ? active.id : cData.contracts[0].id);
        }
      }

      if (rulesRes.ok) {
        const rData = await rulesRes.json();
        setSalaryRules(rData.rules || []);
        if (rData.rules && rData.rules.length > 0 && !selectedRuleId) {
          const firstRule = rData.rules[0];
          setSelectedRuleId(firstRule.id);
          const hasGradeRate = currentGrade.id && firstRule.grade_rates && firstRule.grade_rates[currentGrade.id] !== undefined;
          const isGrade = firstRule.calculation_type === 'grade_based' || hasGradeRate;
          if (isGrade) {
            setBenefitCalcType('grade_based');
            setBenefitAmountValue(
              hasGradeRate
                ? firstRule.grade_rates[currentGrade.id]
                : parseFloat(firstRule.default_amount) || 0
            );
          } else if (firstRule.calculation_type === 'percentage_of_base') {
            setBenefitCalcType('percentage_of_base');
            setBenefitAmountValue(parseFloat(firstRule.percentage_rate) || 20);
          } else {
            setBenefitCalcType(firstRule.calculation_type || 'fixed_amount');
            setBenefitAmountValue(parseFloat(firstRule.default_amount) || 1000);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load contract and salary rules:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [employeeId]);

  const showFeedback = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Rule selection change handler
  const handleRuleSelect = (ruleId) => {
    setSelectedRuleId(ruleId);
    const rule = salaryRules.find((r) => r.id === ruleId);
    if (rule) {
      const hasGradeRate = employeeGrade?.id && rule.grade_rates && rule.grade_rates[employeeGrade.id] !== undefined;
      const isGradeBased = rule.calculation_type === 'grade_based' || hasGradeRate;
      if (isGradeBased) {
        setBenefitCalcType('grade_based');
        const gradeVal = hasGradeRate
          ? rule.grade_rates[employeeGrade.id]
          : parseFloat(rule.default_amount) || 0;
        setBenefitAmountValue(gradeVal);
      } else if (rule.calculation_type === 'percentage_of_base') {
        setBenefitCalcType('percentage_of_base');
        setBenefitAmountValue(parseFloat(rule.percentage_rate) || 20);
      } else {
        setBenefitCalcType(rule.calculation_type || 'fixed_amount');
        setBenefitAmountValue(parseFloat(rule.default_amount) || 1000);
      }
    }
  };

  // Real-time calculation of package breakdown
  const packageSummary = useMemo(() => {
    if (!activeContract) {
      return {
        baseWage: 0,
        allowancesTotal: 0,
        deductionsTotal: 0,
        netPackage: 0,
      };
    }

    const baseWage = parseFloat(activeContract.wage_base) || 0;
    const lines = activeContract.benefit_lines || [];

    let allowancesTotal = 0;
    let deductionsTotal = 0;

    lines.forEach((line) => {
      const amt = parseFloat(line.computed_monthly_total) || 0;
      if (line.rule_category === 'deduction') {
        deductionsTotal += amt;
      } else {
        allowancesTotal += amt;
      }
    });

    return {
      baseWage,
      allowancesTotal,
      deductionsTotal,
      netPackage: Math.round((baseWage + allowancesTotal - deductionsTotal) * 100) / 100,
    };
  }, [activeContract]);

  const currentUserId = auth?.user?.id;
  const isMakerOrSubmitter = Boolean(
    currentUserId && activeContract && (
      String(activeContract.created_by) === String(currentUserId) ||
      String(activeContract.submitted_by) === String(currentUserId)
    )
  );

  // Submit contract for dual-control checker approval
  const handleSubmitContract = async (contractId) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/submit`, {
        method: 'POST',
        headers: getHeaders(false),
      });
      if (res.ok) {
        const updated = await res.json();
        showFeedback(`Contract ${updated.contract_reference} submitted for dual-control approval.`);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showFeedback(err.detail || 'Failed to submit contract for approval', 'error');
      }
    } catch (e) {
      showFeedback('Network error submitting contract', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reject contract
  const handleRejectContract = async (contractId) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/reject`, {
        method: 'POST',
        headers: getHeaders(false),
      });
      if (res.ok) {
        const updated = await res.json();
        showFeedback(`Contract ${updated.contract_reference} rejected.`, 'info');
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showFeedback(err.detail || 'Failed to reject contract', 'error');
      }
    } catch (e) {
      showFeedback('Network error rejecting contract', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Activate contract (Checker dual control)
  const handleActivateContract = async (contractId) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/contracts/${contractId}/activate`, {
        method: 'POST',
        headers: getHeaders(false),
      });
      if (res.ok) {
        const updated = await res.json();
        showFeedback(`Contract ${updated.contract_reference} successfully activated! Prior contracts archived.`);
        onContractSalarySync?.(updated.wage_base, updated.currency);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showFeedback(err.detail || 'Failed to activate contract', 'error');
      }
    } catch (e) {
      showFeedback('Network error activating contract', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Benefit Line to active contract
  const handleAddBenefitSubmit = async (e) => {
    e.preventDefault();
    if (!activeContract || !selectedRuleId) return;

    setIsSaving(true);
    setBenefitModalError(null);
    try {
      const res = await fetch(`/api/v1/contracts/${activeContract.id}/benefits`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
          rule_id: selectedRuleId,
          calculation_type: benefitCalcType,
          amount_value: parseFloat(benefitAmountValue) || 0,
        }),
      });

      if (res.ok) {
        showFeedback('Benefit rule attached to contract successfully.');
        setBenefitModalError(null);
        setIsAddBenefitModalOpen(false);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.detail || 'Failed to add benefit line';
        setBenefitModalError(errMsg);
        showFeedback(errMsg, 'error');
      }
    } catch (e) {
      const errMsg = 'Error adding benefit line';
      setBenefitModalError(errMsg);
      showFeedback(errMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Benefit Line
  const handleDeleteBenefitLine = async (benefitId) => {
    if (!activeContract) return;
    try {
      const res = await fetch(`/api/v1/contracts/${activeContract.id}/benefits/${benefitId}`, {
        method: 'DELETE',
        headers: getHeaders(false),
      });
      if (res.ok) {
        showFeedback('Benefit line removed.', 'info');
        await fetchData();
      } else {
        showFeedback('Failed to remove benefit line', 'error');
      }
    } catch (e) {
      showFeedback('Error deleting benefit line', 'error');
    }
  };

  // Create New Contract
  const handleCreateContractSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setModalError(null);
    try {
      const payload = {
        title: newContractForm.title,
        contract_reference: newContractForm.contract_reference || undefined,
        start_date: newContractForm.start_date,
        end_date: newContractForm.isOpenEnded ? null : newContractForm.end_date || null,
        wage_base: parseFloat(newContractForm.wage_base) || 0,
        currency: newContractForm.currency || 'QAR',
        status: newContractForm.status || 'draft',
        notice_period_days: parseInt(newContractForm.notice_period_days, 10) || 30,
        trial_period_days: parseInt(newContractForm.trial_period_days, 10) || 90,
        working_hours_per_week: parseFloat(newContractForm.working_hours_per_week) || 40.0,
        terms_notes: newContractForm.terms_notes,
      };

      const res = await fetch(`/api/v1/employees/${employeeId}/contracts`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        showFeedback(`New contract ${created.contract_reference} created successfully.`);
        setModalError(null);
        setNewContractForm({
          title: 'Expat Fixed-Term Employment Agreement',
          contract_reference: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          isOpenEnded: false,
          wage_base: baseSalary || 20000,
          currency: currency || 'QAR',
          status: 'active',
          notice_period_days: 30,
          trial_period_days: 90,
          working_hours_per_week: 40.0,
          terms_notes: 'Standard bilateral employment contract compliant with Qatar Labour Law.',
        });
        setIsNewContractModalOpen(false);
        setSelectedContractId(created.id);
        if (payload.status === 'active') {
          onContractSalarySync?.(created.wage_base, created.currency);
        }
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.detail || 'Failed to create contract';
        setModalError(errMsg);
        showFeedback(errMsg, 'error');
      }
    } catch (e) {
      const errMsg = 'Error creating contract';
      setModalError(errMsg);
      showFeedback(errMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!employeeId) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h4 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
          Employment Contracts
        </h4>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
          Save the employee record first before adding employment contracts and compensation breakdown.
        </p>
      </div>
    );
  }

  if (!canReadContracts) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
        <ShieldCheck className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h4 className="text-[15px] font-semibold text-rose-700 dark:text-rose-300">
          Access Restricted
        </h4>
        <p className="text-[13px] text-rose-600 dark:text-rose-400 max-w-sm mx-auto mt-1">
          You do not have permission to view employment contracts and compensation terms.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 border-t border-slate-200 dark:border-slate-800">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-medium animate-fadeIn ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Contract Version Bar & Switcher Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <label htmlFor="contract-version-select" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            Select Version:
          </label>
          <div className="relative flex-1">
            <select
              id="contract-version-select"
              value={activeContract?.id || ''}
              onChange={(e) => setSelectedContractId(e.target.value)}
              className="w-full h-[40px] text-[14px] font-medium pl-3.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none"
            >
              {contracts.length === 0 ? (
                <option value="">No contracts created</option>
              ) : (
                contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_reference} ({c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Draft'}) - {c.start_date || 'N/A'}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {canManageContracts && (
          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setNewContractForm({
                title: `Employment Contract Renewal - ${employeeName || 'Staff'}`,
                contract_reference: `CNT-${new Date().getFullYear()}-${employeeNumber ? String(employeeNumber).replace('EMP-', '') : '0000'}-${contracts.length + 1}`,
                start_date: new Date().toISOString().split('T')[0],
                end_date: '',
                isOpenEnded: false,
                wage_base: activeContract?.wage_base || 20000,
                currency: activeContract?.currency || 'QAR',
                status: 'draft',
                notice_period_days: 30,
                trial_period_days: 90,
                working_hours_per_week: 40.0,
                terms_notes: 'Standard bilateral employment contract.',
              });
              setIsNewContractModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Contract Version</span>
          </button>
        )}
      </div>

      {activeContract ? (
        <div className="space-y-6">
          {/* 1. CONTRACT MANAGEMENT CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeContract.title}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                      {activeContract.contract_reference}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        activeContract.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : activeContract.status === 'pending_approval'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : activeContract.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {activeContract.status === 'pending_approval' ? 'Pending Approval' : activeContract.status}
                    </span>
                    {employeeGrade.name && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {employeeGrade.code ? `${employeeGrade.code} • ` : ''}{employeeGrade.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {canManageContracts && activeContract.status !== 'active' && (
                <div className="flex items-center gap-2">
                  {/* Draft Status: Submit for Dual-Control Review */}
                  {activeContract.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleSubmitContract(activeContract.id)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Submit for Approval</span>
                    </button>
                  )}

                  {/* Pending Approval Status: Reject Button */}
                  {activeContract.status === 'pending_approval' && !isMakerOrSubmitter && (
                    <button
                      type="button"
                      onClick={() => handleRejectContract(activeContract.id)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}

                  {/* Activate / Approve Button */}
                  <button
                    type="button"
                    onClick={() => handleActivateContract(activeContract.id)}
                    disabled={isSaving || (activeContract.status === 'pending_approval' && isMakerOrSubmitter)}
                    title={
                      activeContract.status === 'pending_approval' && isMakerOrSubmitter
                        ? 'SOX 404 Dual-Control: Independent checker required (cannot approve own submission)'
                        : 'Approve and activate contract'
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-xs transition ${
                      activeContract.status === 'pending_approval' && isMakerOrSubmitter
                        ? 'bg-slate-400 dark:bg-slate-700 text-slate-200 cursor-not-allowed opacity-60'
                        : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                    }`}
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>{activeContract.status === 'pending_approval' ? 'Approve & Activate' : 'Activate Contract'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* SOX 404 Maker-Checker Advisory Banner if user is creator/submitter */}
            {activeContract.status === 'pending_approval' && isMakerOrSubmitter && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  <strong>SOX 404 Dual Control:</strong> You are the author/submitter of this contract. To enforce Segregation of Duties, approval must be completed by an independent checker.
                </span>
              </div>
            )}

            {/* Contract Key Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block font-medium">Duration Period</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono mt-0.5 block">
                  {activeContract.start_date || 'N/A'}{' '}
                  <span className="text-slate-400 font-sans">to</span>{' '}
                  {activeContract.end_date ? activeContract.end_date : 'Open-Ended (Permanent)'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block font-medium">Monthly Base Wage</span>
                {canReadSalary ? (
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-[15px] mt-0.5 block">
                    {activeContract.wage_base !== null && activeContract.wage_base !== undefined
                      ? `${Number(activeContract.wage_base).toLocaleString()} ${activeContract.currency}`
                      : '—'}
                  </span>
                ) : (
                  <div className="flex flex-col gap-1 mt-0.5">
                    <span className="font-bold font-mono text-xs text-slate-400">•••••• {activeContract.currency || 'QAR'}</span>
                    <span className="inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Restricted Confidential Field
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block font-medium">Notice & Probation</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono mt-0.5 block">
                  {activeContract.notice_period_days || 30}d notice • {activeContract.trial_period_days || 90}d trial
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block font-medium">Working Schedule</span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono mt-0.5 block">
                  {activeContract.working_hours_per_week || 40.0} hrs/week
                </span>
              </div>
            </div>

            {activeContract.terms_notes && (
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 font-mono">
                Notes: {activeContract.terms_notes}
              </p>
            )}

            {/* SOX 404 Audit & Dual Control Meta Bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block font-medium">Created By (Maker)</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                  {activeContract.created_by ? `User #${String(activeContract.created_by).slice(0, 8)}` : 'System Staff'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Submitted By</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                  {activeContract.submitted_by ? `User #${String(activeContract.submitted_by).slice(0, 8)}` : (activeContract.status !== 'draft' ? 'Direct Submission' : '—')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Approved By (Checker)</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                  {activeContract.approved_by ? `User #${String(activeContract.approved_by).slice(0, 8)}` : (activeContract.status === 'active' ? 'Approved' : 'Pending Review')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Approved At</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                  {activeContract.approved_at ? String(activeContract.approved_at).slice(0, 10) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. COMPENSATION BREAKDOWN */}
          {canReadSalary && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    Compensation Breakdown
                  </h4>
                </div>

                {canManageSalary && (
                  <button
                    type="button"
                    onClick={() => {
                      setBenefitModalError(null);
                      setIsAddBenefitModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Benefit / Rule</span>
                  </button>
                )}
              </div>

              {/* Dynamic Benefit Lines Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Rule / Benefit Name</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Calculation Type</th>
                      <th className="px-3 py-3">Configured Value</th>
                      <th className="px-3 py-3 text-right">Monthly Cash Total</th>
                      {canManageSalary && <th className="px-3 py-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {/* Row 0: Base Wage as immutable core line */}
                    <tr className="bg-blue-50/30 dark:bg-blue-950/20 font-semibold">
                      <td className="px-4 py-3 text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span>Core Base Wage</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                          Base Wage
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-400 font-mono">Statutory Base</td>
                      <td className="px-3 py-3 font-mono font-bold">100%</td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {packageSummary.baseWage.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                        {activeContract.currency}
                      </td>
                      {canManageSalary && <td className="px-3 py-3 text-right text-slate-400 text-[11px]">—</td>}
                    </tr>

                    {(!activeContract.benefit_lines || activeContract.benefit_lines.length === 0) ? (
                      <tr>
                        <td colSpan={canManageSalary ? 6 : 5} className="py-6 text-center text-slate-400 text-xs">
                          No supplementary benefits or deductions attached to this contract. {canManageSalary ? 'Click "+ Add Benefit / Rule" above.' : ''}
                        </td>
                      </tr>
                    ) : (
                      activeContract.benefit_lines.map((b) => {
                        const isDeduction = b.rule_category === 'deduction';
                        return (
                          <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {b.rule_name}
                              </div>
                              <span className="font-mono text-[10px] text-slate-400">
                                {b.rule_id} {b.wps_code ? `• WPS: ${b.wps_code}` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  isDeduction
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                }`}
                              >
                                {b.rule_category || 'Allowance'}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono text-[11px]">
                              {b.calculation_type === 'percentage_of_base'
                                ? '% of Base Wage'
                                : b.calculation_type === 'grade_based'
                                ? 'Grade Matrix'
                                : 'Fixed Monthly'}
                            </td>
                            <td className="px-3 py-3 font-mono font-semibold">
                              {b.calculation_type === 'percentage_of_base'
                                ? `${b.amount_value}%`
                                : `${Number(b.amount_value).toLocaleString()} ${activeContract.currency}`}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono font-bold ${
                                isDeduction
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isDeduction ? '-' : '+'}
                              {Number(b.computed_monthly_total).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}{' '}
                              {activeContract.currency}
                            </td>
                            {canManageSalary && (
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBenefitLine(b.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                                  title="Remove Benefit Line"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* COMPENSATION TOTALS SUMMARY */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 block">Base Monthly Wage</span>
                  <span className="text-[15px] font-bold font-mono text-slate-900 dark:text-white mt-1 block">
                    {packageSummary.baseWage.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {activeContract.currency}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                      Total Allowances
                    </span>
                  </div>
                  <span className="text-[15px] font-bold font-mono text-slate-900 dark:text-white mt-1 block">
                    +{packageSummary.allowancesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {activeContract.currency}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                      Total Deductions
                    </span>
                  </div>
                  <span className="text-[15px] font-bold font-mono text-slate-900 dark:text-white mt-1 block">
                    -{packageSummary.deductionsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {activeContract.currency}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-blue-200/80 dark:border-blue-900/60">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                    <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      Net Monthly Package
                    </span>
                  </div>
                  <span className="text-[16px] font-bold font-mono text-blue-600 dark:text-blue-400 mt-1 block">
                    {packageSummary.netPackage.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                    {activeContract.currency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <p className="text-xs text-slate-500">No active contracts found for this employee.</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD BENEFIT / SALARY RULE MODAL */}
      {/* ========================================================================= */}
      {isAddBenefitModalOpen && canManageSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Add Benefit / Salary Rule
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Attach a compensation rule to contract #{activeContract?.contract_reference}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBenefitModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {benefitModalError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{benefitModalError}</span>
              </div>
            )}

            <form onSubmit={handleAddBenefitSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Salary Rule Definition
                </label>
                <select
                  value={selectedRuleId}
                  onChange={(e) => handleRuleSelect(e.target.value)}
                  className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                >
                  {salaryRules.map((r) => {
                    let desc = `${r.default_amount} QAR fixed`;
                    if (r.calculation_type === 'percentage_of_base') {
                      desc = `${r.percentage_rate}% of Base`;
                    } else if (r.calculation_type === 'grade_based' || (r.grade_rates && Object.keys(r.grade_rates).length > 0)) {
                      desc = employeeGrade?.id && r.grade_rates?.[employeeGrade.id] !== undefined
                        ? `${r.grade_rates[employeeGrade.id]} QAR (Grade ${employeeGrade.code || employeeGrade.id})`
                        : 'Grade Matrix';
                    }
                    return (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.category.toUpperCase()} • {desc})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Calculation Engine
                  </label>
                  <select
                    value={benefitCalcType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBenefitCalcType(val);
                      const rule = salaryRules.find((r) => r.id === selectedRuleId);
                      if (val === 'grade_based' && rule) {
                        const hasRate = employeeGrade?.id && rule.grade_rates && rule.grade_rates[employeeGrade.id] !== undefined;
                        setBenefitAmountValue(hasRate ? rule.grade_rates[employeeGrade.id] : parseFloat(rule.default_amount) || 0);
                      }
                    }}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
                  >
                    <option value="percentage_of_base">% of Base Wage</option>
                    <option value="fixed_amount">Fixed Monthly Cash</option>
                    <option value="grade_based">Grade-Based Rate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {benefitCalcType === 'percentage_of_base'
                      ? 'Percentage Rate (%)'
                      : benefitCalcType === 'grade_based'
                      ? 'Grade Amount (QAR)'
                      : 'Amount Value'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={benefitAmountValue}
                    onChange={(e) => setBenefitAmountValue(e.target.value)}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                  />
                </div>
              </div>

              {benefitCalcType === 'grade_based' && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/80 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>
                    Auto-resolved from Employee Grade {employeeGrade.code ? `(${employeeGrade.code} • ${employeeGrade.name})` : employeeGrade.name || ''}
                  </span>
                </div>
              )}

              {/* Preview Box */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between font-mono">
                <span className="text-slate-400 text-[11px]">Computed Monthly Total:</span>
                <span className="font-bold text-sm text-blue-600 dark:text-blue-400">
                  {benefitCalcType === 'percentage_of_base'
                    ? ((packageSummary.baseWage * (parseFloat(benefitAmountValue) || 0)) / 100).toFixed(2)
                    : Number(benefitAmountValue || 0).toFixed(2)}{' '}
                  {activeContract?.currency || 'QAR'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddBenefitModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Attaching...' : 'Add to Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE NEW CONTRACT / RENEWAL MODAL */}
      {/* ========================================================================= */}
      {isNewContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Create New Contract Version
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Configure contract terms and compensation structure
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewContractModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateContractSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Contract Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newContractForm.title}
                    onChange={(e) => setNewContractForm({ ...newContractForm, title: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Contract Reference (Auto or Custom)
                  </label>
                  <input
                    type="text"
                    value={newContractForm.contract_reference}
                    onChange={(e) => setNewContractForm({ ...newContractForm, contract_reference: e.target.value })}
                    placeholder="e.g. CNT-2026-1001-2"
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Start Effective Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newContractForm.start_date}
                    onChange={(e) => setNewContractForm({ ...newContractForm, start_date: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      End Date
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        checked={newContractForm.isOpenEnded}
                        onChange={(e) =>
                          setNewContractForm({ ...newContractForm, isOpenEnded: e.target.checked })
                        }
                        className="rounded text-blue-600"
                      />
                      <span>Open-Ended / Permanent</span>
                    </label>
                  </div>
                  <input
                    type="date"
                    disabled={newContractForm.isOpenEnded}
                    value={newContractForm.isOpenEnded ? '' : newContractForm.end_date}
                    onChange={(e) => setNewContractForm({ ...newContractForm, end_date: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Monthly Base Wage
                  </label>
                  {canReadSalary ? (
                    <input
                      type="number"
                      step="0.01"
                      required
                      disabled={!canManageSalary}
                      value={newContractForm.wage_base}
                      onChange={(e) => setNewContractForm({ ...newContractForm, wage_base: e.target.value })}
                      className={`w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 ${
                        !canManageSalary
                          ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold`}
                    />
                  ) : (
                    <div className="flex items-center gap-2 h-10 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-400">
                      <span className="font-mono font-bold">•••••• {newContractForm.currency}</span>
                      <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded">
                        Restricted
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Currency
                  </label>
                  <input
                    type="text"
                    disabled={!canManageSalary}
                    value={newContractForm.currency}
                    onChange={(e) => setNewContractForm({ ...newContractForm, currency: e.target.value })}
                    className={`w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 ${
                      !canManageSalary
                        ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Status
                  </label>
                  <select
                    value={newContractForm.status}
                    onChange={(e) => setNewContractForm({ ...newContractForm, status: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
                  >
                    <option value="draft">Draft (Review)</option>
                    <option value="active">Active (Current)</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Notice (Days)
                  </label>
                  <input
                    type="number"
                    value={newContractForm.notice_period_days}
                    onChange={(e) => setNewContractForm({ ...newContractForm, notice_period_days: e.target.value })}
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Hours / Week
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newContractForm.working_hours_per_week}
                    onChange={(e) =>
                      setNewContractForm({ ...newContractForm, working_hours_per_week: e.target.value })
                    }
                    className="w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Terms & Conditions Notes
                </label>
                <textarea
                  rows={2}
                  value={newContractForm.terms_notes}
                  onChange={(e) => setNewContractForm({ ...newContractForm, terms_notes: e.target.value })}
                  className="w-full px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewContractModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Creating...' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeContractsTab;
