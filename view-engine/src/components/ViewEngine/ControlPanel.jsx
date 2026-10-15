import React, { useState } from 'react';
import {
  List as ListIcon,
  FileText,
  BarChart3,
  Calendar as CalendarIcon,
  Table as TableIcon,
  GanttChart,
  Plus,
  Save,
  RotateCcw,
  Printer,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Download,
  Trash2,
} from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

const VIEW_ICON_MAP = {
  list: { icon: ListIcon, labelKey: 'view_list' },
  form: { icon: FileText, labelKey: 'view_form' },
  graph: { icon: BarChart3, labelKey: 'view_analytics' },
  calendar: { icon: CalendarIcon, labelKey: 'view_calendar' },
  pivot: { icon: TableIcon, labelKey: 'view_pivot' },
  gantt: { icon: GanttChart, labelKey: 'view_gantt' },
};

export function ControlPanel({
  schema,
  currentView,
  onViewChange,
  breadcrumbs = [],
  activeRecordPill,
  recordTitle,
  recordStatus,
  recordCode,
  pager,
  selectedCount = 0,
  isDirty = false,
  onNew,
  onSave,
  onDiscard,
  onPrintReports,
  onBulkAction,
  searchTerm = '',
  onSearchChange,
  activeFilter,
  onSelectFilter,
}) {
  const { t } = useLocale();
  const [showActionMenu, setShowActionMenu] = useState(false);

  // Enabled views in schema
  const enabledViews = Object.keys(schema?.views || {});

  // Integrated filter chips: schema defined or defaults
  const filterChips = schema?.filterChips || [
    { id: 'all', label: t('all') || 'All' },
    { id: 'draft', label: t('draft') || 'Draft' },
    { id: 'verified', label: t('verified') || 'Verified' },
    { id: 'synced', label: t('synced') || 'Synced' },
  ];

  const isFormView = currentView === 'form' || Boolean(recordTitle);

  return (
    <div className="h-11 min-h-[44px] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 sticky top-14 z-20 shadow-2xs px-3 sm:px-4 flex items-center justify-between gap-3 select-none">
      {/* ========================================================================= */}
      {/* LEFT: Primary Action Button + Breadcrumbs                                 */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2.5 shrink-0">
        {!isFormView && onNew && (
          <button
            type="button"
            onClick={onNew}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{schema?.newButtonLabel || t('new_record') || '+ New'}</span>
          </button>
        )}

        <div className="flex items-center gap-1.5 text-xs pl-1 border-l border-slate-200 dark:border-slate-700">
          {breadcrumbs.map((crumb, idx) => {
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-300 dark:text-slate-600 font-light">/</span>}
                {crumb.onClick ? (
                  <button
                    type="button"
                    onClick={crumb.onClick}
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition cursor-pointer text-xs hover:underline"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs tracking-tight">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Active Record Count Pill (When on list view) */}
        {!isFormView && activeRecordPill && (
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
            {activeRecordPill}
          </span>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CENTER: Record Title + Status Badge (Form) OR Quick Search (List)         */}
      {/* ========================================================================= */}
      {isFormView ? (
        <div className="flex items-center justify-center gap-2.5 flex-1 min-w-0 px-2 animate-fadeIn">
          <h2 className="text-[15px] sm:text-[16px] font-semibold text-slate-900 dark:text-white truncate tracking-tight">
            {recordTitle || breadcrumbs[breadcrumbs.length - 1]?.label || 'Record Details'}
          </h2>
          {recordCode && (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              {recordCode}
            </span>
          )}
          {recordStatus && (
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                recordStatus.toLowerCase() === 'active' ||
                recordStatus.toLowerCase() === 'verified' ||
                recordStatus.toLowerCase() === 'valid'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                  : recordStatus.toLowerCase() === 'on leave' ||
                    recordStatus.toLowerCase() === 'pending' ||
                    recordStatus.toLowerCase() === 'draft'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
              }`}
            >
              {recordStatus}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 max-w-xl mx-2">
          {onSearchChange && (
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('search_placeholder') || 'Filter records...'}
                className="w-full pl-9 pr-7 rtl:pr-9 rtl:pl-7 py-1.5 bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 rtl:left-2 rtl:right-auto top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Integrated Filter Chips */}
          {onSelectFilter && (
            <div className="hidden md:inline-flex items-center rounded-lg bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200 dark:border-slate-700 text-xs shrink-0">
              {filterChips.map((chip) => {
                const isActive = activeFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => onSelectFilter(chip.id)}
                    className={`px-2.5 py-1 rounded-md transition text-xs font-medium cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* RIGHT: Action Buttons Pinned on the Right                                 */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {isFormView ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                isDirty
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('save_changes') || 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={onDiscard}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title={t('discard') || 'Discard changes'}
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">{t('discard') || 'Discard'}</span>
            </button>
          </div>
        ) : null}

        {/* Secondary Action Dropdown (Export, Print, Delete) */}
        {onBulkAction && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActionMenu(!showActionMenu)}
              aria-label="Record Actions and Export Menu"
              aria-haspopup="menu"
              aria-expanded={showActionMenu}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 cursor-pointer transition shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span>{t('action') || 'Actions'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showActionMenu && (
              <div
                className="absolute right-0 rtl:left-0 rtl:right-auto mt-1.5 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1 z-30 text-xs animate-fadeIn"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onBulkAction('export');
                    setShowActionMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left rtl:text-right flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('export_csv') || 'Export CSV'}</span>
                </button>
                {onPrintReports && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onPrintReports();
                      setShowActionMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left rtl:text-right flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('print_slip') || 'Print Slip'}</span>
                  </button>
                )}
                {(selectedCount > 0 || isFormView) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onBulkAction('delete');
                      setShowActionMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left rtl:text-right flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer border-t border-slate-100 dark:border-slate-800"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>
                      {t('delete') || 'Delete Record'} {selectedCount > 0 ? `(${selectedCount})` : ''}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* View Switcher Segmented Control (Active across all modes to prevent form lock) */}
        {enabledViews.filter((v) => v !== 'form').length > 1 && onViewChange && (
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 p-0.5 shadow-2xs"
            role="toolbar"
            aria-label="View Switcher Modes"
          >
            {enabledViews.map((viewKey) => {
              const viewDef = VIEW_ICON_MAP[viewKey];
              if (!viewDef) return null;
              const Icon = viewDef.icon;
              const isActive = currentView === viewKey;

              return (
                <button
                  key={viewKey}
                  type="button"
                  onClick={() => onViewChange(viewKey)}
                  aria-label={t(viewDef.labelKey)}
                  aria-pressed={isActive}
                  className={`p-1.5 rounded-md transition cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={t(viewDef.labelKey)}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        {/* Record Pager Cycling (1 of N < >) */}
        {pager && (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs pl-2 rtl:pr-2 rtl:pl-0 border-l rtl:border-r rtl:border-l-0 border-slate-200 dark:border-slate-700">
            <span>{pager.label}</span>
            <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                type="button"
                onClick={pager.onPrev}
                disabled={!pager.canPrev}
                className={`p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${
                  !pager.canPrev ? 'opacity-30 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300'
                }`}
                title="Previous"
              >
                <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
              <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                onClick={pager.onNext}
                disabled={!pager.canNext}
                className={`p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer ${
                  !pager.canNext ? 'opacity-30 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300'
                }`}
                title="Next"
              >
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlPanel;
