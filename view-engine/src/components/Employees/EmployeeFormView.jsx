import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  ArrowLeft,
  Save,
  User,
  Briefcase,
  ShieldCheck,
  CreditCard,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Mail,
  Phone,
  Globe,
  Calendar,
  Lock,
  DollarSign,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { EmployeeDocumentsTab } from './EmployeeDocumentsTab';
import { EmployeeContractsTab } from './EmployeeContractsTab';
import { RecordChatter } from '../common/RecordChatter';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';

export const EmployeeFormView = forwardRef(function EmployeeFormView({
  employee = null,
  isSaving = false,
  onSave,
  onBack,
  onDirtyChange,
  showHeader = false,
}, ref) {
  const isEditing = Boolean(employee && employee.id);
  const { hasPermission } = useAccessControl();
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [employeeGrades, setEmployeeGrades] = useState([]);

  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const headers = {};
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        const res = await fetch('/api/v1/employee-grades', { headers });
        if (res.ok) {
          const data = await res.json();
          setEmployeeGrades(data.grades || (Array.isArray(data) ? data : []));
        }
      } catch (err) {
        console.error('Failed to fetch employee grades:', err);
      }
    };
    fetchGrades();
  }, [sessionToken]);

  const canReadContracts = hasPermission('hr.contracts_read');
  const canReadSalary = hasPermission('hr.salary_read');
  const canManageSalary = hasPermission('hr.salary_manage');

  const tabs = [
    { id: 'general', label: 'General Info', icon: User },
    { id: 'employment', label: 'Employment Details', icon: Briefcase },
    ...(canReadContracts
      ? [{ id: 'contracts', label: 'Contracts & Compensation', icon: FileText }]
      : []),
    { id: 'immigration', label: 'Immigration & Compliance', icon: ShieldCheck },
    { id: 'banking', label: 'Banking & WPS', icon: CreditCard },
    { id: 'documents', label: 'Documents', icon: FileText },
  ];

  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({
    employee_number: '',
    first_name: '',
    last_name: '',
    full_name: '',
    display_name_local: '',
    gender: 'Male',
    date_of_birth: '',
    marital_status: 'Single',
    nationality: 'Qatar',

    job_title: '',
    department_id: 'Operations',
    grade_id: '',
    employment_type: 'Full-Time',
    hire_date: '',
    probation_end_date: '',
    contract_end_date: '',
    status: 'Active',
    work_permit_status: 'Valid',

    national_id_number: '',
    national_id_expiry: '',
    passport_number: '',
    passport_expiry: '',
    visa_number: '',
    visa_expiry: '',

    work_email: '',
    personal_email: '',
    phone_country_code: '+974',
    phone_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',

    base_salary: 0,
    currency: 'QAR',
    payment_method: 'Bank Transfer / WPS',
    bank_name: 'Qatar National Bank (QNB)',
    bank_iban: '',
    bank_swift: '',
  });

  const [formErrors, setFormErrors] = useState({});
  const [isDirty, setIsDirty] = useState(!employee);

  const selectedGrade =
    employeeGrades.find((g) => g.id === formData.grade_id) ||
    (employee?.grade_name ? { code: employee.grade_code, name: employee.grade_name } : null);

  useEffect(() => {
    if (employee) {
      setFormData({
        employee_number: employee.employee_number || '',
        first_name: employee.first_name || '',
        last_name: employee.last_name || '',
        full_name: employee.full_name || '',
        display_name_local: employee.display_name_local || '',
        gender: employee.gender || 'Male',
        date_of_birth: employee.date_of_birth || '',
        marital_status: employee.marital_status || 'Single',
        nationality: employee.nationality || 'Qatar',

        job_title: employee.job_title || '',
        department_id: employee.department_id || 'Operations',
        grade_id: employee.grade_id || '',
        employment_type: employee.employment_type || 'Full-Time',
        hire_date: employee.hire_date || '',
        probation_end_date: employee.probation_end_date || '',
        contract_end_date: employee.contract_end_date || '',
        status: employee.status || 'Active',
        work_permit_status: employee.work_permit_status || 'Valid',

        national_id_number: employee.national_id_number || '',
        national_id_expiry: employee.national_id_expiry || '',
        passport_number: employee.passport_number || '',
        passport_expiry: employee.passport_expiry || '',
        visa_number: employee.visa_number || '',
        visa_expiry: employee.visa_expiry || '',

        work_email: employee.work_email || '',
        personal_email: employee.personal_email || '',
        phone_country_code: employee.phone_country_code || '+974',
        phone_number: employee.phone_number || '',
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        emergency_contact_relation: employee.emergency_contact_relation || '',

        base_salary: employee.base_salary || 0,
        currency: employee.currency || 'QAR',
        payment_method: employee.payment_method || 'Bank Transfer / WPS',
        bank_name: employee.bank_name || 'Qatar National Bank (QNB)',
        bank_iban: employee.bank_iban || '',
        bank_swift: employee.bank_swift || '',
      });
      setFormErrors({});
      setIsDirty(false);
      onDirtyChange?.(false);
    } else {
      setFormData({
        employee_number: '',
        first_name: '',
        last_name: '',
        full_name: '',
        display_name_local: '',
        gender: 'Male',
        date_of_birth: '',
        marital_status: 'Single',
        nationality: 'Qatar',

        job_title: '',
        department_id: 'Operations',
        grade_id: '',
        employment_type: 'Full-Time',
        hire_date: '',
        probation_end_date: '',
        contract_end_date: '',
        status: 'Active',
        work_permit_status: 'Valid',

        national_id_number: '',
        national_id_expiry: '',
        passport_number: '',
        passport_expiry: '',
        visa_number: '',
        visa_expiry: '',

        work_email: '',
        personal_email: '',
        phone_country_code: '+974',
        phone_number: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relation: '',

        base_salary: 0,
        currency: 'QAR',
        payment_method: 'Bank Transfer / WPS',
        bank_name: 'Qatar National Bank (QNB)',
        bank_iban: '',
        bank_swift: '',
      });
      setFormErrors({});
      setActiveTab('general');
      setIsDirty(true);
      onDirtyChange?.(true);
    }
  }, [employee]);

  const handleChange = (field, value) => {
    setIsDirty(true);
    onDirtyChange?.(true);
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'first_name' || field === 'last_name') {
        const fn = field === 'first_name' ? value : prev.first_name;
        const ln = field === 'last_name' ? value : prev.last_name;
        next.full_name = `${fn} ${ln}`.trim();
      }
      return next;
    });

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.first_name.trim()) errors.first_name = 'First name is required';
    if (!formData.last_name.trim()) errors.last_name = 'Last name is required';
    if (!formData.work_email.trim()) errors.work_email = 'Work email is required';
    if (!formData.job_title.trim()) errors.job_title = 'Job title is required';
    return errors;
  };

  const handleDiscard = () => {
    if (employee) {
      setFormData({
        employee_number: employee.employee_number || '',
        first_name: employee.first_name || '',
        last_name: employee.last_name || '',
        full_name: employee.full_name || '',
        display_name_local: employee.display_name_local || '',
        gender: employee.gender || 'Male',
        date_of_birth: employee.date_of_birth || '',
        marital_status: employee.marital_status || 'Single',
        nationality: employee.nationality || 'Qatar',

        job_title: employee.job_title || '',
        department_id: employee.department_id || 'Operations',
        grade_id: employee.grade_id || '',
        employment_type: employee.employment_type || 'Full-Time',
        hire_date: employee.hire_date || '',
        probation_end_date: employee.probation_end_date || '',
        contract_end_date: employee.contract_end_date || '',
        status: employee.status || 'Active',
        work_permit_status: employee.work_permit_status || 'Valid',

        national_id_number: employee.national_id_number || '',
        national_id_expiry: employee.national_id_expiry || '',
        passport_number: employee.passport_number || '',
        passport_expiry: employee.passport_expiry || '',
        visa_number: employee.visa_number || '',
        visa_expiry: employee.visa_expiry || '',

        work_email: employee.work_email || '',
        personal_email: employee.personal_email || '',
        phone_country_code: employee.phone_country_code || '+974',
        phone_number: employee.phone_number || '',
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        emergency_contact_relation: employee.emergency_contact_relation || '',

        base_salary: employee.base_salary || 0,
        currency: employee.currency || 'QAR',
        payment_method: employee.payment_method || 'Bank Transfer / WPS',
        bank_name: employee.bank_name || 'Qatar National Bank (QNB)',
        bank_iban: employee.bank_iban || '',
        bank_swift: employee.bank_swift || '',
      });
      setFormErrors({});
      setIsDirty(false);
      onDirtyChange?.(false);
    } else {
      onBack?.();
    }
  };

  useImperativeHandle(ref, () => ({
    submit: () => {
      const errors = validate();
      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        setActiveTab('general');
        return false;
      }
      onSave(formData);
      return true;
    },
    discard: handleDiscard,
    isDirty,
    getFormData: () => formData,
  }), [formData, employee, onSave, onBack, isDirty]);

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActiveTab('general');
      return;
    }
    onSave(formData);
  };

  // Helper for expiry countdown
  const getDaysRemaining = (expiryDateStr) => {
    if (!expiryDateStr) return null;
    try {
      const now = new Date();
      const exp = new Date(expiryDateStr);
      const diffTime = exp.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const qidDays = getDaysRemaining(formData.national_id_expiry);
  const visaDays = getDaysRemaining(formData.visa_expiry);
  const passportDays = getDaysRemaining(formData.passport_expiry);

  const getInitials = (name) => {
    if (!name) return 'EMP';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar (Optional / Bespoke header) */}
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Back to Employees Directory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isEditing ? formData.full_name || 'Edit Employee' : 'New Employee Profile'}
                </h1>
                {formData.employee_number && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    {formData.employee_number}
                  </span>
                )}
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    formData.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : formData.status === 'On Leave'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {formData.status}
                </span>
                {selectedGrade && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {selectedGrade.code} • {selectedGrade.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formData.job_title ? `${formData.job_title} • ${formData.department_id}` : 'Workforce Record Management'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving Record...' : isEditing ? 'Save Changes' : 'Create Employee'}
            </button>
          </div>
        </div>
      )}

      {/* Record Quick Info Card (Clean Odoo-Style Form Sheet Header) */}
      {!showHeader && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shadow-xs shrink-0">
              {getInitials(formData.full_name)}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEditing ? formData.full_name || 'Unnamed Employee' : 'New Employee Profile'}
                </h2>
                {formData.employee_number && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    {formData.employee_number}
                  </span>
                )}
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    formData.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : formData.status === 'On Leave'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {formData.status}
                </span>
                {selectedGrade && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {selectedGrade.code} • {selectedGrade.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formData.job_title ? `${formData.job_title} • ${formData.department_id}` : 'Workforce Record Management'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 70/30 Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Section (70% - lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tab Navigation */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="flex items-center overflow-x-auto border-b border-slate-200 dark:border-slate-800 p-1.5 bg-slate-50/50 dark:bg-slate-800/40">
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.id === 'immigration' && (qidDays !== null && qidDays <= 30 || visaDays !== null && visaDays <= 30) && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Contents */}
            <div className="p-5 sm:p-6">
              {/* Tab 1: General Info */}
              {activeTab === 'general' && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Personal Identity & Contact
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        First Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => handleChange('first_name', e.target.value)}
                        placeholder="e.g. Tariq"
                        className={`w-full text-xs px-3.5 py-2 rounded-xl border ${
                          formErrors.first_name
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800'
                        } bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      {formErrors.first_name && (
                        <p className="text-[11px] text-rose-500 mt-1">{formErrors.first_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Last Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => handleChange('last_name', e.target.value)}
                        placeholder="e.g. Al-Mansoor"
                        className={`w-full text-xs px-3.5 py-2 rounded-xl border ${
                          formErrors.last_name
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800'
                        } bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      {formErrors.last_name && (
                        <p className="text-[11px] text-rose-500 mt-1">{formErrors.last_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Full Legal Name
                      </label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => handleChange('full_name', e.target.value)}
                        placeholder="Full Official Name"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Local / Arabic Name (الاسم باللغة العربية)
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={formData.display_name_local}
                        onChange={(e) => handleChange('display_name_local', e.target.value)}
                        placeholder="طارق المنصور"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nationality
                      </label>
                      <input
                        type="text"
                        value={formData.nationality}
                        onChange={(e) => handleChange('nationality', e.target.value)}
                        placeholder="e.g. Qatar, United Kingdom, India, Egypt"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Gender & Marital Status
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={formData.gender}
                          onChange={(e) => handleChange('gender', e.target.value)}
                          className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                        <select
                          value={formData.marital_status}
                          onChange={(e) => handleChange('marital_status', e.target.value)}
                          className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => handleChange('date_of_birth', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Work Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={formData.work_email}
                        onChange={(e) => handleChange('work_email', e.target.value)}
                        placeholder="tariq@company.local"
                        className={`w-full text-xs px-3.5 py-2 rounded-xl border ${
                          formErrors.work_email
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800'
                        } bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      {formErrors.work_email && (
                        <p className="text-[11px] text-rose-500 mt-1">{formErrors.work_email}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Phone Number
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.phone_country_code}
                          onChange={(e) => handleChange('phone_country_code', e.target.value)}
                          className="w-20 text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        <input
                          type="text"
                          value={formData.phone_number}
                          onChange={(e) => handleChange('phone_number', e.target.value)}
                          placeholder="55123456"
                          className="flex-1 text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Personal Email
                      </label>
                      <input
                        type="email"
                        value={formData.personal_email}
                        onChange={(e) => handleChange('personal_email', e.target.value)}
                        placeholder="personal@gmail.com"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Emergency Contact Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_name}
                        onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                        placeholder="Name"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_relation}
                        onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                        placeholder="e.g. Spouse, Brother"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Emergency Phone
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                        placeholder="+974 55998877"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Employment & Contract */}
              {activeTab === 'employment' && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Role & Organization Placement
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Employee Code / Number
                      </label>
                      <input
                        type="text"
                        value={formData.employee_number}
                        onChange={(e) => handleChange('employee_number', e.target.value)}
                        placeholder="Auto-generated (e.g. EMP-1004)"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Job Title / Designation <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.job_title}
                        onChange={(e) => handleChange('job_title', e.target.value)}
                        placeholder="e.g. Senior Operations Engineer"
                        className={`w-full text-xs px-3.5 py-2 rounded-xl border ${
                          formErrors.job_title
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-800'
                        } bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      {formErrors.job_title && (
                        <p className="text-[11px] text-rose-500 mt-1">{formErrors.job_title}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Department
                      </label>
                      <select
                        value={formData.department_id}
                        onChange={(e) => handleChange('department_id', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Operations">Operations</option>
                        <option value="Human Resources">Human Resources</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Finance & Accounts">Finance & Accounts</option>
                        <option value="General Administration">General Administration</option>
                        <option value="Sales & Business Dev">Sales & Business Dev</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Employment Type
                      </label>
                      <select
                        value={formData.employment_type}
                        onChange={(e) => handleChange('employment_type', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Full-Time">Full-Time</option>
                        <option value="Part-Time">Part-Time</option>
                        <option value="Contractor / Consultant">Contractor / Consultant</option>
                        <option value="Intern">Intern</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Employment Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Terminated">Terminated</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Work Permit / Labour Card Status
                      </label>
                      <select
                        value={formData.work_permit_status}
                        onChange={(e) => handleChange('work_permit_status', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Valid">Valid</option>
                        <option value="Renewal in Progress">Renewal in Progress</option>
                        <option value="Under Processing">Under Processing</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Employee Grade (Allowance Matrix)
                      </label>
                      <select
                        value={formData.grade_id || ''}
                        onChange={(e) => handleChange('grade_id', e.target.value || null)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No Grade Assigned</option>
                        {employeeGrades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.code} — {g.name} (Rank #{g.rank_order})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Tenure & Key Milestones
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Hire / Joining Date
                      </label>
                      <input
                        type="date"
                        value={formData.hire_date}
                        onChange={(e) => handleChange('hire_date', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Probation End Date
                      </label>
                      <input
                        type="date"
                        value={formData.probation_end_date}
                        onChange={(e) => handleChange('probation_end_date', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Contract End Date
                      </label>
                      <input
                        type="date"
                        value={formData.contract_end_date}
                        onChange={(e) => handleChange('contract_end_date', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                </div>
              )}

              {/* Tab: Contracts & Compensation (Dedicated Tab) */}
              {activeTab === 'contracts' && canReadContracts && (
                <div className="space-y-5">
                  <EmployeeContractsTab
                    employeeId={employee?.id}
                    employeeName={formData.full_name || `${formData.first_name} ${formData.last_name}`}
                    employeeNumber={formData.employee_number}
                    baseSalary={formData.base_salary}
                    currency={formData.currency}
                    onContractSalarySync={(wage, curr) => {
                      handleChange('base_salary', wage);
                      if (curr) handleChange('currency', curr);
                    }}
                  />
                </div>
              )}

              {/* Tab 3: Immigration & Compliance */}
              {activeTab === 'immigration' && (
                <div className="space-y-5">
                  {/* Warning banner if expiring */}
                  {(qidDays !== null && qidDays <= 30 || visaDays !== null && visaDays <= 30) && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                      <div>
                        <h4 className="text-xs font-bold">Immigration Expiry Alert Triggered</h4>
                        <p className="text-xs mt-0.5 opacity-90">
                          One or more statutory documents for this expat employee are expiring within 30 days. Please initiate renewal with the Ministry of Interior / Labour promptly.
                        </p>
                      </div>
                    </div>
                  )}

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    National ID / QID / Iqama
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        National ID / QID Number
                      </label>
                      <input
                        type="text"
                        value={formData.national_id_number}
                        onChange={(e) => handleChange('national_id_number', e.target.value)}
                        placeholder="28563401294"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          QID Expiry Date
                        </label>
                        {qidDays !== null && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              qidDays <= 15
                                ? 'bg-rose-500/20 text-rose-500'
                                : qidDays <= 30
                                ? 'bg-amber-500/20 text-amber-500'
                                : 'bg-emerald-500/20 text-emerald-500'
                            }`}
                          >
                            {qidDays < 0 ? `Expired ${Math.abs(qidDays)}d ago` : `${qidDays} days left`}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.national_id_expiry}
                        onChange={(e) => handleChange('national_id_expiry', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Passport Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Passport Number
                      </label>
                      <input
                        type="text"
                        value={formData.passport_number}
                        onChange={(e) => handleChange('passport_number', e.target.value)}
                        placeholder="A12345678"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Passport Expiry Date
                        </label>
                        {passportDays !== null && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500">
                            {passportDays < 0 ? `Expired` : `${passportDays} days left`}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.passport_expiry}
                        onChange={(e) => handleChange('passport_expiry', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Visa & Residency Permit
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Visa / Entry Permit Number
                      </label>
                      <input
                        type="text"
                        value={formData.visa_number}
                        onChange={(e) => handleChange('visa_number', e.target.value)}
                        placeholder="VSA-998811"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Visa Expiry Date
                        </label>
                        {visaDays !== null && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              visaDays <= 15
                                ? 'bg-rose-500/20 text-rose-500'
                                : visaDays <= 30
                                ? 'bg-amber-500/20 text-amber-500'
                                : 'bg-emerald-500/20 text-emerald-500'
                            }`}
                          >
                            {visaDays < 0 ? `Expired ${Math.abs(visaDays)}d ago` : `${visaDays} days left`}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.visa_expiry}
                        onChange={(e) => handleChange('visa_expiry', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Banking & WPS */}
              {activeTab === 'banking' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold">Wages Protection System (WPS) Profile</h4>
                        <p className="text-xs text-blue-600/80 dark:text-blue-300/80 mt-0.5">
                          Enforces Central Bank statutory electronic salary compliance via authorized local clearing accounts.
                        </p>
                      </div>
                    </div>
                    <span className="hidden sm:inline-flex text-[11px] font-mono font-bold px-2 py-1 rounded bg-blue-600 text-white shadow-xs">
                      WPS VERIFIED
                    </span>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Compensation & Payroll
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Monthly Base Salary
                      </label>
                      {!canReadSalary ? (
                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-400">
                          <span className="font-mono font-bold">•••••• {formData.currency}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Restricted Confidential Field
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            value={formData.base_salary}
                            disabled={!canManageSalary}
                            onChange={(e) => handleChange('base_salary', parseFloat(e.target.value) || 0)}
                            className={`w-full text-xs pl-3.5 pr-12 py-2 rounded-xl border border-slate-200 dark:border-slate-800 ${
                              !canManageSalary
                                ? 'bg-slate-100 dark:bg-slate-800/40 cursor-not-allowed text-slate-500'
                                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white'
                            } focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                            {formData.currency}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Payroll Currency
                      </label>
                      <select
                        value={formData.currency}
                        disabled={!canManageSalary}
                        onChange={(e) => handleChange('currency', e.target.value)}
                        className={`w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 ${
                          !canManageSalary
                            ? 'bg-slate-100 dark:bg-slate-800/40 cursor-not-allowed text-slate-500'
                            : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono`}
                      >
                        <option value="QAR">QAR - Qatari Riyal</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - British Pound</option>
                        <option value="AED">AED - UAE Dirham</option>
                        <option value="SAR">SAR - Saudi Riyal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Disbursement Method
                      </label>
                      <select
                        value={formData.payment_method}
                        onChange={(e) => handleChange('payment_method', e.target.value)}
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Bank Transfer / WPS">Bank Transfer / WPS</option>
                        <option value="Direct Deposit">Direct Deposit</option>
                        <option value="Cheque">Corporate Cheque</option>
                        <option value="Cash">Cash in Hand</option>
                      </select>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Bank Account Coordinates
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Authorized Bank Name
                      </label>
                      <input
                        type="text"
                        value={formData.bank_name}
                        onChange={(e) => handleChange('bank_name', e.target.value)}
                        placeholder="e.g. Qatar National Bank (QNB)"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        SWIFT / BIC Code
                      </label>
                      <input
                        type="text"
                        value={formData.bank_swift}
                        onChange={(e) => handleChange('bank_swift', e.target.value)}
                        placeholder="QNBAQAQA"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        International Bank Account Number (IBAN)
                      </label>
                      <input
                        type="text"
                        value={formData.bank_iban}
                        onChange={(e) => handleChange('bank_iban', e.target.value)}
                        placeholder="QA58QNBA000000001234567890"
                        className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Documents */}
              {activeTab === 'documents' && (
                <div>
                  {isEditing ? (
                    <EmployeeDocumentsTab
                      employeeId={employee.id}
                      employeeName={formData.full_name}
                    />
                  ) : (
                    <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
                      <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Document Vault Locked
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                        Please save the employee record first. Once the employee ID is generated, you will be able to upload AES-256 encrypted documents.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Odoo-style Audit Trail & Chatter Engine */}
          {isEditing && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <RecordChatter
                entityType="employees"
                entityId={employee.id}
                entityName={formData.full_name}
              />
            </div>
          )}
        </div>

        {/* Right Rail (30% - lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Identity Summary Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs text-center">
            <div className="relative inline-block mx-auto mb-3">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white text-2xl font-bold flex items-center justify-center shadow-lg">
                {getInitials(formData.full_name)}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                  formData.status === 'Active'
                    ? 'bg-emerald-500'
                    : formData.status === 'On Leave'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
            </div>

            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {formData.full_name || 'Unnamed Employee'}
            </h2>
            {formData.display_name_local && (
              <p className="text-xs text-slate-400 font-arabic mt-0.5">
                {formData.display_name_local}
              </p>
            )}
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1">
              {formData.job_title || 'No Job Title'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formData.department_id}
            </p>

            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 text-left space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 truncate">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{formData.work_email || 'No email specified'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {formData.phone_number
                    ? `${formData.phone_country_code} ${formData.phone_number}`
                    : 'No phone'}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{formData.nationality}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Hired: {formData.hire_date || 'Not set'}</span>
              </div>
            </div>
          </div>

          {/* Expat Compliance Quick Status Widget */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                Expat Compliance Status
              </h3>
              <span className="text-[10px] font-mono text-slate-400">MoI / Labour</span>
            </div>

            {/* QID Status Pill */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">QID / Iqama</span>
                {qidDays !== null ? (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      qidDays <= 15
                        ? 'bg-rose-500/20 text-rose-500'
                        : qidDays <= 30
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-emerald-500/20 text-emerald-500'
                    }`}
                  >
                    {qidDays < 0 ? 'EXPIRED' : qidDays <= 30 ? `EXPIRING (${qidDays}d)` : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Not recorded</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex justify-between">
                <span className="font-mono">{formData.national_id_number || 'No QID'}</span>
                <span>{formData.national_id_expiry || '—'}</span>
              </div>
            </div>

            {/* Visa Status Pill */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Visa & Permit</span>
                {visaDays !== null ? (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      visaDays <= 15
                        ? 'bg-rose-500/20 text-rose-500'
                        : visaDays <= 30
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-emerald-500/20 text-emerald-500'
                    }`}
                  >
                    {visaDays < 0 ? 'EXPIRED' : visaDays <= 30 ? `EXPIRING (${visaDays}d)` : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Not recorded</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex justify-between">
                <span className="font-mono">{formData.visa_number || 'No Visa'}</span>
                <span>{formData.visa_expiry || '—'}</span>
              </div>
            </div>

            {/* Passport Status Pill */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Passport</span>
                {passportDays !== null ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {passportDays < 0 ? 'EXPIRED' : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Not recorded</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex justify-between">
                <span className="font-mono">{formData.passport_number || 'No Passport'}</span>
                <span>{formData.passport_expiry || '—'}</span>
              </div>
            </div>

            {/* Banking Readiness */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">WPS Banking</span>
                {formData.bank_iban ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> READY
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-500">
                    PENDING IBAN
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {formData.bank_name}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EmployeeFormView;
