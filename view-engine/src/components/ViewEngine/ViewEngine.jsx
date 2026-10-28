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
import { getUrlParam, syncViewUrlParams, notifyRecordChatterUpdated } from '../../utils/urlState';

const VALID_ENGINE_VIEWS = new Set(['list', 'form', 'graph', 'calendar', 'pivot', 'gantt']);

export function ViewEngine({
  schema,
  initialData = [],
  initialView = null,
  onRecordCreated,
  onRecordUpdated,
  onRecordDeleted,
}) {
  const tenancy = useTenancy();
  const currentUser = tenancy?.currentUser;
  const defaultView = initialView || schema?.default_view || 'list';

  const [currentView, setCurrentView] = useState(() => {
    const urlView = getUrlParam('view');
    if (urlView && VALID_ENGINE_VIEWS.has(urlView)) {
      return urlView;
    }
    return defaultView;
  });
  const [previousView, setPreviousView] = useState(defaultView === 'form' ? 'list' : defaultView);
  const [records, setRecords] = useState(initialData);
  const [pendingRecordId, setPendingRecordId] = useState(() => {
    const urlView = getUrlParam('view');
    return urlView === 'form' ? (getUrlParam('id') || null) : null;
  });
  const [activeRecordId, setActiveRecordId] = useState(() => {
    const urlView = getUrlParam('view');
    const urlId = getUrlParam('id');
    if (urlView === 'form' && urlId && urlId !== 'new') return urlId;
    return initialData[0]?.id || null;
  });
  const [draftRecord, setDraftRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeGroupBy, setActiveGroupBy] = useState('none');
  const [sortConfig, setSortConfig] = useState({ field: 'check_in', direction: 'desc' });
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter, currentView, pageSize]);

  // Sync records if initialData updates or tenant switches
  useEffect(() => {
    setRecords(initialData);
  }, [initialData, tenancy?.tenantEpoch]);

  // Hydrate pendingRecordId from URL on browser reload once records load
  useEffect(() => {
    if (!pendingRecordId) return;
    if (pendingRecordId === 'new') {
      setPendingRecordId(null);
      handleNew();
      return;
    }
    if (records.length > 0) {
      const found = records.find((r) => String(r.id) === String(pendingRecordId));
      if (found) {
        setActiveRecordId(found.id);
        setDraftRecord({ ...found });
      }
      setPendingRecordId(null);
    }
  }, [pendingRecordId, records]);

  // Keep URL synchronized with current ViewEngine view & record ID
  useEffect(() => {
    const isDefault = currentView === defaultView;
    const isNewDraft = Boolean(draftRecord?.isNew || String(draftRecord?.id || '').startsWith('temp-'));
    const effectiveId =
      currentView === 'form'
        ? (pendingRecordId || (isNewDraft ? 'new' : (draftRecord?.id || activeRecordId || null)))
        : null;
    syncViewUrlParams({
      view: isDefault ? null : currentView,
      id: effectiveId ? String(effectiveId) : null,
    });
  }, [currentView, defaultView, draftRecord, activeRecordId, pendingRecordId]);

  // Notify operational form state to hide compliance footer when in form mode
  useEffect(() => {
    const isForm = currentView === 'form';
    window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: isForm } }));
    return () => {
      if (isForm) {
        window.dispatchEvent(new CustomEvent('larea-operational-form', { detail: { active: false } }));
      }
    };
  }, [currentView]);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Active record in Form view
  const currentRecord = useMemo(() => {
    return records.find((r) => r.id === activeRecordId) || records[0] || null;
  }, [records, activeRecordId]);

  const openFormView = (record) => {
    if (currentView !== 'form') {
      setPreviousView(currentView);
    }
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
    if (schema?.model !== 'shift_rosters' && tenancy?.deleteAttendanceRecord) {
      tenancy.deleteAttendanceRecord(id);
    }
    if (onRecordDeleted) {
      onRecordDeleted(id);
    }
    showNotification('Record removed', 'warning');
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
        const shift = (r.shift_name || '').toLowerCase();
        const loc = (r.location || '').toLowerCase();
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
          code.includes(q) ||
          shift.includes(q) ||
          loc.includes(q)
        );
      });
    }

    // Filter chip: All, Draft, Verified, Synced, Published, Confirmed
    if (activeFilter !== 'all') {
      const q = activeFilter.toLowerCase();
      result = result.filter((r) => {
        const s = (r.status || '').toLowerCase();
        if (q === 'confirmed') return s === 'confirmed' || s === 'synced';
        if (q === 'published') return s === 'published' || s === 'verified';
        if (q === 'verified') return s === 'verified' || s === 'published';
        if (q === 'synced') return s === 'synced' || s === 'confirmed';
        return s === q;
      });
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

  // New Record / Shift Assignment
  const handleNew = () => {
    if (currentView !== 'form') {
      setPreviousView(currentView);
    }

    const isRoster = schema?.model === 'shift_rosters' || schema?.title?.toLowerCase().includes('roster');
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const nowIso = now.toISOString();

    if (isRoster) {
      const endDefault = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();
      const newRecord = {
        id: `temp-${Date.now()}`,
        code: `ROS-${currentYear}-DRAFT`,
        isNew: true,
        employee_id: null,
        employeeId: null,
        employee_name: '',
        employeeName: '',
        department: 'Operations',
        shift_name: 'Morning Shift (08:00 - 16:00)',
        start_time: nowIso,
        end_time: endDefault,
        check_in: nowIso,
        check_out: endDefault,
        duration_hours: 8.0,
        location: 'Doha Head Office',
        status: 'scheduled',
        notes: '',
      };
      setActiveRecordId(newRecord.id);
      setDraftRecord({ ...newRecord });
      setIsDirty(false);
      setCurrentView('form');
      return;
    }

    // Correctly parse sequence counter to prevent ATT-2026-NaN
    let maxSeq = 0;
    records.forEach((r) => {
      if (r.code && typeof r.code === 'string') {
        const match = r.code.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      if (typeof r.id === 'number' && !isNaN(r.id) && r.id > maxSeq && r.id < 100000) {
        maxSeq = r.id;
      } else if (typeof r.id === 'string') {
        const match = r.id.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq && num < 100000) maxSeq = num;
        }
      }
    });

    const nextSeq = (maxSeq > 0 ? maxSeq : records.length) + 1;
    const formattedCode = `ATT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
    const newId = nextSeq;

    const newRecord = {
      id: newId,
      code: formattedCode,
      isNew: true,
      employee_id: null,
      employeeId: null,
      employee_name: '',
      employeeName: '',
      department: '',
      terminal_id: 'Terminal #01 (Main Lobby Gate)',
      check_in: nowIso,
      check_out: null,
      duration_hours: 8,
      status: 'draft',
      notes: '',
      machine_ip: '127.0.0.1',
      ingestion_source: 'Manual HR Entry',
      ingestion_time: formatDateTime(nowIso),
      last_modified_by: currentUser?.full_name || 'Administrator',
    };

    setActiveRecordId(newId);
    setDraftRecord({ ...newRecord });
    setIsDirty(false);
    setCurrentView('form');
  };

  // Save changes from Form
  const handleSave = async () => {
    if (!draftRecord) return;
    const exists = records.some((r) => r.id === draftRecord.id);
    let savedRecord = { ...draftRecord };
    let updatedRecords;

    if (exists) {
      if (schema?.model !== 'shift_rosters' && tenancy?.updateAttendanceRecord) {
        const res = await tenancy.updateAttendanceRecord(draftRecord.id, draftRecord);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          savedRecord = { ...savedRecord, ...res };
        }
      }
      if (onRecordUpdated) {
        const res = await onRecordUpdated(savedRecord);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          savedRecord = { ...savedRecord, ...res };
        }
      }
      setIsDirty(false);
      setDraftRecord(savedRecord);
      updatedRecords = records.map((r) => (r.id === savedRecord.id ? savedRecord : r));
    } else {
      if (schema?.model !== 'shift_rosters' && tenancy?.addAttendanceRecord) {
        const res = await tenancy.addAttendanceRecord(draftRecord);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          savedRecord = { ...savedRecord, ...res };
        }
      }
      if (onRecordCreated) {
        const res = await onRecordCreated(savedRecord);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          savedRecord = { ...savedRecord, ...res };
        }
      }
      setIsDirty(false);
      savedRecord = { ...savedRecord, isNew: false };
      setActiveRecordId(savedRecord.id);
      setDraftRecord(savedRecord);
      updatedRecords = [savedRecord, ...records];
    }
    setRecords(updatedRecords);
    const isRosterModel = schema?.model === 'shift_rosters' || schema?.title?.toLowerCase().includes('roster');
    if (savedRecord?.id) {
      notifyRecordChatterUpdated(savedRecord.id, isRosterModel ? 'shift_rosters' : 'attendance_logs');
    }
    showNotification('Changes saved');
  };

  // Form actions (SOX 404 dual-control submit, approve, reject)
  const handleFormAction = async (actName, rec) => {
    const isRosterModel = schema?.model === 'shift_rosters' || schema?.title?.toLowerCase().includes('roster');
    const entityType = isRosterModel ? 'shift_rosters' : 'attendance_logs';
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token'))
      : null;
    const headers = token
      ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };

    if (actName === 'submit' || actName === 'btn_submit') {
      try {
        const res = await fetch(`/api/v1/attendance/${rec.id}/submit`, {
          method: 'POST',
          headers,
        });
        if (res.ok) {
          const updated = await res.json();
          setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setDraftRecord(updated);
          notifyRecordChatterUpdated(updated.id, entityType);
          showNotification('Submitted for approval.');
          return;
        } else {
          const err = await res.json().catch(() => ({}));
          showNotification(err.detail || 'Failed to submit record for approval', 'warning');
        }
      } catch (e) {
        console.warn('Fallback local transition for submit:', e);
      }
    } else if (actName === 'approve' || actName === 'btn_verify') {
      try {
        const res = await fetch(`/api/v1/attendance/${rec.id}/approve`, {
          method: 'POST',
          headers,
        });
        if (res.ok) {
          const updated = await res.json();
          setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setDraftRecord(updated);
          notifyRecordChatterUpdated(updated.id, entityType);
          showNotification('Record approved.');
          return;
        } else {
          const err = await res.json().catch(() => ({}));
          const errMsg = err.detail || 'Approval rejected by dual-control policy.';
          showNotification(errMsg, 'warning');
          return;
        }
      } catch (e) {
        console.warn('Fallback local transition for approve:', e);
      }
    } else if (actName === 'reject' || actName === 'btn_reject') {
      try {
        const res = await fetch(`/api/v1/attendance/${rec.id}/reject`, {
          method: 'POST',
          headers,
        });
        if (res.ok) {
          const updated = await res.json();
          setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setDraftRecord(updated);
          notifyRecordChatterUpdated(updated.id, entityType);
          showNotification('Record rejected.', 'warning');
          return;
        } else {
          const err = await res.json().catch(() => ({}));
          showNotification(err.detail || 'Failed to reject record', 'warning');
        }
      } catch (e) {
        console.warn('Fallback local transition for reject:', e);
      }
    }

    // Default state update for other transitions (e.g. sync, reset)
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? rec : r)));
    setDraftRecord(rec);
    if (tenancy?.updateAttendanceRecord) {
      await tenancy.updateAttendanceRecord(rec.id, rec);
    }
    if (onRecordUpdated) {
      await onRecordUpdated(rec);
    }
    if (rec?.id) {
      notifyRecordChatterUpdated(rec.id, entityType);
    }
    showNotification(`Status updated: ${rec.status}`);
  };

  // Discard changes and return smoothly to previously active view
  const handleDiscard = () => {
    setIsDirty(false);
    setDraftRecord(null);
    setCurrentView(previousView || initialView || schema?.default_view || 'list');
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

  const parentTitle = schema?.title?.includes('Roster') || initialView === 'gantt'
    ? 'Shift Rosters'
    : 'Attendances';

  const returnTargetView = previousView || initialView || schema?.default_view || 'list';

  // Breadcrumbs builder with clickable return navigation
  const breadcrumbs = useMemo(() => {
    if (currentView === 'form') {
      const isNew = draftRecord?.isNew || !draftRecord?.id;
      const recordLabel = isNew
        ? (schema?.title?.includes('Roster') || initialView === 'gantt' ? 'New Shift' : 'New Attendance')
        : (draftRecord?.code && !draftRecord.code.includes('NaN') ? draftRecord.code : `Record #${draftRecord?.id || ''}`);

      return [
        {
          label: `← ${parentTitle}`,
          onClick: () => {
            if (isDirty && !window.confirm('You have unsaved changes. Discard and return to list?')) {
              return;
            }
            setIsDirty(false);
            setDraftRecord(null);
            setCurrentView(returnTargetView);
          },
        },
        {
          label: recordLabel,
          onClick: null,
        },
      ];
    }

    return [
      {
        label: parentTitle,
        onClick: () => setCurrentView(initialView || schema?.default_view || 'list'),
      },
    ];
  }, [currentView, parentTitle, returnTargetView, draftRecord, initialView, schema?.default_view]);

  const activeRecordPill = currentView === 'form'
    ? draftRecord?.code || currentRecord?.code || `ATT-${activeRecordId}`
    : null;

  const paginatedRecords = useMemo(() => {
    if (currentView !== 'list') return filteredRecords;
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, currentView, pageSize]);

  // Pager builder
  const pager = useMemo(() => {
    if (currentView !== 'form') {
      const total = filteredRecords.length;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, total);
      return {
        label: `${start}-${end} / ${total}`,
        page: currentPage,
        totalPages,
        total,
        pageSize,
        start,
        end,
        onPageSizeChange: (newSize) => {
          setPageSize(Number(newSize));
          setCurrentPage(1);
        },
        canPrev: currentPage > 1,
        canNext: currentPage * pageSize < total,
        onPrev: () => setCurrentPage((p) => Math.max(1, p - 1)),
        onNext: () => setCurrentPage((p) => p + 1),
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
  }, [currentView, filteredRecords, draftRecord, currentRecord, currentPage, pageSize]);

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
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch view?')) {
            return;
          }
          if (currentView !== 'form') {
            setPreviousView(currentView);
          }
          if (v === 'form' && !draftRecord && currentRecord) {
            setDraftRecord({ ...currentRecord });
          } else if (v !== 'form') {
            setDraftRecord(null);
            setIsDirty(false);
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
        pageSize={pageSize}
        onPageSizeChange={(newSize) => {
          setPageSize(Number(newSize));
          setCurrentPage(1);
        }}
        total={filteredRecords.length}
        page={currentPage}
        totalPages={Math.ceil(filteredRecords.length / pageSize) || 1}
        onPageChange={setCurrentPage}
      />

      {/* Main Dynamic Viewport */}
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {currentView === 'list' && (
          <ListView
            schema={schema}
            records={paginatedRecords}
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
          pendingRecordId && pendingRecordId !== 'new' && records.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading record...</span>
            </div>
          ) : (
            <FormView
              schema={schema}
              record={draftRecord || currentRecord}
              onChangeRecord={(updated) => {
                setDraftRecord(updated);
                setIsDirty(true);
              }}
              onFormAction={handleFormAction}
              onBack={() => {
                setIsDirty(false);
                setDraftRecord(null);
                setCurrentView(previousView || 'list');
              }}
              onDirtyChange={setIsDirty}
              isDirty={isDirty}
            />
          )
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
