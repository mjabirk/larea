import React, { useMemo } from 'react';
import { GanttChart, User } from 'lucide-react';

const STATUS_COLOR = {
  synced: 'bg-emerald-500 hover:bg-emerald-600',
  verified: 'bg-indigo-500 hover:bg-indigo-600',
  draft: 'bg-amber-500 hover:bg-amber-600',
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

  const timelineDates = [
    { dateStr: '2026-10-06', label: 'Tue Oct 06' },
    { dateStr: '2026-10-07', label: 'Wed Oct 07' },
    { dateStr: '2026-10-08', label: 'Thu Oct 08' },
    { dateStr: '2026-10-09', label: 'Fri Oct 09' },
  ];

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
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5 animate-fadeIn">
      {/* Gantt Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <GanttChart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Roster & Shift Gantt Timeline
            </h3>
            <p className="text-xs text-slate-500">
              Grouped by <strong className="text-slate-700">{groupByField}</strong> across scheduled dates
            </p>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
            <span className="text-slate-600">Synced</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-500" />
            <span className="text-slate-600">Verified</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500" />
            <span className="text-slate-600">Draft</span>
          </div>
        </div>
      </div>

      {/* Gantt Matrix Chart */}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <div className="min-w-[750px]">
          <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 py-2.5 px-4">
            <div className="col-span-3 text-slate-500 uppercase tracking-wider">
              Department / Employee
            </div>
            {timelineDates.map((d) => (
              <div key={d.dateStr} className="col-span-2 text-center border-l border-slate-200">
                {d.label}
              </div>
            ))}
            <div className="col-span-1 text-right text-slate-400">Total</div>
          </div>

          <div className="divide-y divide-slate-100">
            {Object.entries(groupedRecords).map(([groupName, groupList]) => (
              <div key={groupName} className="py-2">
                <div className="px-4 py-1.5 bg-slate-100/50 text-xs font-bold text-slate-900 flex items-center justify-between">
                  <span>{groupName}</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {groupList.length} scheduled shifts
                  </span>
                </div>

                <div className="divide-y divide-slate-50">
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
                        className="grid grid-cols-12 items-center px-4 py-2 hover:bg-slate-50/70 transition"
                      >
                        <div
                          className="col-span-3 text-xs font-medium text-slate-800 truncate pr-2 flex items-center gap-1.5 cursor-pointer hover:text-blue-600"
                          onClick={() => onRecordClick && onRecordClick(rec)}
                        >
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{empName}</span>
                        </div>

                        {timelineDates.map((d, colIdx) => {
                          const isAssignedDay = colIdx === dateIndex;

                          return (
                            <div
                              key={d.dateStr}
                              className="col-span-2 px-1 border-l border-slate-100 h-8 flex items-center justify-center relative"
                            >
                              {isAssignedDay && (
                                <button
                                  type="button"
                                  onClick={() => onRecordClick && onRecordClick(rec)}
                                  className={`w-full py-1 px-2 rounded-md text-white text-[11px] font-semibold truncate transition shadow-2xs cursor-pointer flex items-center justify-between ${barColor}`}
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

                        <div className="col-span-1 text-right font-mono tabular-nums text-xs font-bold text-slate-700 pr-1">
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
