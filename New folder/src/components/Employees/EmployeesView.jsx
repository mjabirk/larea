import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EmployeeListView } from './EmployeeListView';
import { EmployeeFormView } from './EmployeeFormView';
import { ControlPanel } from '../ViewEngine/ControlPanel';
import { DeleteBlockedModal } from '../common/DeleteBlockedModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';

export function EmployeesView({ activeMenuId = 'employees', initialEmployeeId = null, onBackToList }) {
  const auth = useAuth();
  const tenancy = useTenancy();
  const tenantEpoch = tenancy?.tenantEpoch || 0;
  const getAuthHeaders = tenancy?.getAuthHeaders;

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
  const [blockedError, setBlockedError] = useState(null);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);

  // Notify operational form state to hide compliance footer when in form mode
  useEffect(() => {
    const isForm = viewMode === 'form';
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isForm } }));
    return () => {
      if (isForm) {
        window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
      }
    };
  }, [viewMode]);

  // Search & Filter state for ControlPanel
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Form dirty state & reference
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef(null);

  // Unsaved changes beforeunload listener
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const getHeaders = (hasBody = true) => {
    const headers = getAuthHeaders ? getAuthHeaders(sessionToken) : {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const fetchEmployees = useCallback(async (filterOverride) => {
    setIsLoading(true);
    try {
      const currentActive = filterOverride !== undefined ? filterOverride : activeFilter;
      const statusParam = currentActive === 'archived' ? 'archived' : 'active';
      const res = await fetch(`/api/v1/employees?status_filter=${statusParam}`, {
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
  }, [sessionToken, getAuthHeaders, activeFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, tenantEpoch, activeFilter]);

  useEffect(() => {
    const handleTenancySwitch = () => {
      fetchEmployees();
    };
    window.addEventListener('enterprise-tenancy-switched', handleTenancySwitch);
    return () => window.removeEventListener('enterprise-tenancy-switched', handleTenancySwitch);
  }, [fetchEmployees]);

  const prevActiveMenuIdRef = useRef(activeMenuId);

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
  }, [initialEmployeeId, employees]);

  useEffect(() => {
    if (prevActiveMenuIdRef.current !== activeMenuId) {
      prevActiveMenuIdRef.current = activeMenuId;
      if (activeMenuId === 'new_employee') {
        setSelectedEmployee(null);
        setViewMode('form');
        setIsDirty(true);
      } else if (activeMenuId === 'employees' && !initialEmployeeId) {
        setViewMode('list');
        setSelectedEmployee(null);
        setIsDirty(false);
      }
    }
  }, [activeMenuId, initialEmployeeId]);

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

      if (activeFilter !== 'all' && activeFilter !== 'archived') {
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
      { id: 'all', label: 'All (Active)' },
      { id: 'active', label: 'Active' },
      { id: 'on leave', label: 'On Leave' },
      { id: 'terminated', label: 'Terminated' },
      { id: 'archived', label: 'Archived' },
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
          if (isDirty && !window.confirm('You have unsaved changes. Discard and return to list?')) {
            return;
          }
          setViewMode('list');
          setSelectedEmployee(null);
          setIsDirty(false);
          onBackToList?.();
        },
      },
      { label: selectedEmployee?.full_name || 'New Employee Profile' },
    ];
  }, [viewMode, selectedEmployee, onBackToList, isDirty]);

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
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch employee?')) {
            return;
          }
          setSelectedEmployee(filteredEmployees[currentIndex - 1]);
          setIsDirty(false);
        }
      },
      onNext: () => {
        if (currentIndex < filteredEmployees.length - 1) {
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch employee?')) {
            return;
          }
          setSelectedEmployee(filteredEmployees[currentIndex + 1]);
          setIsDirty(false);
        }
      },
      canPrev: currentIndex > 0,
      canNext: currentIndex < filteredEmployees.length - 1,
    };
  }, [viewMode, currentIndex, filteredEmployees, isDirty]);

  const handleSelectEmployee = (emp) => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and open selected employee?')) {
      return;
    }
    setSelectedEmployee(emp);
    setViewMode('form');
    setIsDirty(false);
  };

  const handleNewEmployee = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and create new employee?')) {
      return;
    }
    setSelectedEmployee(null);
    setViewMode('form');
    setIsDirty(true);
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and return to list?')) {
      return;
    }
    setViewMode('list');
    setSelectedEmployee(null);
    setIsDirty(false);
    onBackToList?.();
    fetchEmployees();
  };

  // View switcher toggle
  const handleViewChange = (newView) => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard and switch view?')) {
      return;
    }
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
      } else if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        setBlockedError(err.detail || err);
        setIsBlockedModalOpen(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          text: typeof err.detail === 'string' ? err.detail : 'Failed to delete employee record.',
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

  const handleToggleArchive = async (employeeId = null) => {
    const targetId = employeeId || selectedEmployee?.id;
    if (!targetId) return;

    try {
      const res = await fetch(`/api/v1/employees/${targetId}/toggle-archive`, {
        method: 'POST',
        headers: getHeaders(false),
      });
      if (res.ok) {
        const result = await res.json();
        setFeedback({
          type: 'success',
          text: result.message || (result.is_active ? 'Employee unarchived.' : 'Employee archived.'),
        });
        if (selectedEmployee && selectedEmployee.id === targetId) {
          setSelectedEmployee((prev) => prev ? { ...prev, is_active: result.is_active } : null);
        }
        await fetchEmployees();
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          text: err.detail || 'Failed to update employee archive status.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'Network error updating employee archive status.',
      });
    } finally {
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
    } else if (action === 'archive' || action === 'toggle-archive') {
      if (viewMode === 'form' && selectedEmployee) {
        handleToggleArchive(selectedEmployee.id);
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
      setSelectedEmployee(savedData);
      setViewMode('form');
      setIsDirty(false);
      formRef.current?.resetDirty?.(savedData);
      await fetchEmployees();

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
      {/* Standard Tier 2 Sticky Record Toolbar Container */}
      <ControlPanel
        schema={employeeSchema}
        currentView={viewMode}
        onViewChange={handleViewChange}
        breadcrumbs={breadcrumbs}
        activeRecordPill={activeRecordPill}
        recordTitle={viewMode === 'form' ? (selectedEmployee?.full_name || 'New Employee Profile') : null}
        recordCode={viewMode === 'form' ? (selectedEmployee?.employee_number || 'NEW') : null}
        recordStatus={viewMode === 'form' ? (selectedEmployee?.status || 'Active') : null}
        isArchived={selectedEmployee?.is_active === false}
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
            statusFilter={activeFilter}
            onStatusFilterChange={setActiveFilter}
            showHeader={false}
            embeddedInControlPanel={true}
          />
        ) : (
          <EmployeeFormView
            ref={formRef}
            employee={selectedEmployee}
            isSaving={isSaving}
            onSave={handleSave}
            onBack={handleBack}
            onDirtyChange={setIsDirty}
            onToggleArchive={handleToggleArchive}
            onDelete={handleDeleteCurrentRecord}
            showHeader={false}
          />
        )}
      </div>

      {/* Relational Deletion Blocked Modal */}
      <DeleteBlockedModal
        isOpen={isBlockedModalOpen}
        errorData={blockedError}
        onClose={() => setIsBlockedModalOpen(false)}
        onArchiveInstead={() => {
          setIsBlockedModalOpen(false);
          const targetId = blockedError?.entity_id || selectedEmployee?.id;
          if (targetId) {
            handleToggleArchive(targetId);
          }
        }}
      />
    </div>
  );
}

export default EmployeesView;
