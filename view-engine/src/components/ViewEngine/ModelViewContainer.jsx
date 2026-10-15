import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ControlPanel } from './ControlPanel';
import { ListView } from './ListView';
import { FormView } from './FormView';
import { GraphView } from './GraphView';
import { CalendarView } from './CalendarView';
import { PivotView } from './PivotView';
import { GanttView } from './GanttView';
import { PrintReportModal } from './PrintReportModal';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * ModelViewContainer - Standard Odoo-Style Enterprise Generic View Shell
 *
 * Provides a declarative, uniform container for any business model
 * (Employees, Contracts, Attendance, Shifts, Assets, Payroll, etc.)
 * encapsulating:
 * - Top ControlPanel (breadcrumbs, active record pill, view toggles, pager, search, filters, actions)
 * - View switching (list, form, graph, calendar, pivot, gantt)
 * - Record pager navigation (1 of N < >)
 * - Dirty state tracking and discard confirmations
 * - Standardized CRUD API synchronization with session bearer token
 */
export function ModelViewContainer({
  schema,
  apiEndpoint,
  initialData = [],
  renderList,
  renderForm,
  renderCustomView,
  onRecordCreated,
  onRecordUpdated,
  onRecordDeleted,
  children,
}) {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  // View state: 'list' | 'form' | 'graph' | 'calendar' | 'pivot' | 'gantt'
  const defaultView = Object.keys(schema?.views || {})[0] || 'list';
  const [currentView, setCurrentView] = useState(defaultView);

  // Data records
  const [records, setRecords] = useState(initialData);
  const [activeRecordId, setActiveRecordId] = useState(null);
  const [draftRecord, setDraftRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Modals & Feedback
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const getHeaders = (hasBody = true) => {
    const headers = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    return headers;
  };

  const showFeedback = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Fetch records from apiEndpoint if provided
  const fetchRecords = useCallback(async () => {
    if (!apiEndpoint) return;
    setIsLoading(true);
    try {
      const res = await fetch(apiEndpoint, { headers: getHeaders(false) });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data)
          ? data
          : data.items || data.records || data[schema?.modelPlural || 'items'] || [];
        setRecords(items);
      }
    } catch (err) {
      console.error(`Error loading records for ${schema?.model}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [apiEndpoint, sessionToken, schema?.model, schema?.modelPlural]);

  useEffect(() => {
    if (apiEndpoint) {
      fetchRecords();
    } else if (initialData && initialData.length > 0) {
      setRecords(initialData);
    }
  }, [apiEndpoint, initialData, fetchRecords]);

  // Active record resolution
  const currentRecord = useMemo(() => {
    if (draftRecord) return draftRecord;
    if (activeRecordId) {
      return records.find((r) => r.id === activeRecordId) || null;
    }
    return records[0] || null;
  }, [records, activeRecordId, draftRecord]);

  // Filtering records based on search and filter chips
  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((r) => {
        return Object.values(r).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    if (activeFilter && activeFilter !== 'all') {
      result = result.filter((r) => {
        const statusVal = r.status || r.state;
        return statusVal && String(statusVal).toLowerCase() === activeFilter.toLowerCase();
      });
    }

    return result;
  }, [records, searchTerm, activeFilter]);

  // Record pager calculation
  const currentIndex = useMemo(() => {
    if (!currentRecord) return -1;
    return filteredRecords.findIndex((r) => r.id === currentRecord.id);
  }, [filteredRecords, currentRecord]);

  const pager = useMemo(() => {
    if (currentView !== 'form' || currentIndex === -1 || filteredRecords.length === 0) {
      return null;
    }
    return {
      label: `${currentIndex + 1} of ${filteredRecords.length}`,
      onPrev: () => {
        if (currentIndex > 0) {
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch record?')) {
            return;
          }
          const prevRec = filteredRecords[currentIndex - 1];
          setActiveRecordId(prevRec.id);
          setDraftRecord({ ...prevRec });
          setIsDirty(false);
        }
      },
      onNext: () => {
        if (currentIndex < filteredRecords.length - 1) {
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch record?')) {
            return;
          }
          const nextRec = filteredRecords[currentIndex + 1];
          setActiveRecordId(nextRec.id);
          setDraftRecord({ ...nextRec });
          setIsDirty(false);
        }
      },
      canPrev: currentIndex > 0,
      canNext: currentIndex < filteredRecords.length - 1,
    };
  }, [currentView, currentIndex, filteredRecords, isDirty]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const root = schema?.breadcrumbRoot || [
      { label: schema?.moduleTitle || 'Enterprise Platform' },
      {
        label: schema?.title || schema?.model || 'Records',
        onClick: () => {
          setCurrentView('list');
          setDraftRecord(null);
          setIsDirty(false);
        },
      },
    ];

    if (currentView === 'list') {
      return root;
    }

    const displayName =
      currentRecord?.[schema?.displayField || 'name'] ||
      currentRecord?.[schema?.codeField || 'code'] ||
      'New Record';

    return [
      ...root,
      {
        label: displayName,
      },
    ];
  }, [schema, currentView, currentRecord]);

  // Active record pill
  const activeRecordPill = useMemo(() => {
    if (currentView === 'list') {
      return `${filteredRecords.length} ${schema?.recordLabel || 'Records'}`;
    }
    const code = currentRecord?.[schema?.codeField || 'code'] || currentRecord?.id;
    return code ? `[${code}]` : '[NEW]';
  }, [currentView, filteredRecords.length, currentRecord, schema]);

  // Handlers for record actions
  const openRecord = (rec) => {
    setActiveRecordId(rec.id);
    setDraftRecord({ ...rec });
    setIsDirty(false);
    setCurrentView('form');
  };

  const handleNewRecord = () => {
    const newDraft = {
      ...(schema?.defaultValues || {}),
      id: undefined,
    };
    setActiveRecordId(null);
    setDraftRecord(newDraft);
    setIsDirty(true);
    setCurrentView('form');
  };

  const handleDiscard = () => {
    if (currentRecord?.id) {
      const orig = records.find((r) => r.id === currentRecord.id);
      setDraftRecord(orig ? { ...orig } : null);
    } else {
      setDraftRecord(null);
      setCurrentView('list');
    }
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!draftRecord) return;
    setIsLoading(true);
    try {
      const isEditing = Boolean(draftRecord.id);
      if (apiEndpoint) {
        const url = isEditing ? `${apiEndpoint}/${draftRecord.id}` : apiEndpoint;
        const method = isEditing ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: getHeaders(true),
          body: JSON.stringify(draftRecord),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Save failed');
        }

        const saved = await res.json();
        showFeedback(
          isEditing ? 'Record updated successfully.' : 'New record created successfully.'
        );
        setIsDirty(false);
        setActiveRecordId(saved.id);
        setDraftRecord({ ...saved });
        await fetchRecords();
        if (isEditing) {
          onRecordUpdated?.(saved);
        } else {
          onRecordCreated?.(saved);
        }
      } else {
        // In-memory fallback
        if (isEditing) {
          setRecords((prev) => prev.map((r) => (r.id === draftRecord.id ? draftRecord : r)));
          onRecordUpdated?.(draftRecord);
        } else {
          const newId = records.length > 0 ? Math.max(...records.map((r) => r.id), 0) + 1 : 1;
          const newRec = { ...draftRecord, id: newId };
          setRecords((prev) => [...prev, newRec]);
          setActiveRecordId(newId);
          onRecordCreated?.(newRec);
        }
        setIsDirty(false);
        showFeedback('Record saved successfully.');
      }
    } catch (err) {
      showFeedback(err.message || 'Error saving record', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRecord = async (idToDelete) => {
    const id = idToDelete || currentRecord?.id;
    if (!id) return;

    if (!window.confirm('Are you sure you want to delete this record?')) {
      return;
    }

    setIsLoading(true);
    try {
      if (apiEndpoint) {
        const res = await fetch(`${apiEndpoint}/${id}`, {
          method: 'DELETE',
          headers: getHeaders(false),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Delete failed');
        }
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      showFeedback('Record deleted.');
      onRecordDeleted?.(id);
      if (currentRecord?.id === id) {
        setDraftRecord(null);
        setActiveRecordId(null);
        setCurrentView('list');
      }
    } catch (err) {
      showFeedback(err.message || 'Error deleting record', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const cols = schema?.columns || Object.keys(filteredRecords[0] || {}).map((k) => ({ key: k, label: k }));
    const headers = cols.map((c) => c.label || c.key);
    const rows = filteredRecords.map((r) =>
      cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`)
    );
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${schema?.model || 'records'}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBulkAction = (action) => {
    if (action === 'export') {
      handleExportCsv();
    } else if (action === 'delete') {
      if (currentView === 'form' && currentRecord?.id) {
        handleDeleteRecord(currentRecord.id);
      } else if (selectedIds.length > 0) {
        if (window.confirm(`Delete ${selectedIds.length} selected record(s)?`)) {
          selectedIds.forEach((id) => handleDeleteRecord(id));
        }
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Standard ControlPanel Navigation Bar */}
      <ControlPanel
        schema={schema}
        currentView={currentView}
        onViewChange={(v) => {
          if (isDirty && !window.confirm('You have unsaved changes. Discard and switch view?')) {
            return;
          }
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
        onNew={handleNewRecord}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onPrintReports={() => setIsPrintModalOpen(true)}
        onBulkAction={handleBulkAction}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
      />

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

      {/* Main Viewport Content */}
      <main className="flex-1">
        {currentView === 'list' && (
          renderList ? (
            renderList({
              records: filteredRecords,
              selectedIds,
              onToggleSelect: (id) =>
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                ),
              onSelectAll: () =>
                setSelectedIds((prev) =>
                  prev.length === filteredRecords.length ? [] : filteredRecords.map((r) => r.id)
                ),
              onRecordClick: openRecord,
              onDeleteRecord: handleDeleteRecord,
              isLoading,
            })
          ) : (
            <ListView
              schema={schema}
              records={filteredRecords}
              selectedIds={selectedIds}
              onToggleSelect={(id) =>
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                ),
              onSelectAll: () =>
                setSelectedIds((prev) =>
                  prev.length === filteredRecords.length ? [] : filteredRecords.map((r) => r.id)
                ),
              onRecordClick: openRecord,
              onDeleteRecord: handleDeleteRecord,
            />
          )
        )}

        {currentView === 'form' && (
          renderForm ? (
            renderForm({
              record: draftRecord || currentRecord,
              onChangeRecord: (updated) => {
                setDraftRecord(updated);
                setIsDirty(true);
              },
              onSave: handleSave,
              onDiscard: handleDiscard,
              isDirty,
              isLoading,
            })
          ) : (
            <FormView
              schema={schema}
              record={draftRecord || currentRecord}
              onChangeRecord={(updated) => {
                setDraftRecord(updated);
                setIsDirty(true);
              }}
            />
          )
        )}

        {currentView === 'graph' && (
          <GraphView schema={schema} records={filteredRecords} />
        )}

        {currentView === 'calendar' && (
          <CalendarView schema={schema} records={filteredRecords} onRecordClick={openRecord} />
        )}

        {currentView === 'pivot' && (
          <PivotView schema={schema} records={filteredRecords} />
        )}

        {currentView === 'gantt' && (
          <GanttView schema={schema} records={filteredRecords} onRecordClick={openRecord} />
        )}

        {renderCustomView && renderCustomView({ currentView, records: filteredRecords, currentRecord })}
        {children}
      </main>

      {/* Print Slip / Report Modal */}
      {isPrintModalOpen && (
        <PrintReportModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          schema={schema}
          records={filteredRecords}
        />
      )}
    </div>
  );
}

export default ModelViewContainer;
