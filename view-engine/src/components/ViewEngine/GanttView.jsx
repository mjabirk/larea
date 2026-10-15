import React, { useMemo } from 'react';
import { GanttChart, User } from 'lucide-react';

const STATUS_COLOR = {
  synced: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  verified: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  draft: 'bg-amber-600 hover:bg-amber-500 text-white',
};

export function GanttView({ schema, records = [], onRecordClick }) {
  const ganttDef = schema?.views?.gantt || {
    date_start: 'check_in',
    date_stop: 'check_out',
    title: 'employee_name',
    group_by: 'department',
  };

  const groupByField = ganttDef.group_by || 'department';
  const startField = ganttDef.date_start || 'check_in';
  const titleField = ganttDef.title || 'employee_name';

  // Dynamically calculate active 7-day timeline window based on record dates or system date
  const timelineDates = useMemo(() => {
    let baseDate = new Date();
    if (records && records.length > 0) {
      const dates = records
        .map((r) => r[startField])
        .filter(Boolean)
        .map((dStr) => new Date(dStr))
        .filter((d) => !isNaN(d.getTime()));

      if (dates.length > 0) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        baseDate = new Date(dates[0]);
      }
    }

    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const label = `${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${dd}`;
      days.push({ dateStr, label });
    }
    return days;
  }, [records, startField]);

  const groupedRecords = useMemo(() => {
    const groups = {};
    records.forEach((r) => {
      const gKey = r[groupByField] || 'Unassigned';
      if (!groups[gKey]) groups[gKey] = [];
      groups[gKey].push(r);
    });
    return groups;
  }, [records, groupByField]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5 animate-fadeIn text-slate-900 dark:text-slate-100">
      {/* Gantt Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
            <GanttChart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              Roster & Shift Gantt Timeline
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grouped by <strong className="text-slate-700 dark:text-slate-200">{groupByField}</strong> across scheduled dates
            </p>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-600" />
            <span className="text-slate-600 dark:text-slate-300">Synced</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-600" />
            <span className="text-slate-600 dark:text-slate-300">Verified</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-600" />
            <span className="text-slate-600 dark:text-slate-300">Draft</span>
          </div>
        </div>
      </div>

      {/* Gantt Matrix Chart */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto bg-white dark:bg-slate-900">
        <div className="min-w-[850px]">
          {/* Header row */}
          <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 py-2.5 px-4">
            <div className="col-span-3 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Department / Employee
            </div>
            <div className="col-span-8 grid grid-cols-7 text-center">
              {timelineDates.map((d) => (
                <div key={d.dateStr} className="text-center border-l border-slate-200 dark:border-slate-700 px-1 truncate text-[11px]">
                  {d.label}
                </div>
              ))}
            </div>
            <div className="col-span-1 text-right text-slate-400 dark:text-slate-500">Total</div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Object.entries(groupedRecords).map(([groupName, groupList]) => (
              <div key={groupName} className="py-2">
                {/* Department group label */}
                <div className="px-4 py-1.5 bg-slate-100/60 dark:bg-slate-800/60 text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between border-y border-slate-200/50 dark:border-slate-700/50">
                  <span>{groupName}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                    {groupList.length} scheduled shifts
                  </span>
                </div>

                <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {groupList.map((rec) => {
                    const empName = rec[titleField] || 'Employee';
                    const checkIn = rec[startField];
                    const recDate = checkIn ? checkIn.slice(0, 10) : '';
                    const dateIndex = timelineDates.findIndex((d) => d.dateStr === recDate);
                    const status = rec.status || 'draft';
                    const barColor = STATUS_COLOR[status] || STATUS_COLOR.draft;

                    return (
                      <div
                        key={rec.id}
                        className="grid grid-cols-12 items-center px-4 py-2 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition"
                      >
                        <div
                          className="col-span-3 text-xs font-medium text-slate-800 dark:text-slate-200 truncate pr-2 flex items-center gap-1.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                          onClick={() => onRecordClick && onRecordClick(rec)}
                        >
                          <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{empName}</span>
                        </div>

                        <div className="col-span-8 grid grid-cols-7 h-8 items-center">
                          {timelineDates.map((d, colIdx) => {
                            const isAssignedDay = colIdx === dateIndex;

                            return (
                              <div
                                key={d.dateStr}
                                className="px-1 border-l border-slate-100 dark:border-slate-800 h-8 flex items-center justify-center relative"
                              >
                                {isAssignedDay && (
                                  <button
                                    type="button"
                                    onClick={() => onRecordClick && onRecordClick(rec)}
                                    className={`w-full py-1 px-2 rounded-md text-[11px] font-semibold truncate transition shadow-2xs cursor-pointer flex items-center justify-between ${barColor}`}
                                    title={`${empName} - ${rec.duration_hours || 0} hrs (${status})`}
                                  >
                                    <span className="truncate">{empName}</span>
                                    <span className="font-mono text-[10px] ml-1 shrink-0">
                                      {rec.duration_hours || 0}h
                                    </span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="col-span-1 text-right font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-300 pr-1">
                          {rec.duration_hours ? `${rec.duration_hours}h` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
