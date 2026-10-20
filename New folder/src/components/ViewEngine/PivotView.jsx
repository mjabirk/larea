import React, { useMemo } from 'react';
import { Table, Columns3, Rows3 } from 'lucide-react';

export function PivotView({ schema, records = [] }) {
  const pivotDef = schema?.views?.pivot || {
    row_groupby: ['department'],
    col_groupby: ['status'],
    measures: ['duration_hours'],
  };

  const rowGroup = pivotDef.row_groupby[0] || 'department';
  const colGroup = pivotDef.col_groupby[0] || 'status';
  const measure = pivotDef.measures[0] || 'duration_hours';

  const colCategories = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r[colGroup]) set.add(r[colGroup]);
    });
    return Array.from(set).sort();
  }, [records, colGroup]);

  const rowCategories = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r[rowGroup]) set.add(r[rowGroup]);
    });
    return Array.from(set).sort();
  }, [records, rowGroup]);

  const matrix = useMemo(() => {
    const data = {};
    const colTotals = {};
    let grandTotal = 0;

    rowCategories.forEach((r) => {
      data[r] = { values: {}, rowTotal: 0, count: 0 };
      colCategories.forEach((c) => {
        data[r].values[c] = 0;
      });
    });

    colCategories.forEach((c) => {
      colTotals[c] = 0;
    });

    records.forEach((r) => {
      const rKey = r[rowGroup];
      const cKey = r[colGroup];
      const val = Number(r[measure]) || 0;

      if (data[rKey] && data[rKey].values[cKey] !== undefined) {
        data[rKey].values[cKey] += val;
        data[rKey].rowTotal += val;
        data[rKey].count += 1;
        colTotals[cKey] += val;
        grandTotal += val;
      }
    });

    return { rows: data, colTotals, grandTotal };
  }, [records, rowGroup, colGroup, measure, rowCategories, colCategories]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-5 animate-fadeIn">
      {/* Pivot View Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Pivot Matrix: {rowGroup.toUpperCase()} × {colGroup.toUpperCase()}
            </h3>
            <p className="text-xs text-slate-500">
              Measure: <span className="font-semibold text-slate-700">{measure}</span> (Sum)
            </p>
          </div>
        </div>

        {/* Legend pills */}
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md font-mono text-[11px]">
            <Rows3 className="w-3.5 h-3.5 text-slate-400" />
            Row: {rowGroup}
          </span>
          <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md font-mono text-[11px]">
            <Columns3 className="w-3.5 h-3.5 text-slate-400" />
            Col: {colGroup}
          </span>
        </div>
      </div>

      {/* Pivot Matrix Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700 uppercase">
              <th className="py-3 px-4 border-r border-slate-200 w-56">
                {rowGroup.replace('_', ' ')}
              </th>
              {colCategories.map((c) => (
                <th key={c} className="py-3 px-4 text-right border-r border-slate-200">
                  {c}
                </th>
              ))}
              <th className="py-3 px-4 text-right bg-slate-100/80 font-black text-slate-900">
                Row Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rowCategories.map((rCat) => {
              const rowData = matrix.rows[rCat];
              return (
                <tr key={rCat} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900 border-r border-slate-200 bg-slate-50/40">
                    <div className="flex items-center justify-between">
                      <span>{rCat}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({rowData.count} shifts)
                      </span>
                    </div>
                  </td>

                  {colCategories.map((cCat) => {
                    const cellVal = rowData.values[cCat] || 0;
                    return (
                      <td
                        key={cCat}
                        className={`py-3 px-4 text-right font-mono tabular-nums border-r border-slate-200 ${
                          cellVal > 0 ? 'text-slate-900 font-medium' : 'text-slate-300'
                        }`}
                      >
                        {cellVal > 0 ? cellVal.toFixed(1) : '—'}
                      </td>
                    );
                  })}

                  <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 bg-slate-50/50">
                    {rowData.rowTotal.toFixed(1)} hrs
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
              <td className="py-3 px-4 border-r border-slate-200 font-black uppercase text-xs">
                Column Totals
              </td>
              {colCategories.map((cCat) => {
                const total = matrix.colTotals[cCat] || 0;
                return (
                  <td key={cCat} className="py-3 px-4 text-right font-mono tabular-nums border-r border-slate-200">
                    {total.toFixed(1)} hrs
                  </td>
                );
              })}
              <td className="py-3 px-4 text-right font-mono tabular-nums font-black text-blue-600 bg-blue-50 text-sm">
                {matrix.grandTotal.toFixed(1)} hrs
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
