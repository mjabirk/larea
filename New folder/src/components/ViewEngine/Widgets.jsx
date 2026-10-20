import React, { useState } from 'react';
import {
  MapPin,
  ExternalLink,
  Clock,
  User,
  Calendar,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { EMPLOYEES } from '../../schema/attendanceSchema';

// Converts float hours to HH:MM format (e.g. 8.5 -> "08:30")
export function formatFloatTime(value) {
  if (value === null || value === undefined || isNaN(value)) return '00:00';
  const totalMinutes = Math.round(Number(value) * 60);
  const hours = Math.floor(Math.abs(totalMinutes) / 60);
  const minutes = Math.abs(totalMinutes) % 60;
  const sign = totalMinutes < 0 ? '-' : '';
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Parses string like "08:30" or "8.5" to decimal float
export function parseToFloatTime(str) {
  if (!str) return 0;
  const trimmed = String(str).trim();
  if (trimmed.includes(':')) {
    const [h, m] = trimmed.split(':');
    const hours = parseFloat(h) || 0;
    const minutes = (parseFloat(m) || 0) / 60;
    return Math.round((hours + minutes) * 100) / 100;
  }
  return parseFloat(trimmed) || 0;
}

// Formats ISO datetime string to Odoo human readable date/time
export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

export function Many2OneAvatarWidget({ employeeId, mode = 'readonly', onChange }) {
  const employee = EMPLOYEES.find((e) => e.id === Number(employeeId)) || {
    id: employeeId,
    name: 'Unknown Employee',
    job_title: 'Staff',
    avatar_color: 'bg-slate-500',
    avatar_text: '?',
  };

  if (mode === 'edit') {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-full ${employee.avatar_color} text-white flex items-center justify-center text-xs font-semibold shrink-0`}
        >
          {employee.avatar_text}
        </div>
        <select
          value={employeeId || ''}
          onChange={(e) => onChange && onChange(Number(e.target.value))}
          className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#714B67] focus:border-transparent"
        >
          {EMPLOYEES.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} — {emp.job_title} ({emp.department})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-7 h-7 rounded-full ${employee.avatar_color} text-white flex items-center justify-center text-xs font-semibold shadow-xs shrink-0`}
        title={employee.name}
      >
        {employee.avatar_text}
      </div>
      <div className="truncate">
        <div className="text-sm font-medium text-slate-900 truncate leading-tight">
          {employee.name}
        </div>
        {employee.job_title && (
          <div className="text-xs text-slate-500 truncate">{employee.job_title}</div>
        )}
      </div>
    </div>
  );
}

export function FloatTimeWidget({ value, mode = 'readonly', onChange, bold, highlight }) {
  const [localVal, setLocalVal] = useState(formatFloatTime(value));

  if (mode === 'edit') {
    return (
      <div className="relative">
        <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={() => {
            const parsed = parseToFloatTime(localVal);
            setLocalVal(formatFloatTime(parsed));
            onChange && onChange(parsed);
          }}
          placeholder="00:00"
          className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-[#714B67]"
        />
      </div>
    );
  }

  const formatted = formatFloatTime(value);

  if (highlight) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#714B67]/10 text-[#714B67] font-semibold font-mono text-sm">
        <Clock className="w-3.5 h-3.5" />
        <span>{formatted}</span>
        <span className="text-xs font-normal text-slate-500">({value || 0}h)</span>
      </div>
    );
  }

  return (
    <span
      className={`font-mono text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
    >
      {formatted}
    </span>
  );
}

export function BadgeWidget({ state }) {
  let colorStyles = 'bg-slate-100 text-slate-700 ring-slate-300';
  let dotColor = 'bg-slate-400';
  let label = state;

  switch (state) {
    case 'validated':
      colorStyles = 'bg-emerald-50 text-emerald-700 ring-emerald-600/30';
      dotColor = 'bg-emerald-500';
      label = 'Validated';
      break;
    case 'draft':
      colorStyles = 'bg-amber-50 text-amber-700 ring-amber-600/30';
      dotColor = 'bg-amber-500';
      label = 'To Approve';
      break;
    case 'refused':
      colorStyles = 'bg-rose-50 text-rose-700 ring-rose-600/30';
      dotColor = 'bg-rose-500';
      label = 'Refused';
      break;
    default:
      label = state || '—';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${colorStyles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
}

// Converts any date value (ISO string with/without timezone, Date object) to local YYYY-MM-DDTHH:mm for <input type="datetime-local">
export function formatToLocalDatetimeInputValue(val) {
  if (!val) return '';
  try {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      const hasTimezone = trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed);
      // If it has NO timezone indicator, it is already wall-clock local time
      if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 16);
      }
    }

    const d = new Date(val);
    if (isNaN(d.getTime())) return typeof val === 'string' ? val.slice(0, 16) : '';

    const pad = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());

    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return '';
  }
}

export function DateTimeWidget({ value, mode = 'readonly', onChange, required }) {
  if (mode === 'edit') {
    const localValue = formatToLocalDatetimeInputValue(value);

    return (
      <div className="relative">
        <input
          type="datetime-local"
          value={localValue}
          required={required}
          onChange={(e) => {
            if (!onChange) return;
            const v = e.target.value;
            if (!v) {
              onChange(null);
            } else {
              const d = new Date(v);
              onChange(!isNaN(d.getTime()) ? d.toISOString() : v);
            }
          }}
          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#714B67]"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-sm text-slate-700">
      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span>{formatDateTime(value)}</span>
    </div>
  );
}

export function GpsWidget({ lat, lng, locationName }) {
  const [showMap, setShowMap] = useState(false);

  if (!lat && !lng) {
    return <span className="text-xs text-slate-400 italic">No GPS coordinates recorded</span>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-mono text-slate-700">
        <MapPin className="w-3.5 h-3.5 text-[#714B67]" />
        <span>
          {lat?.toFixed(6)}, {lng?.toFixed(6)}
        </span>
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="inline-flex items-center gap-1 text-xs text-[#714B67] hover:underline font-sans cursor-pointer ml-1"
        >
          {showMap ? 'Hide preview' : 'View on Maps'}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {showMap && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 animate-fadeIn">
          <div className="font-semibold text-slate-800 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-red-500" />
            {locationName || 'GPS Location'}
          </div>
          <div className="text-slate-500">
            Latitude: <span className="font-mono text-slate-700">{lat}</span>
          </div>
          <div className="text-slate-500">
            Longitude: <span className="font-mono text-slate-700">{lng}</span>
          </div>
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#714B67] hover:text-[#5B3751] font-medium pt-1"
          >
            Open in Google Maps <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

// Odoo-style Statusbar Widget
export function StatusBarWidget({ state, onStateChange, visibleStates = ['draft', 'validated'] }) {
  const states = [
    { key: 'draft', label: 'To Approve' },
    { key: 'validated', label: 'Validated' },
    { key: 'refused', label: 'Refused' },
  ];

  // If the record is refused, make sure 'refused' is visible
  const displayStates = states.filter((s) => visibleStates.includes(s.key) || s.key === state);

  return (
    <div className="inline-flex items-stretch border border-slate-300 rounded overflow-hidden text-xs bg-slate-100 divide-x divide-slate-300">
      {displayStates.map((s, idx) => {
        const isActive = s.key === state;
        let activeStyles = 'bg-slate-100 text-slate-600 hover:bg-slate-200';

        if (isActive) {
          if (state === 'validated') {
            activeStyles = 'bg-emerald-600 text-white font-semibold';
          } else if (state === 'refused') {
            activeStyles = 'bg-rose-600 text-white font-semibold';
          } else {
            activeStyles = 'bg-[#714B67] text-white font-semibold';
          }
        }

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onStateChange && onStateChange(s.key)}
            className={`px-3 py-1.5 transition-colors flex items-center gap-1.5 cursor-pointer ${activeStyles}`}
          >
            <span>{s.label}</span>
            {idx < displayStates.length - 1 && !isActive && (
              <ChevronRight className="w-3 h-3 opacity-40 ml-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
