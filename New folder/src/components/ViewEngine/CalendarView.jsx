import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
} from 'lucide-react';

const STATUS_COLOR_MAP = {
  synced: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60',
  verified: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60',
  draft: 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60',
};

export function CalendarView({ schema, records = [], onRecordClick }) {
  const calDef = schema?.views?.calendar || {
    date_start: 'check_in',
    date_stop: 'check_out',
    event_title: 'employee_name',
    color_field: 'status',
  };

  // Dynamically resolve starting view month from records or system date
  const [currentDate, setCurrentDate] = useState(() => {
    if (records && records.length > 0) {
      const firstValid = records.find((r) => r[calDef.date_start]);
      if (firstValid) {
        const d = new Date(firstValid[calDef.date_start]);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return new Date();
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const eventsByDay = {};
  records.forEach((r) => {
    const rawStart = r[calDef.date_start];
    if (!rawStart) return;
    try {
      const d = new Date(rawStart);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!eventsByDay[day]) eventsByDay[day] = [];
        eventsByDay[day].push(r);
      }
    } catch (e) {
      console.error(e);
    }
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden space-y-4 p-6 animate-fadeIn text-slate-900 dark:text-slate-100">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              {monthNames[month]} {year}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {records.length} total scheduled roster & attendance shifts
            </p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            Today
          </button>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-[1px] bg-slate-200 dark:bg-slate-700 my-1" />
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
        <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase py-2">
          {weekDays.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[110px] bg-slate-50/40 dark:bg-slate-900/40 p-2 text-slate-300 dark:text-slate-700">
              —
            </div>
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayEvents = eventsByDay[dayNum] || [];
            const isToday =
              dayNum === new Date().getDate() &&
              month === new Date().getMonth() &&
              year === new Date().getFullYear();

            return (
              <div
                key={`day-${dayNum}`}
                className={`min-h-[110px] p-2 transition flex flex-col justify-between ${
                  isToday
                    ? 'bg-blue-50/40 dark:bg-blue-950/30'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`font-semibold text-xs rounded-full w-5 h-5 flex items-center justify-center ${
                      isToday
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {dayEvents.length} shifts
                    </span>
                  )}
                </div>

                <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px]">
                  {dayEvents.map((ev) => {
                    const status = ev[calDef.color_field] || 'draft';
                    const colorStyle = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.draft;
                    const title = ev[calDef.event_title] || 'Employee';
                    const hours = ev.duration_hours ? `${ev.duration_hours}h` : '';

                    return (
                      <div
                        key={ev.id}
                        onClick={() => onRecordClick && onRecordClick(ev)}
                        className={`px-2 py-1 rounded border text-[11px] font-medium truncate cursor-pointer transition shadow-2xs flex items-center justify-between ${colorStyle}`}
                        title={`${title} (${status}) - Click to inspect`}
                      >
                        <span className="truncate">{title}</span>
                        {hours && <span className="font-mono text-[10px] ml-1 shrink-0">{hours}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
