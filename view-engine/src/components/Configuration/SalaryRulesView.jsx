import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Banknote,
    Plus,
    Trash2,
    Edit2,
    CheckCircle2,
    AlertCircle,
    Percent,
    DollarSign,
    RefreshCw,
    X,
    Clock,
    Truck,
    Gift,
    AlertOctagon,
    Check,
    Layers,
    Sliders,
    Info,
    Calendar,
    FileText,
    Paperclip,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Save
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessControl } from '../../context/AccessControlContext';

const WPS_CODES = [
    { code: 'HOUSING', label: 'HOUSING — Housing Allowance' },
    { code: 'TRANSPORT', label: 'TRANSPORT — Transport & Fuel' },
    { code: 'FOOD', label: 'FOOD — Food & Subsistence' },
    { code: 'TELECOM', label: 'TELECOM — Mobile & Utilities' },
    { code: 'OVERTIME', label: 'OVERTIME — Overtime Pay' },
    { code: 'OTHER_ALW', label: 'OTHER_ALW — Other Allowance' },
    { code: 'GOSI', label: 'GOSI — Pension / Social Insurance' },
    { code: 'LOAN_DED', label: 'LOAN_DED — Staff Advance / Loan Deduction' },
    { code: 'ABSENCE_DED', label: 'ABSENCE_DED — Unpaid Leave / Absence' },
];

