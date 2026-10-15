import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EmployeeListView } from './EmployeeListView';
import { EmployeeFormView } from './EmployeeFormView';
import { ControlPanel } from '../ViewEngine/ControlPanel';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function EmployeesView({ activeMenuId = 'employees', initialEmployeeId = null, onBackToList }) {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [viewMode, setViewMode] = useState(activeMenuId === 'new_employee' ? 'form' : 'list');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Search & Filter state for ControlPanel
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Form dirty state & reference
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef(null);

  const getHeaders = (hasBody = true) => {
    const headers = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
  };

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/employees', {
        headers: getHeaders(false),
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      } else {
        console.error('Failed to fetch employees');
      }
    } catch (err) {
      console.error('Network error fetching employees:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (initialEmployeeId && employees.length > 0) {
      const match = employees.find((e) => e.id === initialEmployeeId);
      if (match) {
        setSelectedEmployee(match);
        setViewMode('form');
        setIsDirty(false);
        return;
      }
    }
    if (activeMenuId === 'new_employee') {
      setSelectedEmployee(null);
      setViewMode('form');
      setIsDirty(true);
    } else if (activeMenuId === 'employees' && !initialEmployeeId) {
      setViewMode('list');
      setSelectedEmployee(null);
      setIsDirty(false);
    }
  }, [activeMenuId, initialEmployeeId, employees]);

  // Filtered employees for list & pager cycling
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = (emp.full_name || '').toLowerCase().includes(q);
        const matchesNum = (emp.employee_number || '').toLowerCase().includes(q);
        const matchesJob = (emp.job_title || '').toLowerCase().includes(q);
        const matchesDept = (emp.department_id || '').toLowerCase().includes(q);
        const matchesEmail = (emp.work_email || '').toLowerCase().includes(q);
        const matchesQid = (emp.national_id_number || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNum && !matchesJob && !matchesDept && !matchesEmail && !matchesQid) {
          return false;
        }
      }

      if (activeFilter !== 'all') {
        if ((emp.status || '').toLowerCase() !== activeFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [employees, searchTerm, activeFilter]);

  // Current record index in filtered employees for Form View pager
  const currentIndex = useMemo(() => {
    if (!selectedEmployee) return -1;
    return filteredEmployees.findIndex((e) => e.id === selectedEmployee.id);
  }, [selectedEmployee, filteredEmployees]);

  // Standard Declarative View Schema for ControlPanel
  const employeeSchema = useMemo(() => ({
    model: 'hr.employee',
    newButtonLabel: '+ New Employee',
    filterChips: [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
      { id: 'on leave', label: 'On Leave' },
      { id: 'terminated', label: 'Terminated' },
    ],
    views: {
      list: { label: 'List' },
      form: { label: 'Form' },
    },
  }), []);

  // Standard Breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (viewMode === 'list') {
      return [
        { label: 'Human Resources' },
        { label: 'Employees', onClick: () => setViewMode('list') },
      ];
    }
    return [
      { label: 'Human Resources' },
      {
        label: 'Employees',
        onClick: () => {
          setViewMode('list');
          setSelectedEmployee(null);
          setIsDirty(false);
          onBackToList?.();
        },
      },
      { label: selectedEmployee?.full_name || 'New Employee Profile' },
    ];
  }, [viewMode, selectedEmployee, onBackToList]);

  // Standard Active Record Pill
  const activeRecordPill = useMemo(() => {
    if (viewMode === 'list') {
      return `${filteredEmployees.length} Employees`;
    }
    return selectedEmployee?.employee_number
      ? `[${selectedEmployee.employee_number}]`
      : '[NEW]';
  }, [viewMode, filteredEmployees.length, selectedEmployee]);

  // Smooth Record Pager Cycling (1 of N < >)
  const pager = useMemo(() => {
    if (viewMode !== 'form' || currentIndex === -1 || filteredEmployees.length === 0) {
      return null;
    }
    return {
      label: `${currentIndex + 1} of ${filteredEmployees.length}`,
      onPrev: () => {
        if (currentIndex > 0) {
          setSelectedEmployee(filteredEmployees[currentIndex - 1]);
          setIsDirty(false);
        }
      },
      onNext: () => {
        if (currentIndex < filteredEmployees.length - 1) {
          setSelectedEmployee(filteredEmployees[currentIndex + 1]);
          setIsDirty(false);
        }
      },
      canPrev: currentIndex > 0,
      canNext: currentIndex < filteredEmployees.length - 1,
    };
  }, [viewMode, currentIndex, filteredEmployees]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setViewMode('form');
    setIsDirty(false);
  };

  const handleNewEmployee = () => {
    setSelectedEmployee(null);
    setViewMode('form');
    setIsDirty(true);
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedEmployee(null);
    setIsDirty(false);
    onBackToList?.();
    fetchEmployees();
  };

  // View switcher toggle
  const handleViewChange = (newView) => {
    if (newView === 'list') {
      setViewMode('list');
      setSelectedEmployee(null);
      setIsDirty(false);
    } else if (newView === 'form') {
      if (!selectedEmployee && filteredEmployees.length > 0) {
        setSelectedEmployee(filteredEmployees[0]);
      }
      setViewMode('form');
    }
  };

  // ControlPanel Save button
  const handleControlPanelSave = () => {
    if (formRef.current) {
      formRef.current.submit();
    }
  };

  // ControlPanel Discard button
  const handleControlPanelDiscard = () => {
    if (formRef.current) {
      formRef.current.discard();
    } else {
      handleBack();
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    if (filteredEmployees.length === 0) return;
    const headers = [
      'Employee Number',
      'Full Name',
      'Job Title',
      'Department',
      'Status',
      'Work Email',
      'Phone',
      'Base Salary',
      'Currency',
    ];
    const rows = filteredEmployees.map((e) => [
      `"${e.employee_number || ''}"`,
      `"${(e.full_name || '').replace(/"/g, '""')}"`,
      `"${(e.job_title || '').replace(/"/g, '""')}"`,
      `"${(e.department_id || '').replace(/"/g, '""')}"`,
      `"${e.status || ''}"`,
      `"${e.work_email || ''}"`,
      `"${e.phone_number || ''}"`,
      `"${e.base_salary || 0}"`,
      `"${e.currency || 'QAR'}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `employees_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Bulk / Form Delete
  const handleDeleteCurrentRecord = async () => {
    if (!selectedEmployee) return;
    if (!window.confirm(`Are you sure you want to permanently delete employee '${selectedEmployee.full_name}'?`)) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/employees/${selectedEmployee.id}`, {
        method: 'DELETE',
        headers: getHeaders(false),
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Employee record '${selectedEmployee.full_name}' deleted successfully.`,
        });
        setSelectedEmployee(null);
        setViewMode('list');
        setIsDirty(false);
        await fetchEmployees();
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          text: err.detail || 'Failed to delete employee record.',
        });
      }
    } catch (e) {
      setFeedback({
        type: 'error',
        text: 'Network error deleting employee record.',
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleBulkAction = (action) => {
    if (action === 'export') {
      handleExportCsv();
    } else if (action === 'delete') {
      if (viewMode === 'form' && selectedEmployee) {
        handleDeleteCurrentRecord();
      }
    }
  };

  // Save handler called by EmployeeFormView
  const handleSave = async (formData) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const isEditing = Boolean(selectedEmployee && selectedEmployee.id);
      const url = isEditing
        ? `/api/v1/employees/${selectedEmployee.id}`
        : '/api/v1/employees';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(true),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save employee profile');
      }

      const savedData = await res.json();
      setFeedback({
        type: 'success',
        text: isEditing
          ? `Employee profile for ${savedData.full_name || 'employee'} updated and audited successfully.`
          : `New employee ${savedData.full_name || ''} created successfully with AES-256 vault initialized.`,
      });
      setIsDirty(false);
      await fetchEmployees();
      setViewMode('list');
      setSelectedEmployee(null);
      onBackToList?.();

      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Error occurred while saving employee.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Standard ControlPanel Container (Odoo-Style Generic View Shell) */}
      <ControlPanel
        schema={employeeSchema}
        currentView={viewMode}
        onViewChange={handleViewChange}
        breadcrumbs={breadcrumbs}
        activeRecordPill={activeRecordPill}
        pager={pager}
        selectedCount={selectedEmployee ? 1 : 0}
        isDirty={isDirty}
        onNew={handleNewEmployee}
        onSave={handleControlPanelSave}
        onDiscard={handleControlPanelDiscard}
        onBulkAction={handleBulkAction}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4">
        {/* Toast Feedback */}
        {feedback && (
          <div
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-xs font-medium animate-fadeIn ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
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

        {/* View Mode Switching: Directory List vs Form View */}
        {viewMode === 'list' ? (
          <EmployeeListView
            employees={filteredEmployees}
            isLoading={isLoading}
            onSelectEmployee={handleSelectEmployee}
            onNewEmployee={handleNewEmployee}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            showHeader={false}
          />
        ) : (
          <EmployeeFormView
            ref={formRef}
            employee={selectedEmployee}
            isSaving={isSaving}
            onSave={handleSave}
            onBack={handleBack}
            onDirtyChange={setIsDirty}
            showHeader={false}
          />
        )}
      </div>
    </div>
  );
}

export default EmployeesView;
