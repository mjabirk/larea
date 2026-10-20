import React, { useMemo } from 'react';
import { GanttChart, User, Clock, Building2, Plus, Calendar } from 'lucide-react';

const STATUS_COLOR = {
  confirmed: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs',
  synced: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs',
  published: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs',
  verified: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs',
  draft: 'bg-amber-600 hover:bg-amber-500 text-white shadow-2xs',
};

const STATUS_LABEL_MAP = {
  confirmed: 'Confirmed',
  synced: 'Confirmed',
  published: 'Published',
  verified: 'Published',
  draft: 'Draft',
};

function formatShiftTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}

export function GanttView({ schema, records = [], onRecordClick, onNewShift }) {
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
      const dayName = dayNames[d.getDay()];
      const monthName = monthNames[d.getMonth()];
      const label = `${dayName} ${monthName} ${dd}`;
      const isWeekend = d.getDay() === 5 || d.getDay() === 6; // Fri / Sat in Qatar
      days.push({ dateStr, label, dayName, dayNum: dd, monthName, isWeekend });
    }
    return days;
  }, [records, startField]);

  // Group unique employees with all their scheduled shifts
  const groupedDepartments = useMemo(() => {
    // Map: department -> Map of employeeKey -> employeeObj
    const deptMap = new Map();

    records.forEach((r) => {
      const dept = r[groupByField] || r.department || 'Operations';
      const empName = r[titleField] || r.employee_name || 'Unassigned Staff';
      const empKey = r.employee_id ? String(r.employee_id) : empName;

      if (!deptMap.has(dept)) {
        deptMap.set(dept, new Map());
      }
      const empMap = deptMap.get(dept);

      if (!empMap.has(empKey)) {
        empMap.set(empKey, {
          key: empKey,
          id: r.employee_id || null,
          name: empName,
          department: dept,
          role: r.job_title || r.role || (dept === 'Human Resources' ? 'HR Specialist' : 'Operations Specialist'),
          terminalId: r.terminal_id || '',
          shifts: [],
          shiftsByDate: {},
          totalHours: 0,
        });
      }

      const emp = empMap.get(empKey);
      emp.shifts.push(r);
      emp.totalHours += Number(r.duration_hours) || 0;

      const checkInStr = r[startField] || r.check_in;
      if (checkInStr) {
        const dateKey = String(checkInStr).slice(0, 10);
        if (!emp.shiftsByDate[dateKey]) {
          emp.shiftsByDate[dateKey] = [];
        }
        emp.shiftsByDate[dateKey].push(r);
      }
    });

    const result = [];
    deptMap.forEach((empMap, deptName) => {
      const employees = Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      const totalDeptShifts = employees.reduce((sum, e) => sum + e.shifts.length, 0);
      const totalDeptHours = employees.reduce((sum, e) => sum + e.totalHours, 0);
      result.push({
        deptName,
        employees,
        totalDeptShifts,
        totalDeptHours,
      });
    });

    return result.sort((a, b) => a.deptName.localeCompare(b.deptName));
  }, [records, groupByField, titleField, startField]);

  const totalShiftsCount = records.length;
  const totalEmployeesCount = groupedDepartments.reduce((acc, d) => acc + d.employees.length, 0);
  const totalHoursCount = records.reduce((acc, r) => acc + (Number(r.duration_hours) || 0), 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 sm:p-6 space-y-5 animate-fadeIn text-slate-900 dark:text-slate-100">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
            <GanttChart className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-base tracking-tight">
                Shift Rosters & Department Schedules
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                7-Day Timeline
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Workforce distribution across operational shifts & department schedules
            </p>
          </div>
        </div>

        {/* Legend & Summary Metrics */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Status Legend matching roster states */}
          <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">Confirmed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">Published</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">Draft</span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span><strong>{totalEmployeesCount}</strong> Staff</span>
            <span>•</span>
            <span><strong>{totalShiftsCount}</strong> Shifts</span>
            <span>•</span>
            <span className="text-blue-600 dark:text-blue-400 font-bold">{totalHoursCount.toFixed(1)} hrs</span>
          </div>
        </div>
      </div>

      {/* Roster Timeline Grid */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900 shadow-2xs">
        <div className="min-w-[980px]">
          {/* Sticky Table Header */}
          <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 py-3 px-4 sticky top-0 z-10">
            {/* Left Column: Fixed Employee Header */}
            <div className="col-span-3 text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Employee & Role</span>
            </div>

            {/* 7 Day Headers */}
            <div className="col-span-8 grid grid-cols-7 text-center divide-x divide-slate-200 dark:divide-slate-700">
              {timelineDates.map((d) => (
                <div
                  key={d.dateStr}
                  className={`px-1 text-center truncate ${
                    d.isWeekend ? 'bg-slate-100/60 dark:bg-slate-800/60' : ''
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400">
                    {d.dayName}
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {d.monthName} {d.dayNum}
                  </div>
                </div>
              ))}
            </div>

            {/* Total Column Header */}
            <div className="col-span-1 text-right text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] pr-2">
              Hours
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {groupedDepartments.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                <Clock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                No shifts scheduled for the active period.
              </div>
            ) : (
              groupedDepartments.map((deptGroup) => (
                <div key={deptGroup.deptName} className="py-1">
                  {/* Department Group Header Strip */}
                  <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/50 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between border-y border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-slate-900 dark:text-white font-bold">{deptGroup.deptName}</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        {deptGroup.employees.length} {deptGroup.employees.length === 1 ? 'employee' : 'employees'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Subtotal: <strong className="text-slate-700 dark:text-slate-200">{deptGroup.totalDeptHours.toFixed(1)} hrs</strong> ({deptGroup.totalDeptShifts} shifts)
                    </div>
                  </div>

                  {/* Employee Rows along Y-Axis */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {deptGroup.employees.map((emp) => {
                      const initials = emp.name
                        ? emp.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : 'EM';

                      return (
                        <div
                          key={emp.key}
                          className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition group"
                        >
                          {/* 1. Left Fixed Employee Column */}
                          <div className="col-span-3 pr-3 flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-blue-200 dark:ring-blue-800">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                onClick={() => {
                                  if (emp.shifts[0] && onRecordClick) {
                                    onRecordClick(emp.shifts[0]);
                                  }
                                }}
                                className="font-semibold text-xs text-slate-900 dark:text-white truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition"
                                title={emp.name}
                              >
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                <span className="truncate">{emp.role}</span>
                              </div>
                            </div>
                          </div>

                          {/* 2. 7 Timeline Day Columns (Horizontal Shift Blocks Alignment) */}
                          <div className="col-span-8 grid grid-cols-7 min-h-[46px] items-center divide-x divide-slate-100 dark:divide-slate-800">
                            {timelineDates.map((d) => {
                              const dayShifts = emp.shiftsByDate[d.dateStr] || [];

                              return (
                                <div
                                  key={d.dateStr}
                                  className={`px-1.5 py-1 min-h-[46px] flex flex-col justify-center gap-1 relative ${
                                    d.isWeekend ? 'bg-slate-50/30 dark:bg-slate-900/40' : ''
                                  }`}
                                >
                                  {dayShifts.length > 0 ? (
                                    dayShifts.map((shift) => {
                                      const statusKey = (shift.status || 'draft').toLowerCase();
                                      const barColor = STATUS_COLOR[statusKey] || STATUS_COLOR.draft;
                                      const statusLabel = STATUS_LABEL_MAP[statusKey] || 'Draft';
                                      const timeStr = formatShiftTime(shift.check_in);

                                      return (
                                        <button
                                          key={shift.id}
                                          type="button"
                                          onClick={() => onRecordClick && onRecordClick(shift)}
                                          className={`w-full py-1.5 px-2 rounded-lg text-left transition cursor-pointer flex flex-col justify-between ${barColor}`}
                                          title={`${emp.name} • ${d.label} • ${shift.duration_hours || 8}h • ${statusLabel}`}
                                        >
                                          <div className="flex items-center justify-between gap-1 leading-tight">
                                            <span className="font-bold text-[11px] truncate">
                                              {shift.duration_hours ? `${shift.duration_hours}h` : '8.0h'}
                                            </span>
                                            {timeStr && (
                                              <span className="font-mono text-[10px] opacity-90 shrink-0">
                                                {timeStr}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] opacity-90 truncate leading-tight mt-0.5">
                                            {statusLabel}
                                          </div>
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div
                                      onClick={() => {
                                        if (onRecordClick) {
                                          onRecordClick({
                                            isNew: true,
                                            employee_id: emp.id,
                                            employee_name: emp.name,
                                            department: emp.department,
                                            check_in: `${d.dateStr}T08:00:00.000Z`,
                                            duration_hours: 8,
                                            status: 'draft',
                                          });
                                        }
                                      }}
                                      className="h-8 rounded-md flex items-center justify-center text-slate-300 dark:text-slate-700 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 cursor-pointer transition text-xs"
                                      title={`Assign shift for ${emp.name} on ${d.label}`}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* 3. Total Hours Column */}
                          <div className="col-span-1 text-right font-mono tabular-nums text-xs font-bold text-slate-800 dark:text-slate-200 pr-2">
                            {emp.totalHours ? `${emp.totalHours.toFixed(1)}h` : '0.0h'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GanttView;