export function SalaryRulesView() {
    const { getAuthHeaders, currentUser, user } = useAuth();
    const { hasPermission } = useAccessControl();
    const isSuperadmin = Boolean(currentUser?.is_superadmin || user?.is_superadmin);
    const canManage = hasPermission('hr.salary_manage') || isSuperadmin;

    // Active Segment Tab
    const [activeTab, setActiveTab] = useState('salary_rules'); // 'salary_rules' | 'grades' | 'overtime' | 'task_benefit' | 'bonus' | 'deduction' | 'leave_types'

    // Data states
    const [salaryRules, setSalaryRules] = useState([]);
    const [taskRules, setTaskRules] = useState([]);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [employeeGrades, setEmployeeGrades] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // In-place Form State
    const [formMode, setFormMode] = useState(null); // null | 'salary_rule' | 'grade' | 'preset' | 'leave_type'
    const [selectedRecordId, setSelectedRecordId] = useState(null);
    const [isFormDirty, setIsFormDirty] = useState(false);

    // Form states for Contract Salary Rules (Tab 1)
    const [salaryRuleForm, setSalaryRuleForm] = useState({
        id: '',
        name: '',
        category: 'allowance',
        calculation_type: 'fixed_amount',
        default_amount: 500,
        percentage_rate: 0,
        wps_code: 'HOUSING',
        is_taxable: false,
        is_active: true,
        grade_rates: {},
    });

    // Form states for Employee Grades (Tab 1b)
    const [gradeForm, setGradeForm] = useState({
        id: '',
        code: '',
        name: '',
        rank_order: 1,
        description: '',
        is_active: true,
    });

    // Form states for Task Rate Preset Rules (Tabs 2 - 5)
    const [isEditingPreset, setIsEditingPreset] = useState(false);
    const [presetForm, setPresetForm] = useState({
        id: '',
        name: '',
        entry_type: 'overtime',
        unit_label: 'Hours',
        default_unit_rate: 0,
        ot_multiplier_pct: 125.0,
        calculation_mode: 'hourly_multiplier',
        included_benefit_rules: [],
        subtype: 'overtime_basic',
        is_active: true,
    });

    // Form states for Leave Types & Policies (Tab 6)
    const [leaveTypeForm, setLeaveTypeForm] = useState({
        id: '',
        name: '',
        max_days_per_year: 21,
        pay_percentage: 100.0,
        deduction_basis_rules: [],
        requires_attachment: false,
        is_active: true,
    });

    const showToast = (text, type = 'success') => {
        setFeedback({ text, type });
        setTimeout(() => setFeedback(null), 3500);
    };

    // Active allowance rules available to be included in calculation basis
    const activeAllowanceRules = useMemo(() => {
        return salaryRules.filter((r) => r.category === 'allowance' && r.is_active !== false);
    }, [salaryRules]);

    // Fetch all rules & leave types
    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [salRes, taskRes, leaveRes, gradeRes] = await Promise.all([
                fetch('/api/v1/salary-rules', { headers: getAuthHeaders() }),
                fetch('/api/v1/payroll/task-rules', { headers: getAuthHeaders() }),
                fetch('/api/v1/hr/leave-types', { headers: getAuthHeaders() }),
                fetch('/api/v1/employee-grades', { headers: getAuthHeaders() }),
            ]);

            if (salRes.ok) {
                const salData = await salRes.json();
                setSalaryRules(salData.rules || []);
            }
            if (taskRes.ok) {
                const taskData = await taskRes.json();
                setTaskRules(taskData.rules || []);
            }
            if (leaveRes.ok) {
                const leaveData = await leaveRes.json();
                setLeaveTypes(leaveData.leave_types || []);
            }
            if (gradeRes.ok) {
                const gradeData = await gradeRes.json();
                setEmployeeGrades(gradeData.grades || []);
            }
        } catch (err) {
            console.error('Error fetching salary & preset rules:', err);
            showToast('Failed to load rules catalog.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // -------------------------------------------------------------
    // Tab 1: Contract Salary Rules Handlers
    // -------------------------------------------------------------
    const handleOpenCreateSalaryRule = () => {
        const initGrades = {};
        employeeGrades.forEach(g => {
            initGrades[g.id] = 0;
        });
        setSalaryRuleForm({
            id: '',
            name: '',
            category: 'allowance',
            calculation_type: 'fixed_amount',
            default_amount: 500,
            percentage_rate: 0,
            wps_code: 'OTHER_ALW',
            is_taxable: false,
            is_active: true,
            grade_rates: initGrades,
        });
        setSelectedRecordId(null);
        setIsFormDirty(false);
        setFormMode('salary_rule');
    };

    const handleOpenEditSalaryRule = (rule) => {
        const initGrades = { ...(rule.grade_rates || {}) };
        employeeGrades.forEach(g => {
            if (initGrades[g.id] === undefined) {
                initGrades[g.id] = 0;
            }
        });
        setSalaryRuleForm({
            id: rule.id,
            name: rule.name,
            category: rule.category || 'allowance',
            calculation_type: rule.calculation_type || 'fixed_amount',
            default_amount: Number(rule.default_amount || 0),
            percentage_rate: Number(rule.percentage_rate || 0),
            wps_code: rule.wps_code || 'OTHER_ALW',
            is_taxable: Boolean(rule.is_taxable),
            is_active: rule.is_active !== false,
            grade_rates: initGrades,
        });
        setSelectedRecordId(rule.id);
        setIsFormDirty(false);
        setFormMode('salary_rule');
    };

    const handleSubmitSalaryRule = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!salaryRuleForm.id.trim() || !salaryRuleForm.name.trim()) {
            showToast('Rule Code and Name are required.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const cleanId = salaryRuleForm.id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const res = await fetch('/api/v1/salary-rules', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...salaryRuleForm,
                    id: cleanId,
                    default_amount: parseFloat(salaryRuleForm.default_amount) || 0,
                    percentage_rate: parseFloat(salaryRuleForm.percentage_rate) || 0,
                    grade_rates: salaryRuleForm.grade_rates || {},
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to save salary rule.');
            }

            showToast(`Salary Rule "${salaryRuleForm.name}" saved successfully.`);
            setSelectedRecordId(cleanId);
            setIsFormDirty(false);
            await fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // -------------------------------------------------------------
    // Tab 1b: Employee Grades Handlers
    // -------------------------------------------------------------
    const handleOpenCreateGrade = () => {
        setGradeForm({
            id: '',
            code: '',
            name: '',
            rank_order: employeeGrades.length + 1,
            description: '',
            is_active: true,
        });
        setSelectedRecordId(null);
        setIsFormDirty(false);
        setFormMode('grade');
    };

    const handleOpenEditGrade = (grade) => {
        setGradeForm({
            id: grade.id,
            code: grade.code || '',
            name: grade.name || '',
            rank_order: Number(grade.rank_order || 1),
            description: grade.description || '',
            is_active: grade.is_active !== false,
        });
        setSelectedRecordId(grade.id);
        setIsFormDirty(false);
        setFormMode('grade');
    };

    const handleSubmitGrade = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!gradeForm.code.trim() || !gradeForm.name.trim()) {
            showToast('Grade Code and Name are required.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const cleanId = gradeForm.id || `GRADE_${gradeForm.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
            const res = await fetch('/api/v1/employee-grades', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...gradeForm,
                    id: cleanId,
                    rank_order: parseInt(gradeForm.rank_order, 10) || 1,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to save employee grade.');
            }

            showToast(`Grade "${gradeForm.name}" saved successfully.`);
            setSelectedRecordId(cleanId);
            setIsFormDirty(false);
            await fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteGrade = async (gradeId) => {
        if (!window.confirm(`Are you sure you want to remove or deactivate grade ${gradeId}?`)) return;

        try {
            const res = await fetch(`/api/v1/employee-grades/${gradeId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to delete grade.');
            }

            const data = await res.json();
            showToast(data.message || `Grade ${gradeId} removed successfully.`);
            await fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const handleDeleteSalaryRule = async (ruleId, ruleName) => {
        if (!window.confirm(`Are you sure you want to delete salary rule "${ruleName}" (${ruleId})?`)) return;
        try {
            const res = await fetch(`/api/v1/salary-rules/${ruleId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                showToast(`Rule ${ruleId} deleted.`);
                await fetchAllData();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to delete rule.', 'error');
            }
        } catch (err) {
            showToast('Network error deleting rule.', 'error');
        }
    };

    // -------------------------------------------------------------
    // Tabs 2-5: Task Rate Preset Rules Handlers
    // -------------------------------------------------------------
    const handleOpenCreatePreset = (entryType) => {
        setIsEditingPreset(false);
        let defaultSubtype = 'general';
        let defaultLabel = 'Units';
        let defaultMode = 'hourly_multiplier';
        let defaultRate = 0;
        let defaultMult = 100;
        let defaultInc = [];

        if (entryType === 'overtime') {
            defaultSubtype = 'overtime_basic';
            defaultLabel = 'Hours';
            defaultMode = 'hourly_multiplier';
            defaultMult = 125.0;
        } else if (entryType === 'task_benefit') {
            defaultSubtype = 'trip_completion';
            defaultLabel = 'Trips';
            defaultMode = 'piece_rate';
            defaultRate = 50.0;
        } else if (entryType === 'bonus') {
            defaultSubtype = 'performance_bonus';
            defaultLabel = 'Bonus';
            defaultMode = 'fixed_amount';
            defaultRate = 500.0;
        } else if (entryType === 'deduction') {
            defaultSubtype = 'disciplinary_fine';
            defaultLabel = 'Days';
            defaultMode = 'daily_rate';
            defaultMult = 100.0;
        }

        setPresetForm({
            id: '',
            name: '',
            entry_type: entryType,
            unit_label: defaultLabel,
            default_unit_rate: defaultRate,
            ot_multiplier_pct: defaultMult,
            calculation_mode: defaultMode,
            included_benefit_rules: defaultInc,
            subtype: defaultSubtype,
            is_active: true,
        });
        setSelectedRecordId(null);
        setIsFormDirty(false);
        setFormMode('preset');
    };

    const handleOpenEditPreset = (rule) => {
        setIsEditingPreset(true);
        let inc = [];
        if (Array.isArray(rule.included_benefit_rules)) {
            inc = rule.included_benefit_rules;
        } else if (typeof rule.included_benefit_rules === 'string') {
            try {
                inc = JSON.parse(rule.included_benefit_rules || '[]');
            } catch {
                inc = [];
            }
        }

        setPresetForm({
            id: rule.id,
            name: rule.name,
            entry_type: rule.entry_type,
            unit_label: rule.unit_label || 'Units',
            default_unit_rate: Number(rule.default_unit_rate || 0),
            ot_multiplier_pct: Number(rule.ot_multiplier_pct || 100),
            calculation_mode: rule.calculation_mode || 'hourly_multiplier',
            included_benefit_rules: inc,
            subtype: rule.subtype || 'general',
            is_active: rule.is_active !== false,
        });
        setSelectedRecordId(rule.id);
        setIsFormDirty(false);
        setFormMode('preset');
    };

    const handleToggleBenefitInBasis = (ruleCode) => {
        setIsFormDirty(true);
        setPresetForm((prev) => {
            const current = prev.included_benefit_rules || [];
            if (current.includes(ruleCode)) {
                return { ...prev, included_benefit_rules: current.filter((r) => r !== ruleCode) };
            } else {
                return { ...prev, included_benefit_rules: [...current, ruleCode] };
            }
        });
    };

    const handleSubmitPreset = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!presetForm.id.trim() || !presetForm.name.trim()) {
            showToast('Rule Code and Name are required.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const cleanId = presetForm.id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const res = await fetch('/api/v1/payroll/task-rules', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...presetForm,
                    id: cleanId,
                    default_unit_rate: parseFloat(presetForm.default_unit_rate) || 0,
                    ot_multiplier_pct: parseFloat(presetForm.ot_multiplier_pct) || 100,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to save preset.');
            }

            showToast(`Preset "${presetForm.name}" saved successfully.`);
            setSelectedRecordId(cleanId);
            setIsFormDirty(false);
            await fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePreset = async (ruleId, ruleName) => {
        if (!window.confirm(`Are you sure you want to delete preset "${ruleName}" (${ruleId})?`)) return;
        try {
            const res = await fetch(`/api/v1/payroll/task-rules/${ruleId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                showToast(`Preset ${ruleId} deleted.`);
                await fetchAllData();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to delete preset.', 'error');
            }
        } catch (err) {
            showToast('Network error deleting preset.', 'error');
        }
    };

    // -------------------------------------------------------------
    // Tab 6: Leave Types & Policies Handlers
    // -------------------------------------------------------------
    const handleOpenCreateLeaveType = () => {
        setLeaveTypeForm({
            id: '',
            name: '',
            max_days_per_year: 21,
            pay_percentage: 100.0,
            deduction_basis_rules: [],
            requires_attachment: false,
            is_active: true,
        });
        setSelectedRecordId(null);
        setIsFormDirty(false);
        setFormMode('leave_type');
    };

    const handleOpenEditLeaveType = (lt) => {
        let ded = [];
        if (Array.isArray(lt.deduction_basis_rules)) {
            ded = lt.deduction_basis_rules;
        } else if (typeof lt.deduction_basis_rules === 'string') {
            try {
                ded = JSON.parse(lt.deduction_basis_rules || '[]');
            } catch {
                ded = [];
            }
        }

        setLeaveTypeForm({
            id: lt.id,
            name: lt.name,
            max_days_per_year: Number(lt.max_days_per_year || 21),
            pay_percentage: Number(lt.pay_percentage !== undefined ? lt.pay_percentage : 100.0),
            deduction_basis_rules: ded,
            requires_attachment: Boolean(lt.requires_attachment),
            is_active: lt.is_active !== false,
        });
        setSelectedRecordId(lt.id);
        setIsFormDirty(false);
        setFormMode('leave_type');
    };

    const handleToggleLeaveDeductionRule = (ruleCode) => {
        setIsFormDirty(true);
        setLeaveTypeForm((prev) => {
            const current = prev.deduction_basis_rules || [];
            if (current.includes(ruleCode)) {
                return { ...prev, deduction_basis_rules: current.filter((r) => r !== ruleCode) };
            } else {
                return { ...prev, deduction_basis_rules: [...current, ruleCode] };
            }
        });
    };

    const handleSubmitLeaveType = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!leaveTypeForm.id.trim() || !leaveTypeForm.name.trim()) {
            showToast('Leave policy ID and Name are required.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const cleanId = leaveTypeForm.id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const res = await fetch('/api/v1/hr/leave-types', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...leaveTypeForm,
                    id: cleanId,
                    max_days_per_year: parseInt(leaveTypeForm.max_days_per_year, 10) || 21,
                    pay_percentage: parseFloat(leaveTypeForm.pay_percentage) || 0.0,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to save leave policy.');
            }

            showToast(`Leave policy "${leaveTypeForm.name}" saved successfully.`);
            setSelectedRecordId(cleanId);
            setIsFormDirty(false);
            await fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardForm = () => {
        if (isFormDirty) {
            if (!window.confirm('Discard unsaved changes?')) return;
        }
        setFormMode(null);
        setSelectedRecordId(null);
        setIsFormDirty(false);
    };

    const activeRecordList = useMemo(() => {
        if (formMode === 'salary_rule') return salaryRules;
        if (formMode === 'grade') return employeeGrades;
        if (formMode === 'preset') {
            const type = presetForm.entry_type || activeTab;
            return taskRules.filter((r) => r.entry_type === type);
        }
        if (formMode === 'leave_type') return leaveTypes;
        return [];
    }, [formMode, salaryRules, employeeGrades, taskRules, presetForm.entry_type, activeTab, leaveTypes]);

    const currentRecordIndex = useMemo(() => {
        if (!selectedRecordId) return -1;
        return activeRecordList.findIndex((r) => r.id === selectedRecordId);
    }, [activeRecordList, selectedRecordId]);

    const handleStepRecord = (direction) => {
        if (isFormDirty) {
            if (!window.confirm('You have unsaved changes. Discard and switch record?')) return;
        }
        const nextIdx = currentRecordIndex + direction;
        if (nextIdx >= 0 && nextIdx < activeRecordList.length) {
            const nextRecord = activeRecordList[nextIdx];
            if (formMode === 'salary_rule') handleOpenEditSalaryRule(nextRecord);
            else if (formMode === 'grade') handleOpenEditGrade(nextRecord);
            else if (formMode === 'preset') handleOpenEditPreset(nextRecord);
            else if (formMode === 'leave_type') handleOpenEditLeaveType(nextRecord);
        }
    };

    const formCategoryLabel = useMemo(() => {
        if (formMode === 'salary_rule') return 'Contract Salary Rules';
        if (formMode === 'grade') return 'Employee Grades';
        if (formMode === 'preset') {
            if (presetForm.entry_type === 'overtime') return 'Overtime Rules';
            if (presetForm.entry_type === 'task_benefit') return 'Task Benefits';
            if (presetForm.entry_type === 'bonus') return 'Bonuses & Incentives';
            if (presetForm.entry_type === 'deduction') return 'Disciplinary Deductions';
            return 'Rule Presets';
        }
        if (formMode === 'leave_type') return 'Leave Policies';
        return 'Configuration';
    }, [formMode, presetForm.entry_type]);

    const currentRecordTitle = useMemo(() => {
        if (formMode === 'salary_rule') return salaryRuleForm.name || salaryRuleForm.id || 'New Salary Rule';
        if (formMode === 'grade') return gradeForm.name || gradeForm.code || 'New Employee Grade';
        if (formMode === 'preset') return presetForm.name || presetForm.id || 'New Preset';
        if (formMode === 'leave_type') return leaveTypeForm.name || leaveTypeForm.id || 'New Leave Policy';
        return '';
    }, [formMode, salaryRuleForm.name, salaryRuleForm.id, gradeForm.name, gradeForm.code, presetForm.name, presetForm.id, leaveTypeForm.name, leaveTypeForm.id]);

    const handleSaveCurrentForm = (e) => {
        if (formMode === 'salary_rule') handleSubmitSalaryRule(e);
        else if (formMode === 'preset') handleSubmitPreset(e);
        else if (formMode === 'leave_type') handleSubmitLeaveType(e);
        else if (formMode === 'grade') handleSubmitGrade(e);
    };

    const handleDeleteLeaveType = async (ltId, ltName) => {
        if (!window.confirm(`Are you sure you want to delete leave policy "${ltName}" (${ltId})?`)) return;
        try {
            const res = await fetch(`/api/v1/hr/leave-types/${ltId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                showToast(`Leave policy ${ltId} deleted.`);
                await fetchAllData();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to delete leave policy.', 'error');
            }
        } catch (err) {
            showToast('Network error deleting leave policy.', 'error');
        }
    };

    // Filter presets by active tab
    const filteredPresets = useMemo(() => {
        if (activeTab === 'salary_rules' || activeTab === 'leave_types') return [];
        return taskRules.filter((r) => r.entry_type === activeTab);
    }, [taskRules, activeTab]);

    if (formMode !== null) {
        return (
            <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-16">
                {/* Top Breadcrumb & Record Pager Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleDiscardForm}
                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                            title="Back to Rules List"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span>System Configuration</span>
                                <span>/</span>
                                <span>{formCategoryLabel}</span>
                                <span>/</span>
                                <span className="text-slate-900 dark:text-white font-medium truncate max-w-xs">
                                    {currentRecordTitle}
                                </span>
                            </div>
                            <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                                {selectedRecordId ? `Edit ${formCategoryLabel}` : `New ${formCategoryLabel}`}
                            </h2>
                        </div>
                    </div>

                    {/* Right Actions: Record Pager + Discard + Sticky Save */}
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                        {activeRecordList.length > 0 && selectedRecordId && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                                <button
                                    type="button"
                                    disabled={currentRecordIndex <= 0}
                                    onClick={() => handleStepRecord(-1)}
                                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="Previous record"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[11px] font-mono px-1">
                                    {currentRecordIndex + 1} of {activeRecordList.length}
                                </span>
                                <button
                                    type="button"
                                    disabled={currentRecordIndex >= activeRecordList.length - 1}
                                    onClick={() => handleStepRecord(1)}
                                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="Next record"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleDiscardForm}
                            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                            Discard
                        </button>

                        <button
                            type="button"
                            onClick={handleSaveCurrentForm}
                            disabled={isSaving || (selectedRecordId && !isFormDirty)}
                            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                                selectedRecordId && !isFormDirty
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                            }`}
                        >
                            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            <span>Save Changes</span>
                        </button>
                    </div>
                </div>

                {/* Form Panels */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs">
                    {/* FORM: CONTRACT SALARY RULE */}
                    {formMode === 'salary_rule' && (
                        <form onSubmit={handleSubmitSalaryRule} onChange={() => setIsFormDirty(true)} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Rule Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        disabled={Boolean(selectedRecordId)}
                                        placeholder="e.g. ALW_SITE_OFFSHORE"
                                        value={salaryRuleForm.id}
                                        onChange={(e) => setSalaryRuleForm({ ...salaryRuleForm, id: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono disabled:opacity-60"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Category *
                                    </label>
                                    <select
                                        value={salaryRuleForm.category}
                                        onChange={(e) => setSalaryRuleForm({ ...salaryRuleForm, category: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    >
                                        <option value="allowance">Allowance (Addition)</option>
                                        <option value="deduction">Deduction</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Allowance Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Offshore Industrial Hardship Allowance"
                                    value={salaryRuleForm.name}
                                    onChange={(e) => setSalaryRuleForm({ ...salaryRuleForm, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Calculation Type
                                    </label>
                                    <select
                                        value={salaryRuleForm.calculation_type}
                                        onChange={(e) => setSalaryRuleForm({ ...salaryRuleForm, calculation_type: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    >
                                        <option value="fixed_amount">Fixed Amount (QAR)</option>
                                        <option value="percentage_of_base">Percentage of Base Salary (%)</option>
                                        <option value="grade_based">Grade-Based Matrix (Per Employee Grade)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        {salaryRuleForm.calculation_type === 'percentage_of_base'
                                            ? 'Percentage Rate (%)'
                                            : salaryRuleForm.calculation_type === 'grade_based'
                                                ? 'Fallback Default (QAR)'
                                                : 'Default Amount (QAR)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        value={
                                            salaryRuleForm.calculation_type === 'percentage_of_base'
                                                ? salaryRuleForm.percentage_rate
                                                : salaryRuleForm.default_amount
                                        }
                                        onChange={(e) =>
                                            setSalaryRuleForm({
                                                ...salaryRuleForm,
                                                [salaryRuleForm.calculation_type === 'percentage_of_base'
                                                    ? 'percentage_rate'
                                                    : 'default_amount']: e.target.value,
                                            })
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                    />
                                </div>
                            </div>

                            {/* Grade-Based Allowance Matrix Inputs */}
                            {salaryRuleForm.calculation_type === 'grade_based' && (
                                <div className="p-3.5 bg-violet-50/70 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-900/60 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-violet-900 dark:text-violet-200 text-xs">
                                            Per-Grade Allowance Rates (QAR)
                                        </span>
                                        <span className="text-[10px] text-violet-700 dark:text-violet-300">
                                            Auto-resolved by Employee Grade
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {employeeGrades.map((g) => (
                                            <div key={g.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-violet-100 dark:border-violet-900/40">
                                                <div className="min-w-0">
                                                    <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200 truncate">
                                                        {g.code}
                                                    </div>
                                                    <div className="text-[9px] text-slate-400 truncate">
                                                        {g.name}
                                                    </div>
                                                </div>
                                                <div className="w-20 shrink-0 flex items-center gap-1 font-mono">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        placeholder="0.00"
                                                        value={salaryRuleForm.grade_rates?.[g.id] ?? ''}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setSalaryRuleForm({
                                                                ...salaryRuleForm,
                                                                grade_rates: {
                                                                    ...salaryRuleForm.grade_rates,
                                                                    [g.id]: val,
                                                                },
                                                            });
                                                        }}
                                                        className="w-full px-1.5 py-1 text-right text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Pay Category Code
                                </label>
                                <select
                                    value={salaryRuleForm.wps_code}
                                    onChange={(e) => setSalaryRuleForm({ ...salaryRuleForm, wps_code: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    {WPS_CODES.map((w) => (
                                        <option key={w.code} value={w.code}>
                                            {w.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </form>
                    )}

                    {/* FORM: TASK RATE PRESET */}
                    {formMode === 'preset' && (
                        <form onSubmit={handleSubmitPreset} onChange={() => setIsFormDirty(true)} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Preset Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        disabled={Boolean(selectedRecordId)}
                                        placeholder="e.g. OT_SPECIAL_135"
                                        value={presetForm.id}
                                        onChange={(e) => setPresetForm({ ...presetForm, id: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Calculation Mode
                                    </label>
                                    <select
                                        value={presetForm.calculation_mode}
                                        onChange={(e) => setPresetForm({ ...presetForm, calculation_mode: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                                    >
                                        <option value="hourly_multiplier">Hourly Multiplier (Overtime: /240h)</option>
                                        <option value="piece_rate">Piece-Rate (Per Task / Trip)</option>
                                        <option value="daily_rate">Daily Rate (Absence / Fine: /30d)</option>
                                        <option value="percentage_of_basis">Percentage of Basis (% of Salary)</option>
                                        <option value="fixed_amount">Fixed Amount (QAR)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Preset Title / Display Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Hazardous Site Overnight Overtime (135%)"
                                    value={presetForm.name}
                                    onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Unit Label (Display)
                                    </label>
                                    <input
                                        type="text"
                                        value={presetForm.unit_label}
                                        onChange={(e) => setPresetForm({ ...presetForm, unit_label: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                </div>

                                {presetForm.calculation_mode === 'hourly_multiplier' ||
                                    presetForm.calculation_mode === 'daily_rate' ||
                                    presetForm.calculation_mode === 'percentage_of_basis' ? (
                                    <div>
                                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                            Multiplier Ratio (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="0"
                                            value={presetForm.ot_multiplier_pct}
                                            onChange={(e) => setPresetForm({ ...presetForm, ot_multiplier_pct: e.target.value })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                            Locked Unit Rate (QAR)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={presetForm.default_unit_rate}
                                            onChange={(e) => setPresetForm({ ...presetForm, default_unit_rate: e.target.value })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Subtype Dropdown */}
                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Category Subtype
                                </label>
                                <select
                                    value={presetForm.subtype}
                                    onChange={(e) => setPresetForm({ ...presetForm, subtype: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                >
                                    {presetForm.entry_type === 'overtime' && (
                                        <>
                                            <option value="overtime_basic">Overtime Basic Basis</option>
                                            <option value="overtime_basic_housing">Overtime Basic + Housing Basis</option>
                                        </>
                                    )}
                                    {presetForm.entry_type === 'task_benefit' && (
                                        <>
                                            <option value="trip_completion">Delivery / Transport Trip</option>
                                            <option value="task_completion">Field Inspection / Site Task</option>
                                        </>
                                    )}
                                    {presetForm.entry_type === 'bonus' && (
                                        <>
                                            <option value="performance_bonus">Performance Bonus</option>
                                            <option value="safety_incentive">Zero-Incident Safety Incentive</option>
                                            <option value="festival_bonus">Eid / Festival Bonus</option>
                                            <option value="arrears_addition">Salary Arrears Addition</option>
                                        </>
                                    )}
                                    {presetForm.entry_type === 'deduction' && (
                                        <>
                                            <option value="disciplinary_fine">Disciplinary Fine / Absence</option>
                                            <option value="loan_installment">Company Loan Installment</option>
                                            <option value="overpayment_recovery">Overpayment Recovery</option>
                                            <option value="other_deduction">Other Deduction</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {/* Benefits Included in Calculation Basis */}
                            {(presetForm.calculation_mode === 'hourly_multiplier' ||
                                presetForm.calculation_mode === 'daily_rate' ||
                                presetForm.calculation_mode === 'percentage_of_basis') && (
                                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                                            <Layers className="w-3.5 h-3.5 text-blue-500" />
                                            <span>Benefits Included in Calculation Basis</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            Select which employee allowances are aggregated with Basic Salary to form the hourly/daily denominator.
                                        </p>

                                        <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                            <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-not-allowed opacity-90">
                                                <input
                                                    type="checkbox"
                                                    checked={true}
                                                    disabled={true}
                                                    className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600"
                                                />
                                                <span className="font-semibold">Basic Salary</span>
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                                    (Always Included)
                                                </span>
                                            </label>

                                            {activeAllowanceRules.map((alw) => {
                                                const isChecked = presetForm.included_benefit_rules.includes(alw.id);
                                                return (
                                                    <label
                                                        key={alw.id}
                                                        className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => handleToggleBenefitInBasis(alw.id)}
                                                            className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                                                        />
                                                        <span className="font-medium">{alw.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            ({alw.id})
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                        </form>
                    )}

                    {/* FORM: LEAVE TYPE & POLICY */}
                    {formMode === 'leave_type' && (
                        <form onSubmit={handleSubmitLeaveType} onChange={() => setIsFormDirty(true)} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Policy ID / Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        disabled={Boolean(selectedRecordId)}
                                        placeholder="e.g. LEAVE_STUDY"
                                        value={leaveTypeForm.id}
                                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, id: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono disabled:opacity-60"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Max Days / Year *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        required
                                        value={leaveTypeForm.max_days_per_year}
                                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, max_days_per_year: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Leave Policy Title *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Study Leave"
                                    value={leaveTypeForm.name}
                                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Salary Coverage Percentage
                                    </label>
                                    <select
                                        value={leaveTypeForm.pay_percentage}
                                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, pay_percentage: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                                    >
                                        <option value={100.0}>100% — Fully Paid Leave</option>
                                        <option value={50.0}>50% — Half-Pay Leave (Tier 2)</option>
                                        <option value={0.0}>0% — Unpaid Leave / Full Deduction</option>
                                    </select>
                                </div>

                                <div className="flex flex-col justify-end">
                                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={leaveTypeForm.requires_attachment}
                                            onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, requires_attachment: e.target.checked })}
                                            className="w-4 h-4 rounded text-purple-600 accent-purple-600 cursor-pointer"
                                        />
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                                            Requires Proof / Attachment
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Deduction Basis Checkboxes (for Unpaid or Partial Pay Leaves) */}
                            {leaveTypeForm.pay_percentage < 100.0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                                        <AlertOctagon className="w-3.5 h-3.5" />
                                        <span>Allowances Deducted on Unpaid / Half-Pay Leave</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Select which contract allowances are included in the daily salary deduction formula alongside Basic Salary.
                                    </p>

                                    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                                        <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-not-allowed opacity-90">
                                            <input
                                                type="checkbox"
                                                checked={true}
                                                disabled={true}
                                                className="w-3.5 h-3.5 rounded text-rose-600 accent-rose-600"
                                            />
                                            <span className="font-semibold">Basic Salary</span>
                                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">
                                                (Always Deducted Pro-Rata)
                                            </span>
                                        </label>

                                        {activeAllowanceRules.map((alw) => {
                                            const isChecked = leaveTypeForm.deduction_basis_rules.includes(alw.id);
                                            return (
                                                <label
                                                    key={alw.id}
                                                    className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-pointer hover:text-rose-600 dark:hover:text-rose-400"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleLeaveDeductionRule(alw.id)}
                                                        className="w-3.5 h-3.5 rounded text-rose-600 accent-rose-600 cursor-pointer"
                                                    />
                                                    <span className="font-medium">{alw.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        ({alw.id})
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </form>
                    )}

                    {/* FORM: EMPLOYEE GRADE */}
                    {formMode === 'grade' && (
                        <form onSubmit={handleSubmitGrade} onChange={() => setIsFormDirty(true)} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Grade Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        disabled={Boolean(selectedRecordId)}
                                        placeholder="e.g. G1"
                                        value={gradeForm.code}
                                        onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold disabled:opacity-60"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                        Rank Order (1 = Top) *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={gradeForm.rank_order}
                                        onChange={(e) => setGradeForm({ ...gradeForm, rank_order: parseInt(e.target.value, 10) || 1 })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Grade Title / Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Grade 1 — Executive & Senior Specialist"
                                    value={gradeForm.name}
                                    onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                                    Description & Target Job Roles
                                </label>
                                <textarea
                                    rows="3"
                                    placeholder="e.g. Senior management, lead engineers, project directors"
                                    value={gradeForm.description}
                                    onChange={(e) => setGradeForm({ ...gradeForm, description: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="grade_active_cb"
                                    checked={gradeForm.is_active}
                                    onChange={(e) => setGradeForm({ ...gradeForm, is_active: e.target.checked })}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="grade_active_cb" className="text-slate-700 dark:text-slate-300 font-medium">
                                    Active Grade (Available for Employee assignment)
                                </label>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn pb-12">
            {/* Header Banner */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Salary, Overtime &amp; Leave Rules
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Configure contract allowances, overtime rates, task piece-rates, and company leave types.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={fetchAllData}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                        title="Refresh All Rules"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => {
                                if (activeTab === 'salary_rules') {
                                    handleOpenCreateSalaryRule();
                                } else if (activeTab === 'grades') {
                                    handleOpenCreateGrade();
                                } else if (activeTab === 'leave_types') {
                                    handleOpenCreateLeaveType();
                                } else {
                                    handleOpenCreatePreset(activeTab);
                                }
                            }}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>
                                {activeTab === 'salary_rules'
                                    ? '+ New Salary Rule'
                                    : activeTab === 'grades'
                                        ? '+ New Employee Grade'
                                        : activeTab === 'overtime'
                                            ? '+ New Overtime Preset'
                                            : activeTab === 'task_benefit'
                                                ? '+ New Task / Trip Rate'
                                                : activeTab === 'bonus'
                                                    ? '+ New Bonus Preset'
                                                    : activeTab === 'deduction'
                                                        ? '+ New Deduction Preset'
                                                        : '+ New Leave Policy'}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* Segmented Tab Navigation across 6 tabs */}
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setActiveTab('salary_rules')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'salary_rules'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Banknote className="w-4 h-4 text-emerald-500" />
                    <span>Contract Salary Rules</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {salaryRules.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('grades')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'grades'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Layers className="w-4 h-4 text-violet-500" />
                    <span>Employee Grades</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {employeeGrades.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('overtime')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'overtime'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span>Overtime Presets</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {taskRules.filter((r) => r.entry_type === 'overtime').length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('task_benefit')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'task_benefit'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Truck className="w-4 h-4 text-cyan-500" />
                    <span>Task / Trip Piece-Rates</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {taskRules.filter((r) => r.entry_type === 'task_benefit').length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('bonus')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'bonus'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Gift className="w-4 h-4 text-indigo-500" />
                    <span>Bonus Presets</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {taskRules.filter((r) => r.entry_type === 'bonus').length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('deduction')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'deduction'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <AlertOctagon className="w-4 h-4 text-rose-500" />
                    <span>Deduction & Fine Presets</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {taskRules.filter((r) => r.entry_type === 'deduction').length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('leave_types')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${activeTab === 'leave_types'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Calendar className="w-4 h-4 text-purple-500" />
                    <span>Leave Types & Policies</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800">
                        {leaveTypes.length}
                    </span>
                </button>
            </div>

            {/* Notification alert */}
            {feedback && (
                <div
                    className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border ${feedback.type === 'error'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        {feedback.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-rose-600" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                        <span>{feedback.text}</span>
                    </div>
                    <button type="button" onClick={() => setFeedback(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* TAB 1: CONTRACT SALARY & ALLOWANCE RULES TABLE */}
            {activeTab === 'salary_rules' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                            Contract Allowances &amp; Deductions
                        </span>
                        <span className="text-slate-400 text-[11px]">
                            Used in employee contracts &amp; payroll runs
                        </span>
                    </div>

                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="py-3.5 px-4">Rule Code</th>
                                <th className="py-3.5 px-4">Allowance / Deduction Name</th>
                                <th className="py-3.5 px-4">Category</th>
                                <th className="py-3.5 px-4">Calculation Basis</th>
                                <th className="py-3.5 px-4">Default Value</th>
                                <th className="py-3.5 px-4">Pay Code</th>
                                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {salaryRules.map((rule) => (
                                <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                        {rule.id}
                                    </td>
                                    <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                        {rule.name}
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${rule.category === 'deduction'
                                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/80'
                                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80'
                                                }`}
                                        >
                                            {rule.category}
                                        </span>
                                    </td>
                                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                                        {rule.calculation_type === 'percentage_of_base' ? (
                                            '% of Base Salary'
                                        ) : rule.calculation_type === 'grade_based' ? (
                                            <span className="text-violet-600 dark:text-violet-400 font-semibold">Grade-Based Matrix</span>
                                        ) : (
                                            'Fixed Amount (QAR)'
                                        )}
                                    </td>
                                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                        {rule.calculation_type === 'percentage_of_base' ? (
                                            `${rule.percentage_rate}%`
                                        ) : rule.calculation_type === 'grade_based' || (rule.grade_rates && Object.keys(rule.grade_rates).length > 0) ? (
                                            <div className="space-y-0.5">
                                                <div className="text-[11px] text-violet-600 dark:text-violet-400 font-medium">
                                                    {Object.entries(rule.grade_rates || {})
                                                        .map(([gid, amt]) => {
                                                            const gr = employeeGrades.find(g => g.id === gid);
                                                            const code = gr ? gr.code : gid.replace('GRADE_', 'G');
                                                            return `${code}: ${amt}`;
                                                        })
                                                        .join(' | ')} QAR
                                                </div>
                                                {Number(rule.default_amount || 0) > 0 && (
                                                    <div className="text-[10px] text-slate-400 font-normal">
                                                        Fallback: {Number(rule.default_amount).toLocaleString()} QAR
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            `${Number(rule.default_amount || 0).toLocaleString()} QAR`
                                        )}
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            {rule.wps_code || 'OTHER_ALW'}
                                        </span>
                                    </td>
                                    {canManage && (
                                        <td className="py-3.5 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditSalaryRule(rule)}
                                                    className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                    title="Edit Rule"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteSalaryRule(rule.id, rule.name)}
                                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                    title="Delete Rule"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TABS 2-5: TASK RATE & OVERTIME PRESETS TABLE */}
            {activeTab !== 'salary_rules' && activeTab !== 'grades' && activeTab !== 'leave_types' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                            {activeTab === 'overtime'
                                ? 'Configured Overtime Multipliers & Benefit Basis Formulae'
                                : activeTab === 'task_benefit'
                                    ? 'Locked Piece-Rate Task, Trip & Mission Categories'
                                    : activeTab === 'bonus'
                                        ? 'Fixed & Basis-Linked Incentive Categories'
                                        : 'Audited Disciplinary Fine & Recovery Policies'}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                            {filteredPresets.length} presets configured
                        </span>
                    </div>

                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="py-3.5 px-4">Preset Code</th>
                                <th className="py-3.5 px-4">Title / Name</th>
                                <th className="py-3.5 px-4">Calculation Mode</th>
                                <th className="py-3.5 px-4">Rate / Formula Value</th>
                                <th className="py-3.5 px-4">Calculation Basis Components</th>
                                <th className="py-3.5 px-4">Unit Label</th>
                                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredPresets.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                                        No presets configured for this category. Click "+ New Preset" above to create one.
                                    </td>
                                </tr>
                            ) : (
                                filteredPresets.map((rule) => {
                                    let incRules = [];
                                    if (Array.isArray(rule.included_benefit_rules)) {
                                        incRules = rule.included_benefit_rules;
                                    } else if (typeof rule.included_benefit_rules === 'string') {
                                        try {
                                            incRules = JSON.parse(rule.included_benefit_rules || '[]');
                                        } catch {
                                            incRules = [];
                                        }
                                    }

                                    return (
                                        <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                                {rule.id}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                                <div>{rule.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                    Subtype: {rule.subtype || 'general'}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                    {rule.calculation_mode || 'hourly_multiplier'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-bold">
                                                {rule.calculation_mode === 'hourly_multiplier' ? (
                                                    <span className="text-blue-600 dark:text-blue-400">
                                                        {rule.ot_multiplier_pct}% of Basis / 240 hrs
                                                    </span>
                                                ) : rule.calculation_mode === 'piece_rate' ? (
                                                    <span className="text-cyan-600 dark:text-cyan-400">
                                                        {Number(rule.default_unit_rate || 0).toFixed(2)} QAR / {rule.unit_label || 'Trip'}
                                                    </span>
                                                ) : rule.calculation_mode === 'daily_rate' ? (
                                                    <span className="text-rose-600 dark:text-rose-400">
                                                        {rule.ot_multiplier_pct}% of Daily Basis / 30 days
                                                    </span>
                                                ) : rule.calculation_mode === 'percentage_of_basis' ? (
                                                    <span className="text-indigo-600 dark:text-indigo-400">
                                                        {rule.ot_multiplier_pct}% of Basis
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-700 dark:text-slate-300">
                                                        {Number(rule.default_unit_rate || 0) > 0
                                                            ? `${Number(rule.default_unit_rate).toFixed(2)} QAR Fixed`
                                                            : 'Variable Fixed QAR'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-[11px]">
                                                {rule.calculation_mode === 'hourly_multiplier' ||
                                                    rule.calculation_mode === 'daily_rate' ||
                                                    rule.calculation_mode === 'percentage_of_basis' ? (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                                                            Basic
                                                        </span>
                                                        {incRules.length === 0 ? (
                                                            <span className="text-slate-400 text-[10px]">(Basic Only)</span>
                                                        ) : (
                                                            incRules.map((rId) => (
                                                                <span
                                                                    key={rId}
                                                                    className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[10px]"
                                                                >
                                                                    +{rId.replace('ALW_', '')}
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 font-mono text-[10px]">N/A (Fixed Rate)</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                                                {rule.unit_label || 'Units'}
                                            </td>
                                            {canManage && (
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEditPreset(rule)}
                                                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                            title="Edit Preset"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeletePreset(rule.id, rule.name)}
                                                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                            title="Delete Preset"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 6: LEAVE TYPES & POLICIES TABLE */}
            {activeTab === 'leave_types' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                            Company Leave Types &amp; Pay Rules
                        </span>
                        <span className="text-slate-400 text-[11px]">
                            {leaveTypes.length} leave types configured
                        </span>
                    </div>

                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="py-3.5 px-4">Policy Code</th>
                                <th className="py-3.5 px-4">Leave Policy Name</th>
                                <th className="py-3.5 px-4">Max Days / Year</th>
                                <th className="py-3.5 px-4">Pay Coverage</th>
                                <th className="py-3.5 px-4">Unpaid Deduction Basis</th>
                                <th className="py-3.5 px-4">Attachment Required</th>
                                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {leaveTypes.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                                        No leave types configured. Click "+ New Leave Policy" to add one.
                                    </td>
                                </tr>
                            ) : (
                                leaveTypes.map((lt) => {
                                    let dedRules = [];
                                    if (Array.isArray(lt.deduction_basis_rules)) {
                                        dedRules = lt.deduction_basis_rules;
                                    } else if (typeof lt.deduction_basis_rules === 'string') {
                                        try {
                                            dedRules = JSON.parse(lt.deduction_basis_rules || '[]');
                                        } catch {
                                            dedRules = [];
                                        }
                                    }

                                    const payPct = Number(lt.pay_percentage !== undefined ? lt.pay_percentage : 100.0);
                                    const payBadge =
                                        payPct >= 100.0
                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200'
                                            : payPct > 0.0
                                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200'
                                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200';

                                    return (
                                        <tr key={lt.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                                {lt.id}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                                {lt.name}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                                                {lt.max_days_per_year} Days
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${payBadge}`}>
                                                    {payPct.toFixed(0)}% {payPct >= 100.0 ? '(Full Pay)' : payPct > 0 ? '(Half Pay)' : '(Unpaid)'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-[11px]">
                                                {payPct < 100.0 ? (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                                                            Basic
                                                        </span>
                                                        {dedRules.length === 0 ? (
                                                            <span className="text-slate-400 text-[10px]">(Basic Only)</span>
                                                        ) : (
                                                            dedRules.map((rId) => (
                                                                <span
                                                                    key={rId}
                                                                    className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-mono text-[10px]"
                                                                >
                                                                    +{rId.replace('ALW_', '')}
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 font-mono text-[10px]">No Deduction (Full Pay)</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {lt.requires_attachment ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                                                        <Paperclip className="w-3.5 h-3.5" />
                                                        <span>Mandatory Proof</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-[11px]">Optional</span>
                                                )}
                                            </td>
                                            {canManage && (
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEditLeaveType(lt)}
                                                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                            title="Edit Leave Policy"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteLeaveType(lt.id, lt.name)}
                                                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                            title="Delete Leave Policy"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 1b: EMPLOYEE GRADES TABLE */}
            {activeTab === 'grades' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                            Employee Grades & Hierarchical Allowance Bands
                        </span>
                        <span className="text-slate-400 text-[11px]">
                            Used to automatically resolve grade-based allowances on Employee Contracts
                        </span>
                    </div>

                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="py-3.5 px-4">Code</th>
                                <th className="py-3.5 px-4">Grade Title</th>
                                <th className="py-3.5 px-4">Rank Order</th>
                                <th className="py-3.5 px-4">Description</th>
                                <th className="py-3.5 px-4">Assigned Employees</th>
                                <th className="py-3.5 px-4">Status</th>
                                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {employeeGrades.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400">
                                        No employee grades configured yet. Click "+ New Employee Grade" above.
                                    </td>
                                </tr>
                            ) : (
                                employeeGrades.map((g) => (
                                    <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                        <td className="py-3.5 px-4 font-mono font-bold text-violet-600 dark:text-violet-400">
                                            {g.code}
                                        </td>
                                        <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                                            {g.name}
                                        </td>
                                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                                            Rank {g.rank_order}
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                                            {g.description || '—'}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                                {g.assigned_employees_count || 0} Employees
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${g.is_active !== false
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80'
                                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                                }`}>
                                                {g.is_active !== false ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditGrade(g)}
                                                        className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                        title="Edit Grade"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteGrade(g.id)}
                                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                                        title="Delete Grade"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default SalaryRulesView;