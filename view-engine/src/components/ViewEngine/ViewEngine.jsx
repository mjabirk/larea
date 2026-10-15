import React, { useState, useMemo, useEffect } from 'react';
import { ControlPanel } from './ControlPanel';
import { ListView } from './ListView';
import { FormView } from './FormView';
import { GraphView } from './GraphView';
import { CalendarView } from './CalendarView';
import { PivotView } from './PivotView';
import { GanttView } from './GanttView';
import { PrintReportModal } from './PrintReportModal';
import { formatDateTime } from './Widgets';
import { useTenancy } from '../../context/TenancyContext';

export function ViewEngine({ schema, initialData = [], onRecordCreated, onRecordUpdated, onRecordDeleted }) {
  const tenancy = useTenancy();
  const currentUser = tenancy?.currentUser;

  const [currentView, setCurrentView] = useState('list');
  const [records, setRecords] = useState(initialData);
  const [activeRecordId, setActiveRecordId] = useState(initialData[0]?.id || null);
  const [draftRecord, setDraftRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeGroupBy, setActiveGroupBy] = useState('none');
  const [sortConfig, setSortConfig] = useState({ field: 'check_in', direction: 'desc' });
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  // Sync records if initialData updates
  useEffect(() => {
    setRecords(initialData);
  }, [initialData]);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Active record in Form view
  const currentRecord = useMemo(() => {
    return records.find((r) => r.id === activeRecordId) || records[0] || null;
  }, [records, activeRecordId]);

  const openFormView = (record) => {
    setActiveRecordId(record.id);
    setDraftRecord({ ...record });
    setIsDirty(false);
    setCurrentView('form');
  };

  // Sort handler
  const handleSort = (field) => {
    setSortConfig((prev) => {
      if (prev?.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
  };

  // Delete single record
  const handleDeleteRecord = (id) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (tenancy?.deleteAttendanceRecord) {
      tenancy.deleteAttendanceRecord(id);
    }
    if (onRecordDeleted) {
      onRecordDeleted(id);
    }
    showNotification('Attendance record removed', 'warning');
    if (activeRecordId === id) {
      setCurrentView('list');
    }
  };

  // Filtered & Sorted records (real-time filtering by employee name, terminal ID, and status)
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Search query matching employee name, terminal ID, and status (Draft, Verified, Synced)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((r) => {
        const emp = (r.employee_name || '').toLowerCase();
        const dept = (r.department || '').toLowerCase();
        const term = (r.terminal_id || '').toLowerCase();
        const code = (r.code || '').toLowerCase();
        const status = (r.status || '').toLowerCase();
        const statusLabel =
          status === 'synced' ? 'synced to payroll synced' :
          status === 'verified' ? 'verified' :
          status === 'draft' ? 'draft to approve' : '';

        return (
          emp.includes(q) ||
          term.includes(q) ||
          status.includes(q) ||
          statusLabel.includes(q) ||
          dept.includes(q) ||
          code.includes(q)
        );
      });
    }

    // Filter chip: All, Draft, Verified, Synced
    if (activeFilter !== 'all') {
      result = result.filter((r) => (r.status || '').toLowerCase() === activeFilter.toLowerCase());
    }

    // Sorting
    if (sortConfig?.field) {
      result.sort((a, b) => {
        const valA = a[sortConfig.field];
        const valB = b[sortConfig.field];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        const comp = valA > valB ? 1 : -1;
        return sortConfig.direction === 'asc' ? comp : -comp;
      });
    }

    return result;
  }, [records, searchTerm, activeFilter, sortConfig]);

  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map((r) => r.id));
    }
  };

  // New Record
  const handleNew = () => {
    const newId = records.length > 0 ? Math.max(...records.map((r) => r.id), 0) + 1 : 101;
    const now = new Date();
    const nowIso = now.toISOString();
    const newRecord = {
      id: newId,
      code: `ATT-2026-${newId}`,
      employee_name: currentUser?.full_name || 'Staff Member',
      department: currentUser?.department || 'Operations',
      terminal_id: 'Terminal #01 (Main Lobby Gate)',
      check_in: nowIso,
      check_out: null,
      duration_hours: 0,
      status: 'draft',
      notes: 'New attendance entry initialized.',
      machine_ip: '127.0.0.1',
      ingestion_source: 'Manual HR Entry',
      ingestion_time: formatDateTime(nowIso),
      last_modified_by: currentUser?.full_name || 'Administrator',
    };
    setRecords((prev) => [newRecord, ...prev]);
    if (tenancy?.addAttendanceRecord) {
      tenancy.addAttendanceRecord(newRecord);
    }
    if (onRecordCreated) {
      onRecordCreated(newRecord);
    }
    openFormView(newRecord);
    showNotification('New attendance record created');
  };

  // Save changes from Form
  const handleSave = () => {
    if (!draftRecord) return;
    setRecords((prev) =>
      prev.map((r) => (r.id === draftRecord.id ? draftRecord : r))
    );
    if (tenancy?.updateAttendanceRecord) {
      tenancy.updateAttendanceRecord(draftRecord.id, draftRecord);
    }
    setIsDirty(false);
    showNotification('Changes saved successfully');
  };

  // Discard changes
  const handleDiscard = () => {
    if (currentRecord) {
      setDraftRecord({ ...currentRecord });
      setIsDirty(false);
    }
  };

  // Bulk actions
  const handleBulkAction = (action) => {
    if (action === 'delete') {
      setRecords((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
      showNotification(`${selectedIds.length} records deleted`, 'warning');
      setSelectedIds([]);
      if (selectedIds.includes(activeRecordId)) {
        setCurrentView('list');
      }
    } else if (action === 'export') {
      const headers = ['Record Code', 'Employee', 'Department', 'Check In', 'Check Out', 'Hours', 'Status', 'Terminal'];
      const rows = filteredRecords.map((r) => [
        r.code || `ATT-${r.id}`,
        `"${r.employee_name}"`,
        `"${r.department}"`,
        r.check_in,
        r.check_out || '',
        r.duration_hours || 0,
        r.status,
        `"${r.terminal_id || ''}"`,
      ]);
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const uri = encodeURI(csv);
      const link = document.createElement('a');
      link.setAttribute('href', uri);
      link.setAttribute('download', 'attendance_roster_export.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification('Exported records to CSV');
    }
  };

  // Breadcrumbs builder
  const breadcrumbs = useMemo(() => {
    return [{ label: 'Attendances', onClick: () => setCurrentView('list') }];
  }, []);

  const activeRecordPill = currentView === 'form'
    ? draftRecord?.code || currentRecord?.code || `ATT-${activeRecordId}`
    : null;

  // Pager builder
  const pager = useMemo(() => {
    if (currentView !== 'form') {
      return {
        label: `1-${filteredRecords.length} of ${filteredRecords.length}`,
        canPrev: false,
        canNext: false,
        onPrev: () => {},
        onNext: () => {},
      };
    }

    const currentIndex = filteredRecords.findIndex(
      (r) => r.id === (draftRecord?.id || currentRecord?.id)
    );
    const hasCurrent = currentIndex >= 0;
    const canPrev = hasCurrent && currentIndex > 0;
    const canNext = hasCurrent && currentIndex < filteredRecords.length - 1;

    return {
      label: `${hasCurrent ? currentIndex + 1 : 1} of ${filteredRecords.length}`,
      canPrev,
      canNext,
      onPrev: () => {
        if (canPrev) {
          const prevRec = filteredRecords[currentIndex - 1];
          setActiveRecordId(prevRec.id);
          setDraftRecord({ ...prevRec });
          setIsDirty(false);
        }
      },
      onNext: () => {
        if (canNext) {
          const nextRec = filteredRecords[currentIndex + 1];
          setActiveRecordId(nextRec.id);
          setDraftRecord({ ...nextRec });
          setIsDirty(false);
        }
      },
    };
  }, [currentView, filteredRecords, draftRecord, currentRecord]);

  return (
    <div className="flex-1 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs text-white font-semibold flex items-center gap-2 animate-fadeIn ${
            notification.type === 'warning' ? 'bg-amber-600' : 'bg-slate-900'
          }`}
        >
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Print Slip / Executive Report Modal */}
      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        schema={schema}
        records={filteredRecords}
      />

      {/* Consolidated 56px Action Bar */}
      <ControlPanel
        schema={schema}
        currentView={currentView}
        onViewChange={(v) => {
          if (v === 'form' && !draftRecord && currentRecord) {
            setDraftRecord({ ...currentRecord });
          }
          setCurrentView(v);
        }}
        breadcrumbs={breadcrumbs}
        activeRecordPill={activeRecordPill}
        pager={pager}
        selectedCount={selectedIds.length}
        isDirty={isDirty}
        onNew={handleNew}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onPrintReports={() => setIsPrintModalOpen(true)}
        onBulkAction={handleBulkAction}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

      {/* Main Dynamic Viewport */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {currentView === 'list' && (
          <ListView
            schema={schema}
            records={filteredRecords}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onRecordClick={openFormView}
            onDeleteRecord={handleDeleteRecord}
            sortConfig={sortConfig}
            onSort={handleSort}
            activeGroupBy={activeGroupBy}
          />
        )}

        {currentView === 'form' && (
          <FormView
            schema={schema}
            record={draftRecord || currentRecord}
            onChangeRecord={(updated) => {
              setDraftRecord(updated);
              setIsDirty(true);
            }}
            onFormAction={(actName, rec) => {
              setRecords((prev) =>
                prev.map((r) => (r.id === rec.id ? rec : r))
              );
              showNotification(`Status updated: ${rec.status}`);
            }}
          />
        )}

        {currentView === 'graph' && (
          <GraphView schema={schema} records={filteredRecords} />
        )}

        {currentView === 'calendar' && (
          <CalendarView
            schema={schema}
            records={filteredRecords}
            onRecordClick={openFormView}
          />
        )}

        {currentView === 'pivot' && (
          <PivotView schema={schema} records={filteredRecords} />
        )}

        {currentView === 'gantt' && (
          <GanttView
            schema={schema}
            records={filteredRecords}
            onRecordClick={openFormView}
          />
        )}
      </main>
    </div>
  );
}
