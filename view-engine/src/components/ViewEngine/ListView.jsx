import React from 'react';
import {
  ChevronUp,
  ChevronDown,
  Check,
  Clock,
  Edit2,
  Trash2,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

export function StatusBadge({ status }) {
  const { t } = useLocale();

  let style = 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700';
  let dot = 'bg-slate-600 dark:bg-slate-400';
  
  const normalized = String(status || '').toLowerCase();
  let label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

  if (normalized === 'present') {
    style = 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700';
    dot = 'bg-emerald-600 dark:bg-emerald-400';
    label = 'Present';
  } else if (normalized === 'synced' || normalized === 'synced to payroll') {
    style = 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700';
    dot = 'bg-emerald-600 dark:bg-emerald-400';
    label = t('synced') || 'Synced to Payroll';
  } else if (normalized === 'verified') {
    style = 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700';
    dot = 'bg-indigo-600 dark:bg-indigo-400';
    label = t('verified') || 'Verified';
  } else if (normalized === 'draft') {
    style = 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700';
    dot = 'bg-amber-600 dark:bg-amber-400';
    label = t('draft') || 'Draft';
  }

  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-1.5 py-0 rounded text-[10.5px] font-bold ${style}`}
    >
      <span className={`w-1 h-1 rounded-full ${dot}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ListView({
  schema,
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

  // Group records if activeGroupBy is set
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
    <div className="max-h-[calc(100vh-140px)] overflow-y-auto bg-slate-900 rounded-xl border border-slate-800 shadow-2xs animate-fadeIn">
      <div className="overflow-x-auto">
        <table className="w-full text-left rtl:text-right border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 shadow-2xs">
            <tr className="h-8 text-slate-400 font-semibold uppercase text-[11.5px] tracking-wider">
              {/* Checkbox */}
              <th className="py-1 px-2.5 w-8 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all table records"
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>

              {/* Employee (Left-Aligned) */}
              <th
                onClick={() => onSort && onSort('employee_name')}
                className="py-1 px-2.5 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('employee')}</span>
                  {sortConfig?.field === 'employee_name' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              {/* Department (Left-Aligned) */}
              <th
                onClick={() => onSort && onSort('department')}
                className="py-1 px-2.5 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('department')}</span>
                  {sortConfig?.field === 'department' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              {/* Check In Date & Time */}
              <th
                onClick={() => onSort && onSort('check_in')}
                className="py-1 px-2.5 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
              >
                <div className="flex items-center gap-1">
                  <span>{t('check_in_shift')}</span>
                  {sortConfig?.field === 'check_in' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              {/* Hours Worked (Right-Aligned Numeric with Tabular Figures) */}
              <th
                onClick={() => onSort && onSort('duration_hours')}
                className="py-1 px-2.5 text-right rtl:text-left cursor-pointer hover:text-slate-100 select-none transition w-28"
              >
                <div className="flex items-center justify-end rtl:justify-start gap-1">
                  <span>{t('hours_worked')}</span>
                  {sortConfig?.field === 'duration_hours' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              {/* Status Badge */}
              <th className="py-1 px-2.5 text-left rtl:text-right w-28">{t('status_label')}</th>

              {/* Contextual Actions */}
              <th className="py-1 px-2.5 text-right rtl:text-left w-16"></th>
            </tr>
          </thead>

          <tbody className="text-[12.5px] text-slate-200 divide-y divide-slate-800/80">
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  <Clock className="w-6 h-6 mx-auto text-slate-500 mb-1" />
                  <div className="font-medium text-slate-300 text-xs">{t('no_records_found')}</div>
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
                    <tr className="bg-slate-800/80 border-t border-slate-700 text-xs font-semibold text-slate-200 h-8">
                      <td colSpan={7} className="py-1 px-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3 h-3 text-blue-500" />
                            <span className="text-slate-100 font-bold text-xs">{groupKey}</span>
                            <span className="px-1.5 py-0 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10.5px]">
                              {groupRecords.length}
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-slate-300 text-xs">
                            {t('subtotal')}: <strong className="text-slate-100">{groupHours.toFixed(1)} {t('hrs')}</strong>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {groupRecords.map((record) => {
                      const isSelected = selectedIds.includes(record.id);
                      return (
                        <RowItem
                          key={record.id}
                          record={record}
                          isSelected={isSelected}
                          onToggleSelect={onToggleSelect}
                          onRecordClick={onRecordClick}
                          onDeleteRecord={onDeleteRecord}
                        />
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              records.map((record) => {
                const isSelected = selectedIds.includes(record.id);
                return (
                  <RowItem
                    key={record.id}
                    record={record}
                    isSelected={isSelected}
                    onToggleSelect={onToggleSelect}
                    onRecordClick={onRecordClick}
                    onDeleteRecord={onDeleteRecord}
                  />
                );
              })
            )}
          </tbody>

          {/* Table Footer: Column-aligned summary metrics */}
          {records.length > 0 && (
            <tfoot>
              <tr className="bg-slate-900 border-t border-slate-800 text-slate-300 font-semibold text-xs h-8">
                {/* 1. Checkbox column */}
                <td className="py-1 px-2.5 w-8"></td>

                {/* 2. Employee column */}
                <td className="py-1 px-2.5 text-left rtl:text-right font-mono tabular-nums text-slate-300 font-semibold text-xs">
                  {records.length} {t('records_count') || 'records'}
                </td>

                {/* 3. Department column */}
                <td className="py-1 px-2.5 text-left rtl:text-right text-slate-400 font-medium text-xs">
                  {new Set(records.map((r) => r.department).filter(Boolean)).size} {t('departments') || 'Departments'}
                </td>

                {/* 4. Check In / Shift column */}
                <td className="py-1 px-2.5"></td>

                {/* 5. Hours Worked column */}
                <td className="py-1 px-2.5 text-right rtl:text-left font-mono tabular-nums font-bold text-slate-100 text-xs w-28">
                  {totalDuration.toFixed(1)} {t('hrs') || 'hrs'}
                </td>

                {/* 6. Status column */}
                <td className="py-1 px-2.5 w-28"></td>

                {/* 7. Actions column */}
                <td className="py-1 px-2.5 w-16"></td>
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

  // Parse date and time separately using user preferences
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
      className={`group h-8 hover:bg-slate-800/60 odd:bg-slate-900 even:bg-slate-800/40 transition-colors cursor-pointer select-none border-b border-slate-800/60 ${
        isSelected ? 'bg-slate-800/80 ring-1 ring-blue-500/40' : ''
      }`}
    >
      {/* Checkbox */}
      <td
        className="py-1 px-2.5 text-center w-8"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(record.id)}
          className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </td>

      {/* Employee (Single-line, no bulky avatar to preserve 32px row height lock) */}
      <td className="py-1 px-2.5 text-left rtl:text-right">
        <span
          className="font-semibold text-[12.5px] text-slate-100 truncate max-w-[200px] block"
          title={`${record.employee_name}${record.shift_name ? ` • ${record.shift_name}` : ''}${record.terminal_id ? ` • Terminal: ${record.terminal_id}` : ''}`}
        >
          {record.employee_name}
        </span>
      </td>

      {/* Department (Left-Aligned, single line) */}
      <td className="py-1 px-2.5 text-left rtl:text-right text-slate-400 font-medium text-xs truncate max-w-[150px]">
        {record.department || 'General'}
      </td>

      {/* Check In (Single-line monospace date & time) */}
      <td className="py-1 px-2.5 text-left rtl:text-right font-mono text-[12px] text-slate-300 whitespace-nowrap">
        {dateFormatted} {timeFormatted}
      </td>

      {/* Hours Worked (Right-Aligned monospace font-bold) */}
      <td className="py-1 px-2.5 text-right rtl:text-left font-mono tabular-nums font-bold text-slate-100 text-[12px] w-28">
        {record.duration_hours ? `${record.duration_hours.toFixed(1)} ${t('hrs')}` : `0.0 ${t('hrs')}`}
      </td>

      {/* Status Badge (compact 20px) */}
      <td className="py-1 px-2.5 text-left rtl:text-right w-28">
        <StatusBadge status={record.status} />
      </td>

      {/* Contextual Actions on Row Hover */}
      <td
        className="py-1 px-2.5 text-right rtl:text-left w-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="opacity-0 group-hover:opacity-100 transition flex items-center justify-end rtl:justify-start gap-1">
          <button
            type="button"
            onClick={() => onRecordClick(record)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
            title={t('quick_edit')}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteRecord && onDeleteRecord(record.id)}
            className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title={t('delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
