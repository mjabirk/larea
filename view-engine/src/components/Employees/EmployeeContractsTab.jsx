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
  Lock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';
import { useSystemLookups } from '../../services/lookupService';
import { notifyRecordChatterUpdated } from '../../utils/urlState';

export function EmployeeContractsTab({
  employeeId,
  employeeName,
  employeeNumber,
  baseSalary = 0,
  currency = 'QAR',
  onContractSalarySync,
}) {
  const { hasPermission } = useAccessControl();
  const { currencies } = useSystemLookups();
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
  const [availableGrades, setAvailableGrades] = useState([]);

  // Modals & Panels
  const [isAddBenefitModalOpen, setIsAddBenefitModalOpen] = useState(false);
  const [isNewContractModalOpen, setIsNewContractModalOpen] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [benefitModalError, setBenefitModalError] = useState(null);

  // Amendment Modal State
  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [amendModalError, setAmendModalError] = useState(null);
  const [selectedNewRuleId, setSelectedNewRuleId] = useState('');
  const [amendFormData, setAmendFormData] = useState({
    wage_base: baseSalary || 20000,
    currency: currency || 'QAR',
    grade_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    isOpenEnded: false,
    amendment_reason: '',
    benefit_lines: [],
  });

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
    terms_notes: 'Standard employment agreement.',
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

  // Chronological revisions timeline
  const chronologicalRevisions = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const da = a.start_date || '';
      const db = b.start_date || '';
      if (da !== db) return da.localeCompare(db);
      return (a.revision_number || 1) - (b.revision_number || 1);
    });
  }, [contracts]);

  // Fetch contracts, salary rules & employee grades
  const fetchData = async () => {
    if (!employeeId) return;
    setIsLoading(true);
    try {
      const headers = getHeaders(false);
      const [contractsRes, rulesRes, gradesRes] = await Promise.all([
        fetch(`/api/v1/employees/${employeeId}/contracts`, { headers }),
        fetch('/api/v1/salary-rules', { headers }),
        fetch('/api/v1/employee-grades', { headers }),
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

      if (gradesRes.ok) {
        const gData = await gradesRes.json();
        setAvailableGrades(gData.grades || []);
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
        showFeedback(`Contract ${updated.contract_reference} activated.`);
        onContractSalarySync?.(updated.wage_base, updated.currency);
        notifyRecordChatterUpdated(employeeId, 'employees');
        notifyRecordChatterUpdated(contractId, 'contracts');
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

  const handleOpenAmendModal = () => {
    if (!activeContract) return;
    setAmendModalError(null);

    const currentLines = (activeContract.benefit_lines || []).map((b) => ({
      rule_id: b.rule_id,
      rule_name: b.rule_name || b.rule_id,
      rule_category: b.rule_category || 'allowance',
      calculation_type: b.calculation_type || 'fixed_amount',
      amount_value: b.amount_value !== null && b.amount_value !== undefined ? Number(b.amount_value) : 0,
      computed_monthly_total: b.computed_monthly_total || 0,
    }));

    setAmendFormData({
      wage_base: activeContract.wage_base ?? baseSalary ?? 20000,
      currency: activeContract.currency || currency || 'QAR',
      grade_id: activeContract.grade_id || employeeGrade.id || (availableGrades[0]?.id || ''),
      start_date: new Date().toISOString().split('T')[0],
      end_date: activeContract.end_date || '',
      isOpenEnded: !activeContract.end_date,
      amendment_reason: '',
      benefit_lines: currentLines,
    });
    setSelectedNewRuleId('');
    setIsAmendModalOpen(true);
  };

  const handleAmendSubmit = async (e) => {
    e?.preventDefault();
    if (!activeContract) return;

    const cleanReason = (amendFormData.amendment_reason || '').trim();
    if (!cleanReason) {
      setAmendModalError('Please enter a reason for this contract amendment.');
      return;
    }

    if (!amendFormData.start_date) {
      setAmendModalError('New effective start date is required.');
      return;
    }

    setIsAmending(true);
    setAmendModalError(null);

    try {
      const headers = getHeaders(true);
      const payload = {
        amendment_reason: cleanReason,
        wage_base: canManageSalary ? Number(amendFormData.wage_base) : undefined,
        currency: amendFormData.currency,
        grade_id: amendFormData.grade_id || undefined,
        start_date: amendFormData.start_date,
        end_date: amendFormData.isOpenEnded ? null : (amendFormData.end_date || null),
        benefit_lines: amendFormData.benefit_lines.map((b) => ({
          rule_id: b.rule_id,
          calculation_type: b.calculation_type,
          amount_value: Number(b.amount_value) || 0,
        })),
      };

      const res = await fetch(`/api/v1/contracts/${activeContract.id}/amend`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to amend contract');
      }

      const created = await res.json();
      setIsAmendModalOpen(false);
      showFeedback(
        `Contract successfully amended as Revision ${created.revision_number || '2'} (${created.contract_reference}). Prior contract archived.`,
        'success'
      );

      // Update contracts array and immediately select the new revision
      setContracts((prev) => {
        const updated = prev.map((c) => (c.id === activeContract.id ? { ...c, status: 'amended' } : c));
        return [created, ...updated];
      });
      setSelectedContractId(created.id);

      onContractSalarySync?.(created.wage_base, created.currency);
      notifyRecordChatterUpdated(employeeId, 'employees');
      notifyRecordChatterUpdated(created.id, 'contracts');
      await fetchData();
    } catch (err) {
      console.error('Failed to amend contract:', err);
      setAmendModalError(err.message || 'Failed to amend contract');
    } finally {
      setIsAmending(false);
    }
  };

  const handleAmendAddBenefit = (ruleId) => {
    if (!ruleId) return;
    const rule = salaryRules.find((r) => r.id === ruleId);
    if (!rule) return;

    if (amendFormData.benefit_lines.some((b) => b.rule_id === ruleId)) {
      setAmendModalError(`Rule '${rule.name}' is already attached to this amendment.`);
      return;
    }

    let defAmt = Number(rule.default_amount) || 0;
    if (rule.calculation_type === 'grade_based' && amendFormData.grade_id && rule.grade_rates?.[amendFormData.grade_id] !== undefined) {
      defAmt = Number(rule.grade_rates[amendFormData.grade_id]);
    }

    setAmendFormData((prev) => ({
      ...prev,
      benefit_lines: [
        ...prev.benefit_lines,
        {
          rule_id: rule.id,
          rule_name: rule.name,
          rule_category: rule.category,
          calculation_type: rule.calculation_type,
          amount_value: defAmt,
          computed_monthly_total: defAmt,
        },
      ],
    }));
    setSelectedNewRuleId('');
    setAmendModalError(null);
  };

  const handleAmendRemoveBenefit = (index) => {
    setAmendFormData((prev) => ({
      ...prev,
      benefit_lines: prev.benefit_lines.filter((_, i) => i !== index),
    }));
  };

  const handleAmendUpdateBenefitValue = (index, val) => {
    setAmendFormData((prev) => {
      const updated = [...prev.benefit_lines];
      updated[index] = { ...updated[index], amount_value: val };
      return { ...prev, benefit_lines: updated };
    });
  };

  const computeLineMonthlyPreview = (line, wageBase, gradeId) => {
    const rule = salaryRules.find((r) => r.id === line.rule_id);
    const wage = Number(wageBase) || 0;
    const val = Number(line.amount_value) || 0;
    const calc = line.calculation_type || (rule?.calculation_type) || 'fixed_amount';

    if (calc === 'grade_based') {
      if (gradeId && rule?.grade_rates && rule.grade_rates[gradeId] !== undefined) {
        return Number(rule.grade_rates[gradeId]);
      }
      if (val > 0) return val;
      return Number(rule?.default_amount) || 0;
    }
    if (calc === 'percentage_of_base') {
      return Math.round((wage * val) / 100 * 100) / 100;
    }
    return val;
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
          terms_notes: 'Standard employment agreement.',
        });
        setIsNewContractModalOpen(false);
        setSelectedContractId(created.id);
        if (payload.status === 'active') {
          onContractSalarySync?.(created.wage_base, created.currency);
        }
        notifyRecordChatterUpdated(employeeId, 'employees');
        notifyRecordChatterUpdated(created.id, 'contracts');
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

      {/* Visual Contract Revision Timeline */}
      {chronologicalRevisions && chronologicalRevisions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Contract Revision Timeline
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">
              {chronologicalRevisions.length} {chronologicalRevisions.length === 1 ? 'version' : 'revisions'} • Click any to inspect
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {chronologicalRevisions.map((rev, index) => {
              const isSelected = rev.id === activeContract?.id;
              const isLast = index === chronologicalRevisions.length - 1;
              const dateRange = `${rev.start_date || 'N/A'} → ${rev.end_date || 'Present'}`;
              const grade =
                rev.grade_code ||
                rev.grade_name ||
                availableGrades.find((g) => g.id === rev.grade_id)?.code ||
                null;

              return (
                <React.Fragment key={rev.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedContractId(rev.id)}
                    className={`flex-shrink-0 text-left p-3 rounded-xl border transition-all cursor-pointer relative min-w-[210px] ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200">
                        Rev {rev.revision_number || index + 1}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                          rev.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : rev.status === 'amended'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                            : rev.status === 'expired'
                            ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {rev.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">
                          {rev.contract_reference || `CNT-${index + 1}`}
                        </span>
                        {grade && (
                          <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-500/20">
                            {grade}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {dateRange}
                      </div>

                      {canReadSalary && (
                        <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 pt-0.5">
                          {Number(rev.wage_base || 0).toLocaleString()} {rev.currency || 'QAR'}
                        </div>
                      )}
                    </div>
                  </button>

                  {!isLast && (
                    <div className="flex items-center text-slate-300 dark:text-slate-600 shrink-0 px-0.5">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

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

              {canManageContracts && (activeContract.status === 'active' || activeContract.status === 'approved') && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAmendModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+ Amend Contract</span>
                  </button>
                </div>
              )}

              {canManageContracts && activeContract.status !== 'active' && activeContract.status !== 'approved' && (
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
                        ? 'Another reviewer must approve your submitted contract'
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

            {/* Active Contract Banner */}
            {(activeContract.status === 'active' || activeContract.status === 'approved') && (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold">Active Contract — Terms Locked</span>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                      Salary, dates, and contract reference are locked while active. Use Amend Contract to make changes.
                    </p>
                  </div>
                </div>
                {canManageContracts && (
                  <button
                    type="button"
                    onClick={handleOpenAmendModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Amend Contract</span>
                  </button>
                )}
              </div>
            )}

            {/* Reviewer Advisory Banner if user is creator/submitter */}
            {activeContract.status === 'pending_approval' && isMakerOrSubmitter && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  <strong>Awaiting Second Review:</strong> Because you submitted this contract, another authorized reviewer must approve it.
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

            {/* Approval Metadata Bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Status</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium capitalize">
                  {(activeContract.status || 'draft').replace('_', ' ')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Approval</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {activeContract.approved_by || activeContract.status === 'active' ? 'Approved' : 'Pending Review'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Approved Date</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-300 font-medium">
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
                  (activeContract.status === 'active' || activeContract.status === 'approved') ? (
                    <button
                      type="button"
                      onClick={handleOpenAmendModal}
                      title="Direct edits locked: Create an amendment revision to adjust compensation benefits"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                      <span>Amend Benefits via Revision</span>
                    </button>
                  ) : (
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
                  )
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
                      <td className="px-3 py-3 text-slate-400 font-mono">Monthly Base</td>
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
                                {b.rule_id}
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
                                {activeContract.status === 'active' || activeContract.status === 'approved' ? (
                                  <span
                                    className="p-1 rounded-lg text-slate-300 dark:text-slate-600 cursor-not-allowed inline-block"
                                    title="Sealed: Core terms & benefits of an active contract cannot be deleted directly. Use + Amend Contract."
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBenefitLine(b.id)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                                    title="Remove Benefit Line"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
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
                  <select
                    disabled={!canManageSalary}
                    value={newContractForm.currency}
                    onChange={(e) => setNewContractForm({ ...newContractForm, currency: e.target.value })}
                    className={`w-full h-10 px-3 py-2 text-[14px] rounded-xl border border-slate-200 dark:border-slate-800 ${
                      !canManageSalary
                        ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white cursor-pointer'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono`}
                  >
                    {currencies.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.code} — {curr.name} ({curr.symbol})
                      </option>
                    ))}
                  </select>
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

      {/* Contract Amendment Modal */}
      {isAmendModalOpen && activeContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Issue Contract Amendment (Revision {(activeContract.revision_number || 1) + 1})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Preserves prior contract {activeContract.contract_reference} intact
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAmendModalOpen(false)}
                disabled={isAmending}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAmendSubmit} className="p-6 overflow-y-auto space-y-5">
              {amendModalError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{amendModalError}</span>
                </div>
              )}

              {/* 1. Prior Contract Baseline Summary */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Original Contract Reference</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                    {activeContract.contract_reference}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Employee Party</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {employeeName || 'Staff Member'} {employeeNumber ? `(${employeeNumber})` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Current Base Wage</span>
                  {canReadSalary ? (
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {activeContract.wage_base !== null && activeContract.wage_base !== undefined
                        ? `${Number(activeContract.wage_base).toLocaleString()} ${activeContract.currency}`
                        : '—'}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400">•••••• (Restricted)</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Current Duration</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {activeContract.start_date || 'N/A'} to {activeContract.end_date || 'Open-Ended'}
                  </span>
                </div>
              </div>

              {/* 2. Effective Dates & Grade Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Effective Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={amendFormData.start_date}
                    onChange={(e) => setAmendFormData((prev) => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <span className="text-[10px] text-slate-400 block">Prior revision ends 1 day prior</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    New End Date
                  </label>
                  <input
                    type="date"
                    value={amendFormData.end_date}
                    disabled={amendFormData.isOpenEnded}
                    onChange={(e) => setAmendFormData((prev) => ({ ...prev, end_date: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs ${
                      amendFormData.isOpenEnded
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={amendFormData.isOpenEnded}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAmendFormData((prev) => ({
                          ...prev,
                          isOpenEnded: checked,
                          end_date: checked ? '' : prev.end_date,
                        }));
                      }}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Open-ended (indefinite)</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                    Employee Grade <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={amendFormData.grade_id || ''}
                    onChange={(e) => setAmendFormData((prev) => ({ ...prev, grade_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">No Grade Assigned</option>
                    {availableGrades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code ? `${g.code} — ` : ''}{g.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 block">Captures grade for this contract</span>
                </div>
              </div>

              {/* 3. New Base Wage and Currency inputs */}
              {canReadSalary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      New Wage Base <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="100"
                      value={amendFormData.wage_base}
                      onChange={(e) => setAmendFormData((prev) => ({ ...prev, wage_base: e.target.value }))}
                      disabled={!canManageSalary}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 block">
                      Currency <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={amendFormData.currency}
                      onChange={(e) => setAmendFormData((prev) => ({ ...prev, currency: e.target.value }))}
                      disabled={!canManageSalary}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {currencies.map((curr) => (
                        <option key={curr.code} value={curr.code}>
                          {curr.code} — {curr.name} ({curr.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 4. Carried Forward Benefit Rules & Adjustments */}
              {canReadSalary && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Benefit Rules & Adjustments
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Carried forward from prior revision. Adjust values or add new rules as needed.
                      </p>
                    </div>
                  </div>

                  {amendFormData.benefit_lines.length === 0 ? (
                    <div className="p-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                      No supplementary benefit rules attached to this revision.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[11px] font-semibold border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-3 py-2">Rule / Allowance</th>
                            <th className="px-2 py-2">Category</th>
                            <th className="px-2 py-2">Type</th>
                            <th className="px-2 py-2">Value / Rate</th>
                            <th className="px-2 py-2 text-right">Monthly Preview</th>
                            <th className="px-2 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {amendFormData.benefit_lines.map((line, idx) => {
                            const monthlyPreview = computeLineMonthlyPreview(
                              line,
                              amendFormData.wage_base,
                              amendFormData.grade_id
                            );
                            const isDeduction = line.rule_category === 'deduction';
                            const isGradeBased = line.calculation_type === 'grade_based';

                            return (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                                  {line.rule_name || line.rule_id}
                                </td>
                                <td className="px-2 py-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      isDeduction
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    }`}
                                  >
                                    {line.rule_category || 'Allowance'}
                                  </span>
                                </td>
                                <td className="px-2 py-2 font-mono text-[11px] text-slate-500">
                                  {isGradeBased
                                    ? 'Grade Rate'
                                    : line.calculation_type === 'percentage_of_base'
                                    ? '% of Base'
                                    : 'Fixed Monthly'}
                                </td>
                                <td className="px-2 py-2">
                                  {isGradeBased ? (
                                    <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                                      Auto Grade Rate
                                    </span>
                                  ) : (
                                    <input
                                      type="number"
                                      step="any"
                                      value={line.amount_value}
                                      onChange={(e) => handleAmendUpdateBenefitValue(idx, e.target.value)}
                                      className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  )}
                                </td>
                                <td
                                  className={`px-2 py-2 text-right font-mono font-bold ${
                                    isDeduction ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {isDeduction ? '-' : '+'}
                                  {Number(monthlyPreview).toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                  })}{' '}
                                  {amendFormData.currency}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleAmendRemoveBenefit(idx)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                    title="Remove rule from amendment"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add additional rule dropdown */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={selectedNewRuleId}
                      onChange={(e) => setSelectedNewRuleId(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">+ Add another benefit rule to revision...</option>
                      {salaryRules
                        .filter((r) => !amendFormData.benefit_lines.some((b) => b.rule_id === r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.category} • {r.calculation_type})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAmendAddBenefit(selectedNewRuleId)}
                      disabled={!selectedNewRuleId}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" /> Add
                    </button>
                  </div>
                </div>
              )}

              {/* 5. Mandatory Amendment Reason with quick suggestion chips */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>
                    Amendment Reason <span className="text-rose-500">*</span>
                  </span>
                </label>

                {/* Quick-fill suggestion chips */}
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {[
                    'Annual promotion',
                    'Mid-year wage adjustment',
                    'Grade & Level Progression',
                    'Role realignment & compensation review',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAmendFormData((prev) => ({ ...prev, amendment_reason: chip }))}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={amendFormData.amendment_reason}
                  onChange={(e) => setAmendFormData((prev) => ({ ...prev, amendment_reason: e.target.value }))}
                  placeholder="e.g. Annual merit promotion and wage adjustment approved by compensation committee..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  required
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  This justification is permanently inscribed into the audit trail and links Revision {(activeContract.revision_number || 1) + 1} to prior contract {activeContract.contract_reference}.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAmendModalOpen(false)}
                  disabled={isAmending}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAmending || !amendFormData.amendment_reason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {isAmending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Issuing Revision...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Issue Amendment Revision</span>
                    </>
                  )}
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
