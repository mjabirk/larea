import React from 'react';
import {
  ChevronUp,
  ChevronDown,
  Clock,
  Edit2,
  Trash2,
  Layers,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

export function StatusBadge({ status }) {
  const { t } = useLocale();

  let style = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  let dot = 'bg-slate-500';

  const normalized = String(status || '').toLowerCase();
  let label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

  if (normalized === 'present') {
    style = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    dot = 'bg-emerald-500';
    label = 'Present';
  } else if (normalized === 'synced' || normalized === 'synced to payroll') {
    style = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    dot = 'bg-emerald-500';
    label = t('synced') || 'Synced';
  } else if (normalized === 'verified') {
    style = 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
    dot = 'bg-blue-500';
    label = t('verified') || 'Verified';
  } else if (normalized === 'draft') {
    style = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
    dot = 'bg-amber-500';
    label = t('draft') || 'Draft';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ListView({
  records = [],
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onRecordClick,
  onDeleteRecord,
  sortConfig,
  onSort,
  activeGroupBy,
}) {
  const { t } = useLocale();
  const allSelected = records.length > 0 && selectedIds.length === records.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < records.length;

  const totalDuration = records.reduce((acc, r) => acc + (Number(r.duration_hours) || 0), 0);

  let groupedData = null;
  if (activeGroupBy && activeGroupBy !== 'none') {
    groupedData = {};
    records.forEach((r) => {
      const k = r[activeGroupBy] || 'Unassigned';
      if (!groupedData[k]) groupedData[k] = [];
      groupedData[k].push(r);
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden animate-fadeIn">
      <div className="overflow-x-auto">
        <table className="w-full text-left rtl:text-right border-collapse">
          <thead className="bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
            <tr className="h-11 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wide">
              <th className="py-2.5 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all records"
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>

              <th
                onClick={() => onSort && onSort('employee_name')}
                className="py-2.5 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('employee') || 'Employee'}</span>
                  {sortConfig?.field === 'employee_name' && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              <th
                onClick={() => onSort && onSort('department')}
                className="py-2.5 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('department') || 'Department'}</span>
                  {sortConfig?.field === 'department' && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              <th
                onClick={() => onSort && onSort('check_in')}
                className="py-2.5 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('check_in_shift') || 'Check-In'}</span>
                  {sortConfig?.field === 'check_in' && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              <th
                onClick={() => onSort && onSort('duration_hours')}
                className="py-2.5 px-4 text-right rtl:text-left cursor-pointer hover:text-slate-800 dark:hover:text-slate-100 select-none transition w-32"
              >
                <div className="flex items-center justify-end rtl:justify-start gap-1">
                  <span>{t('hours_worked') || 'Hours'}</span>
                  {sortConfig?.field === 'duration_hours' && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              <th className="py-2.5 px-4 text-left rtl:text-right w-32">{t('status_label') || 'Status'}</th>
              <th className="py-2.5 px-4 text-right rtl:text-left w-20"></th>
            </tr>
          </thead>

          <tbody className="text-sm text-slate-700 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-800/80">
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Clock className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <div className="font-medium text-slate-500 dark:text-slate-400 text-sm">{t('no_records_found') || 'No records found'}</div>
                </td>
              </tr>
            ) : groupedData ? (
              Object.entries(groupedData).map(([groupKey, groupRecords]) => {
                const groupHours = groupRecords.reduce(
                  (acc, r) => acc + (Number(r.duration_hours) || 0),
                  0
                );
                return (
                  <React.Fragment key={groupKey}>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      <td colSpan={7} className="py-2.5 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span>{groupKey}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs">
                              {groupRecords.length}
                            </span>
                          </div>
                          <div className="tabular-nums text-slate-600 dark:text-slate-300 text-sm">
                            {t('subtotal') || 'Subtotal'}: <strong className="text-slate-900 dark:text-white">{groupHours.toFixed(1)} {t('hrs') || 'hrs'}</strong>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {groupRecords.map((record) => (
                      <RowItem
                        key={record.id}
                        record={record}
                        isSelected={selectedIds.includes(record.id)}
                        onToggleSelect={onToggleSelect}
                        onRecordClick={onRecordClick}
                        onDeleteRecord={onDeleteRecord}
                      />
                    ))}
                  </React.Fragment>
                );
              })
            ) : (
              records.map((record) => (
                <RowItem
                  key={record.id}
                  record={record}
                  isSelected={selectedIds.includes(record.id)}
                  onToggleSelect={onToggleSelect}
                  onRecordClick={onRecordClick}
                  onDeleteRecord={onDeleteRecord}
                />
              ))
            )}
          </tbody>

          {records.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm">
                <td className="py-2.5 px-4 w-10"></td>
                <td className="py-2.5 px-4 font-semibold tabular-nums">
                  {records.length} {t('records_count') || 'records'}
                </td>
                <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                  {new Set(records.map((r) => r.department).filter(Boolean)).size} {t('departments') || 'departments'}
                </td>
                <td className="py-2.5 px-4"></td>
                <td className="py-2.5 px-4 text-right rtl:text-left tabular-nums font-bold text-slate-900 dark:text-white w-32">
                  {totalDuration.toFixed(1)} {t('hrs') || 'hrs'}
                </td>
                <td className="py-2.5 px-4 w-32"></td>
                <td className="py-2.5 px-4 w-20"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function RowItem({
  record,
  isSelected,
  onToggleSelect,
  onRecordClick,
  onDeleteRecord,
}) {
  const { formatDate, timeFormat, language, t } = useLocale();

  let dateFormatted = '—';
  let timeFormatted = '';
  const dtRaw = record.start_time || record.check_in;
  if (dtRaw) {
    try {
      dateFormatted = formatDate(dtRaw);
      const d = new Date(dtRaw);
      if (!isNaN(d.getTime())) {
        if (timeFormat === '24h') {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          timeFormatted = `${hh}:${mm}`;
        } else {
          timeFormatted = d.toLocaleTimeString(language === 'ar' ? 'ar-QA' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        }
      }
    } catch {
      dateFormatted = dtRaw;
    }
  }

  return (
    <tr
      onClick={() => onRecordClick(record)}
      className={`group h-12 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none ${
        isSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''
      }`}
    >
      <td
        className="py-2.5 px-4 text-center w-10"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(record.id)}
          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </td>

      <td className="py-2.5 px-4">
        <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[240px] block">
          {record.employee_name}
        </span>
      </td>

      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 truncate max-w-[180px]">
        {record.department || 'General'}
      </td>

      <td className="py-2.5 px-4 tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
        {dateFormatted} <span className="text-slate-400 dark:text-slate-500 ml-1">{timeFormatted}</span>
      </td>

      <td className="py-2.5 px-4 text-right rtl:text-left tabular-nums font-semibold text-slate-900 dark:text-white w-32">
        {record.duration_hours ? `${Number(record.duration_hours).toFixed(1)} ${t('hrs') || 'hrs'}` : `0.0 ${t('hrs') || 'hrs'}`}
      </td>

      <td className="py-2.5 px-4 w-32">
        <StatusBadge status={record.status} />
      </td>

      <td
        className="py-2.5 px-4 text-right rtl:text-left w-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end rtl:justify-start gap-1">
          <button
            type="button"
            onClick={() => onRecordClick(record)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
            title={t('quick_edit') || 'Edit'}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteRecord && onDeleteRecord(record.id)}
            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
            title={t('delete') || 'Delete'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
