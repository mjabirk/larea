import React from 'react';
import { ShieldAlert, AlertTriangle, Archive, X, ArrowRight } from 'lucide-react';

export function DeleteBlockedModal({ isOpen, errorData, onClose, onArchiveInstead }) {
  if (!isOpen || !errorData) return null;

  const { entity_name, entity_type, message, dependencies = [], resolution } = errorData;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 text-slate-800 dark:text-slate-100">
        <div className="flex items-start gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
            <ShieldAlert className="w-6 h-6"/>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              Deletion Blocked by System Integrity
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {entity_name} ({entity_type}) cannot be deleted.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X className="w-4 h-4"/>
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs">
          <p className="font-semibold text-rose-600 dark:text-rose-400">
            {message}
          </p>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3 space-y-2">
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">
              Active References Found:
            </span>
            <ul className="space-y-1.5 pl-1">
              {dependencies.map((dep, idx) => (
                <li key={idx} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {dep.label}
                  </span>
                  <span className="font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200">
                    {dep.count} {dep.count === 1 ? 'record' : 'records'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 leading-relaxed text-[11px]">
            <strong className="block mb-0.5">Recommended Resolution:</strong>
            {resolution}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          {onArchiveInstead && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onArchiveInstead();
              }}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5"/>
              <span>Archive Record Instead</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
