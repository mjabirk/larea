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
  MessageCircle,
  MessageSquare,
} from 'lucide-react';
import { EmployeeDocumentsTab } from './EmployeeDocumentsTab';
import { EmployeeContractsTab } from './EmployeeContractsTab';
import { RecordChatter } from '../common/RecordChatter';
import { SendEmailModal } from '../common/SendEmailModal';
import { SendMessageModal } from '../common/SendMessageModal';
import { useAccessControl } from '../../context/AccessControlContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

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

  const { openChat } = useChat();
  const [employeeGrades, setEmployeeGrades] = useState([]);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ========================================================================= */}
      {/* MAIN FORM TABS & DETAILS: 8 Columns on Desktop (lg:col-span-8)           */}
      {/* ========================================================================= */}
      <div className="lg:col-span-8 space-y-6">
        {/* Tab Navigation Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="flex items-center overflow-x-auto border-b border-slate-200 dark:border-slate-800 p-1.5 bg-slate-50/50 dark:bg-slate-800/40 no-scrollbar">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${isActive
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/60 dark:border-slate-700/60'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                    }`}
                >
                  <TabIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.id === 'immigration' &&
                    ((qidDays !== null && qidDays <= 30) || (visaDays !== null && visaDays <= 30)) && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                </button>
              );
            })}
          </div>

          {/* Tab Contents: 16px padding with grouped card backgrounds */}
          <div className="p-4 sm:p-6 space-y-6">
            {/* ------------------------------------------------------------------- */}
            {/* Tab 1: General Info                                                 */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* Section 1: Personal Identity & Contact */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Personal Identity & Contact</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        First Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => handleChange('first_name', e.target.value)}
                        placeholder="e.g. Tariq"
                        className={`ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border ${formErrors.first_name
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-700'
                          } rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full`}
                      />
                      {formErrors.first_name && (
                        <p className="ui-microcopy text-[12px] text-rose-500 mt-1">{formErrors.first_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Last Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => handleChange('last_name', e.target.value)}
                        placeholder="e.g. Al-Mansoor"
                        className={`ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border ${formErrors.last_name
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-700'
                          } rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full`}
                      />
                      {formErrors.last_name && (
                        <p className="ui-microcopy text-[12px] text-rose-500 mt-1">{formErrors.last_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Full Legal Name
                      </label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => handleChange('full_name', e.target.value)}
                        placeholder="Full Official Legal Name"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Local / Arabic Name (الاسم باللغة العربية)
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={formData.display_name_local}
                        onChange={(e) => handleChange('display_name_local', e.target.value)}
                        placeholder="طارق المنصور"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full text-right"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Nationality
                      </label>
                      <input
                        type="text"
                        value={formData.nationality}
                        onChange={(e) => handleChange('nationality', e.target.value)}
                        placeholder="e.g. Qatar, United Kingdom, India, Egypt"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Gender & Marital Status
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={formData.gender}
                          onChange={(e) => handleChange('gender', e.target.value)}
                          className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                        <select
                          value={formData.marital_status}
                          onChange={(e) => handleChange('marital_status', e.target.value)}
                          className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => handleChange('date_of_birth', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Work Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={formData.work_email}
                        onChange={(e) => handleChange('work_email', e.target.value)}
                        placeholder="tariq@company.local"
                        className={`ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border ${formErrors.work_email
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-700'
                          } rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full`}
                      />
                      {formErrors.work_email && (
                        <p className="ui-microcopy text-[12px] text-rose-500 mt-1">{formErrors.work_email}</p>
                      )}
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Phone Number
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.phone_country_code}
                          onChange={(e) => handleChange('phone_country_code', e.target.value)}
                          className="w-24 ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-center text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
                        />
                        <input
                          type="text"
                          value={formData.phone_number}
                          onChange={(e) => handleChange('phone_number', e.target.value)}
                          placeholder="55123456"
                          className="flex-1 ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Personal Email
                      </label>
                      <input
                        type="email"
                        value={formData.personal_email}
                        onChange={(e) => handleChange('personal_email', e.target.value)}
                        placeholder="personal@gmail.com"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Emergency Contact Details */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Emergency Contact Details</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_name}
                        onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                        placeholder="Full Name"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_relation}
                        onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                        placeholder="e.g. Spouse, Brother"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Emergency Phone
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                        placeholder="+974 55998877"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* Tab 2: Employment Details                                           */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'employment' && (
              <div className="space-y-6">
                {/* Section 1: Role & Organization Placement */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Role & Organization Placement</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Employee Code / Number
                      </label>
                      <input
                        type="text"
                        value={formData.employee_number}
                        onChange={(e) => handleChange('employee_number', e.target.value)}
                        placeholder="Auto-generated (e.g. EMP-1004)"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Job Title / Designation <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.job_title}
                        onChange={(e) => handleChange('job_title', e.target.value)}
                        placeholder="e.g. Senior Operations Engineer"
                        className={`ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border ${formErrors.job_title
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 dark:border-slate-700'
                          } rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition w-full`}
                      />
                      {formErrors.job_title && (
                        <p className="ui-microcopy text-[12px] text-rose-500 mt-1">{formErrors.job_title}</p>
                      )}
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Department
                      </label>
                      <select
                        value={formData.department_id}
                        onChange={(e) => handleChange('department_id', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
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
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Employment Type
                      </label>
                      <select
                        value={formData.employment_type}
                        onChange={(e) => handleChange('employment_type', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      >
                        <option value="Full-Time">Full-Time</option>
                        <option value="Part-Time">Part-Time</option>
                        <option value="Contractor / Consultant">Contractor / Consultant</option>
                        <option value="Intern">Intern</option>
                      </select>
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Employment Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      >
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Terminated">Terminated</option>
                      </select>
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Work Permit / Labour Card Status
                      </label>
                      <select
                        value={formData.work_permit_status}
                        onChange={(e) => handleChange('work_permit_status', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      >
                        <option value="Valid">Valid</option>
                        <option value="Renewal in Progress">Renewal in Progress</option>
                        <option value="Under Processing">Under Processing</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Employee Grade (Allowance Matrix)
                      </label>
                      <select
                        value={formData.grade_id || ''}
                        onChange={(e) => handleChange('grade_id', e.target.value || null)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
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
                </div>

                {/* Section 2: Tenure & Key Milestones */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Tenure & Key Milestones</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Hire / Joining Date
                      </label>
                      <input
                        type="date"
                        value={formData.hire_date}
                        onChange={(e) => handleChange('hire_date', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Probation End Date
                      </label>
                      <input
                        type="date"
                        value={formData.probation_end_date}
                        onChange={(e) => handleChange('probation_end_date', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Contract End Date
                      </label>
                      <input
                        type="date"
                        value={formData.contract_end_date}
                        onChange={(e) => handleChange('contract_end_date', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* Tab 3: Contracts & Compensation                                     */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'contracts' && canReadContracts && (
              <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
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

            {/* ------------------------------------------------------------------- */}
            {/* Tab 4: Immigration & Compliance                                     */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'immigration' && (
              <div className="space-y-6">
                {/* Warning banner if expiring */}
                {((qidDays !== null && qidDays <= 30) || (visaDays !== null && visaDays <= 30)) && (
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

                {/* Section 1: QID / Iqama */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>National ID / QID / Iqama</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        National ID / QID Number
                      </label>
                      <input
                        type="text"
                        value={formData.national_id_number}
                        onChange={(e) => handleChange('national_id_number', e.target.value)}
                        placeholder="28563401294"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-0">
                          QID Expiry Date
                        </label>
                        {qidDays !== null && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${qidDays <= 15
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400'
                                : qidDays <= 30
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400'
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
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Passport Details */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Passport Travel Document</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Passport Number
                      </label>
                      <input
                        type="text"
                        value={formData.passport_number}
                        onChange={(e) => handleChange('passport_number', e.target.value)}
                        placeholder="A12345678"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-0">
                          Passport Expiry Date
                        </label>
                        {passportDays !== null && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {passportDays < 0 ? 'Expired' : `${passportDays} days left`}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formData.passport_expiry}
                        onChange={(e) => handleChange('passport_expiry', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Visa & Permit */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Visa & Entry Permit</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Visa / Entry Permit Number
                      </label>
                      <input
                        type="text"
                        value={formData.visa_number}
                        onChange={(e) => handleChange('visa_number', e.target.value)}
                        placeholder="VSA-998811"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-0">
                          Visa Expiry Date
                        </label>
                        {visaDays !== null && (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${visaDays <= 15
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400'
                                : visaDays <= 30
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400'
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
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* Tab 5: Banking & WPS                                                */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'banking' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold">Wages Protection System (WPS) Profile</h4>
                      <p className="text-xs text-blue-600/80 dark:text-blue-300/80 mt-0.5">
                        Enforces Qatar Central Bank statutory electronic salary compliance via authorized local clearing accounts.
                      </p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex text-[11px] font-mono font-bold px-2.5 py-1 rounded-md bg-blue-600 text-white shadow-xs">
                    WPS VERIFIED
                  </span>
                </div>

                {/* Section 1: Compensation & Payroll */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Compensation & Payroll</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Monthly Base Salary
                      </label>
                      {!canReadSalary ? (
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-400">
                          <span className="font-mono font-bold">•••••• {formData.currency}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Confidential
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
                            className={`ui-input h-[42px] min-h-[42px] text-[15px] pl-3.5 pr-14 font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full ${!canManageSalary ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-800/60' : ''
                              }`}
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                            {formData.currency}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Payroll Currency
                      </label>
                      <select
                        value={formData.currency}
                        disabled={!canManageSalary}
                        onChange={(e) => handleChange('currency', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
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
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Disbursement Method
                      </label>
                      <select
                        value={formData.payment_method}
                        onChange={(e) => handleChange('payment_method', e.target.value)}
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      >
                        <option value="Bank Transfer / WPS">Bank Transfer / WPS</option>
                        <option value="Direct Deposit">Direct Deposit</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Cash">Cash in Hand</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Bank Account Coordinates */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                  <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Bank Account Coordinates</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Authorized Bank Name
                      </label>
                      <input
                        type="text"
                        value={formData.bank_name}
                        onChange={(e) => handleChange('bank_name', e.target.value)}
                        placeholder="e.g. Qatar National Bank (QNB)"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div>
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        SWIFT / BIC Code
                      </label>
                      <input
                        type="text"
                        value={formData.bank_swift}
                        onChange={(e) => handleChange('bank_swift', e.target.value)}
                        placeholder="QNBAQAQA"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="ui-label text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        International Bank Account Number (IBAN)
                      </label>
                      <input
                        type="text"
                        value={formData.bank_iban}
                        onChange={(e) => handleChange('bank_iban', e.target.value)}
                        placeholder="QA58QNBA000000001234567890"
                        className="ui-input h-[42px] min-h-[42px] text-[15px] font-mono uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 transition w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* Tab 6: Documents                                                    */}
            {/* ------------------------------------------------------------------- */}
            {activeTab === 'documents' && (
              <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 sm:p-5 space-y-4">
                {isEditing ? (
                  <EmployeeDocumentsTab
                    employeeId={employee.id}
                    employeeName={formData.full_name}
                  />
                ) : (
                  <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Document Vault Locked
                    </h4>
                    <p className="ui-microcopy text-[12px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      Please save the employee record first. Once the employee ID is generated, you will be able to upload AES-256 encrypted documents.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dense Audit Trail & Chatter Feed */}
        {isEditing && (
          <RecordChatter
            entityType="employees"
            entityId={employee.id}
            entityName={formData.full_name}
          />
        )}
      </div>

      {/* ========================================================================= */}
      {/* STICKY RIGHT RAIL: 4 Columns on Desktop (lg:col-span-4, Sticky)           */}
      {/* ========================================================================= */}
      <div className="lg:col-span-4 sticky top-[72px] self-start space-y-5">
        {/* 1. Summary Profile Widget (Card Surface) - Non-redundant */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Profile Summary</span>
            </h3>
            <span className="text-xs font-mono font-medium text-slate-400">
              {formData.employee_number || 'NEW'}
            </span>
          </div>

          {/* Profile Avatar and Quick Placement Indicator */}
          <div className="flex items-center gap-3.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shadow-xs">
                {getInitials(formData.full_name)}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${formData.status === 'Active'
                    ? 'bg-emerald-500'
                    : formData.status === 'On Leave'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                title={`Status: ${formData.status}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {formData.department_id || 'Operations'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {formData.employment_type} • {formData.nationality}
              </div>
              {selectedGrade && (
                <span className="inline-block mt-1 text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  Grade {selectedGrade.code}
                </span>
              )}
            </div>
          </div>

          {/* Quick Contact & Placement Key-Value Metadata */}
          <div className="space-y-2 text-xs pt-1">
            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Work Email</span>
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[170px]" title={formData.work_email}>
                {formData.work_email || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Direct Phone</span>
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {formData.phone_number ? `${formData.phone_country_code} ${formData.phone_number}` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Nationality</span>
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formData.nationality || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Joining Date</span>
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {formData.hire_date || '—'}
              </span>
            </div>
          </div>

          {isEditing && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition shadow-2xs cursor-pointer"
                title="Send notification or correspondence to employee via corporate email"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Send by Email</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMessageModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition shadow-2xs cursor-pointer"
                title="Send notification or correspondence to employee via WhatsApp / SMS"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send WhatsApp / SMS</span>
              </button>

              <button
                type="button"
                onClick={() => openChat({ id: String(employee.id), name: formData.full_name || 'Employee' })}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 transition shadow-2xs cursor-pointer"
                title="Start real-time internal direct chat with employee"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Internal Chat (Discuss)</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. Expat Compliance Status Widget in clean key-value format */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="ui-h3 text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Statutory Compliance</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">MoI / Labour</span>
          </div>

          {/* Compliance Items: QID, Visa, Passport, WPS */}
          <div className="space-y-3">
            {/* QID / Civil ID */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  QID / Civil ID
                </span>
                {qidDays !== null ? (
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${qidDays < 0
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                        : qidDays <= 30
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                      }`}
                  >
                    {qidDays < 0 ? 'EXPIRED' : qidDays <= 30 ? `EXPIRING (${qidDays}d)` : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800">
                    MISSING
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span>{formData.national_id_number || 'No ID recorded'}</span>
                <span>{formData.national_id_expiry ? `Exp: ${formData.national_id_expiry}` : '—'}</span>
              </div>
            </div>

            {/* Visa & Permit */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Visa & Labour Permit
                </span>
                {visaDays !== null ? (
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${visaDays < 0
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                        : visaDays <= 30
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                      }`}
                  >
                    {visaDays < 0 ? 'EXPIRED' : visaDays <= 30 ? `EXPIRING (${visaDays}d)` : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800">
                    MISSING
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span>{formData.visa_number || 'No Visa recorded'}</span>
                <span>{formData.visa_expiry ? `Exp: ${formData.visa_expiry}` : '—'}</span>
              </div>
            </div>

            {/* Passport */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Passport Document
                </span>
                {passportDays !== null ? (
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${passportDays < 0
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                      }`}
                  >
                    {passportDays < 0 ? 'EXPIRED' : 'VALID'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800">
                    MISSING
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span>{formData.passport_number || 'No Passport recorded'}</span>
                <span>{formData.passport_expiry ? `Exp: ${formData.passport_expiry}` : '—'}</span>
              </div>
            </div>

            {/* WPS Banking Readiness */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  WPS Banking
                </span>
                {formData.bank_iban ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> READY
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800">
                    PENDING IBAN
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {formData.bank_name || 'No bank assigned'}
              </div>
              {formData.bank_iban && (
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  IBAN: {formData.bank_iban}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corporate Email Composer Modal */}
      {isEditing && isEmailModalOpen && (
        <SendEmailModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          recordModel="hr.employee"
          recordId={String(employee.id)}
          defaultToEmail={formData.work_email || ''}
          defaultSubject={`Apex Global HR: Notice regarding employee ${formData.full_name} (${formData.employee_number || 'ID'})`}
          recordData={{
            employee_name: formData.full_name,
            employee_number: formData.employee_number,
            work_email: formData.work_email,
            department: formData.department_id,
            job_title: formData.job_title,
            hire_date: formData.hire_date,
            base_salary: formData.base_salary,
          }}
          onSent={() => {
            // modal auto dispatches chatter event
          }}
        />
      )}

      {/* WhatsApp & SMS Communication Modal */}
      {isEditing && isMessageModalOpen && (
        <SendMessageModal
          isOpen={isMessageModalOpen}
          onClose={() => setIsMessageModalOpen(false)}
          recordModel="hr.employee"
          recordId={String(employee.id)}
          recordData={{
            employee_name: formData.full_name,
            employee_number: formData.employee_number,
            department: formData.department_id,
            job_title: formData.job_title,
            phone: formData.phone || formData.mobile || '+974 5599 8877',
          }}
          defaultChannel="whatsapp"
        />
      )}
    </div>
  );
});

export default EmployeeFormView;
