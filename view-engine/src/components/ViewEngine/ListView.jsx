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
  let label = status;

  if (status === 'synced' || status === 'Synced to Payroll') {
    style = 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700';
    dot = 'bg-emerald-600 dark:bg-emerald-400';
    label = t('synced');
  } else if (status === 'verified') {
    style = 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700';
    dot = 'bg-indigo-600 dark:bg-indigo-400';
    label = t('verified');
  } else if (status === 'draft') {
    style = 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700';
    dot = 'bg-amber-600 dark:bg-amber-400';
    label = t('draft');
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${style}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
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
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-2xs overflow-hidden animate-fadeIn">
      <div className="overflow-x-auto">
        <table className="w-full text-left rtl:text-right border-collapse">
          <thead>
            <tr className="text-slate-300 font-semibold tracking-wider uppercase bg-slate-900 border-b border-slate-800 text-xs">
              {/* Checkbox */}
              <th className="py-3 px-3.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all table records"
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </th>

              {/* ID / Code (Right-Aligned Numeric/Pill) */}
              <th
                onClick={() => onSort && onSort('id')}
                className="py-3 px-4 text-right rtl:text-left cursor-pointer hover:text-slate-100 select-none transition w-28"
              >
                <div className="flex items-center justify-end rtl:justify-start gap-1">
                  <span>{t('record_id')}</span>
                  {sortConfig?.field === 'id' && (
                    <span className="text-blue-500">
                      {sortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
              </th>

              {/* Employee (Left-Aligned) */}
              <th
                onClick={() => onSort && onSort('employee_name')}
                className="py-3 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
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
                className="py-3 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
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
                className="py-3 px-4 text-left rtl:text-right cursor-pointer hover:text-slate-100 select-none transition"
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
                className="py-3 px-4 text-right rtl:text-left cursor-pointer hover:text-slate-100 select-none transition w-32"
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
              <th className="py-3 px-4 text-left rtl:text-right w-32">{t('status_label')}</th>

              {/* Contextual Actions (Hover) */}
              <th className="py-3 px-4 text-right rtl:text-left w-24"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800 text-sm">
            {records.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <Clock className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                  <div className="font-medium text-slate-300">{t('no_records_found')}</div>
                  <div className="text-xs text-slate-500">{t('no_records_sub')}</div>
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
                    <tr className="bg-slate-800/80 border-t border-slate-700 text-xs font-semibold text-slate-200">
                      <td colSpan={8} className="py-2.5 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-slate-100 font-bold text-sm">{groupKey}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                              {groupRecords.length}
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-slate-300">
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

          {/* Table Footer */}
          {records.length > 0 && (
            <tfoot>
              <tr className="bg-slate-900 border-t border-slate-800 text-slate-200 font-semibold text-xs">
                <td className="py-3 px-3.5"></td>
                <td className="py-3 px-4 text-right rtl:text-left font-mono tabular-nums text-slate-400">
                  {records.length} {t('records_count')}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-200">
                  {t('total_summary')}
                </td>
                <td className="py-3 px-4 text-slate-400 font-medium">
                  {new Set(records.map((r) => r.department)).size} {t('departments')}
                </td>
                <td className="py-3 px-4"></td>
                {/* Hours Worked Sum */}
                <td className="py-3 px-4 text-right rtl:text-left font-mono tabular-nums font-bold text-slate-100 text-sm">
                  {totalDuration.toFixed(1)} {t('hrs')}
                </td>
                <td colSpan={2} className="py-3 px-4"></td>
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
  if (record.check_in) {
    try {
      dateFormatted = formatDate(record.check_in);
      const d = new Date(record.check_in);
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
      dateFormatted = record.check_in;
    }
  }

  return (
    <tr
      onClick={() => onRecordClick(record)}
      className={`group hover:bg-slate-800/60 transition cursor-pointer select-none border-b border-slate-800/60 ${
        isSelected ? 'bg-slate-800/80 ring-1 ring-blue-500/40' : ''
      }`}
    >
      {/* Checkbox */}
      <td
        className="py-3 px-3.5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(record.id)}
          className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </td>

      {/* ID (Right-Aligned Numeric with font-mono / tabular-nums) */}
      <td className="py-3 px-4 text-right rtl:text-left font-mono text-xs font-semibold text-slate-100 tabular-nums">
        {record.code || `ATT-${record.id}`}
      </td>

      {/* Employee (Left-Aligned) */}
      <td className="py-3 px-4 text-left rtl:text-right">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center ring-1 ring-slate-700 shrink-0">
            {record.employee_name ? record.employee_name.slice(0, 2).toUpperCase() : '??'}
          </div>
          <div>
            <div className="font-bold text-sm text-slate-100 leading-tight">
              {record.employee_name}
            </div>
            {record.terminal_id && (
              <div className="text-[11px] text-slate-400 font-medium truncate max-w-[200px] leading-tight mt-0.5">
                {record.terminal_id}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Department (Left-Aligned) */}
      <td className="py-3 px-4 text-left rtl:text-right text-slate-400 font-medium text-xs">
        {record.department || 'General'}
      </td>

      {/* Check In (Left-Aligned with subtle secondary color for time) */}
      <td className="py-3 px-4 text-left rtl:text-right">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-slate-200">{dateFormatted}</span>
          {timeFormatted && (
            <span className="font-mono text-slate-400 tabular-nums text-[11px]">
              {timeFormatted}
            </span>
          )}
        </div>
      </td>

      {/* Hours Worked (Right-Aligned with tabular figures) */}
      <td className="py-3 px-4 text-right rtl:text-left font-mono tabular-nums font-semibold text-slate-100 text-sm">
        {record.duration_hours ? `${record.duration_hours.toFixed(1)} ${t('hrs')}` : `0.0 ${t('hrs')}`}
      </td>

      {/* Status Badge */}
      <td className="py-3 px-4 text-left rtl:text-right">
        <StatusBadge status={record.status} />
      </td>

      {/* Contextual Actions on Row Hover */}
      <td
        className="py-3 px-4 text-right rtl:text-left"
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
