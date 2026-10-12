import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  Activity,
} from 'lucide-react';

const PALETTE = [
  '#2563eb', // Blue 600
  '#0ea5e9', // Sky 500
  '#10b981', // Emerald 500
  '#f59e0b', // Amber 500
  '#6366f1', // Indigo 500
  '#8b5cf6', // Violet 500
  '#06b6d4', // Cyan 500
];

export function GraphView({ schema, records = [] }) {
  const graphDef = schema?.views?.graph || {
    default_chart: 'bar',
    dimension: 'department',
    measure: 'duration_hours',
    aggregator: 'sum',
  };

  const [chartType, setChartType] = useState(graphDef.default_chart || 'bar');
  const [dimension, setDimension] = useState(graphDef.dimension || 'department');
  const [measure, setMeasure] = useState(graphDef.measure || 'duration_hours');
  const [aggregator, setAggregator] = useState(graphDef.aggregator || 'sum');
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Dynamic aggregation
  const aggregatedData = useMemo(() => {
    const groups = {};

    records.forEach((r) => {
      const dimKey = r[dimension] || 'Unassigned';
      const mVal = Number(r[measure]) || 0;

      if (!groups[dimKey]) {
        groups[dimKey] = { count: 0, sum: 0 };
      }
      groups[dimKey].count += 1;
      groups[dimKey].sum += mVal;
    });

    const entries = Object.entries(groups).map(([label, stats], idx) => {
      let value = stats.sum;
      if (aggregator === 'avg') {
        value = stats.count > 0 ? stats.sum / stats.count : 0;
      } else if (aggregator === 'count') {
        value = stats.count;
      }
      return {
        label,
        value: Math.round(value * 10) / 10,
        count: stats.count,
        color: PALETTE[idx % PALETTE.length],
      };
    });

    entries.sort((a, b) => b.value - a.value);
    return entries;
  }, [records, dimension, measure, aggregator]);

  const totalValue = aggregatedData.reduce((acc, d) => acc + d.value, 0);
  const maxValue = Math.max(...aggregatedData.map((d) => d.value), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-6 animate-fadeIn">
      {/* Graph Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Analytics Overview — {dimension.toUpperCase()} by {measure.toUpperCase()}
            </h3>
            <p className="text-xs text-slate-500">
              Aggregated across {records.length} records ({aggregator.toUpperCase()})
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Type Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 ${
                chartType === 'bar'
                  ? 'bg-white shadow-2xs font-semibold text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Bar Chart"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bar</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 ${
                chartType === 'line'
                  ? 'bg-white shadow-2xs font-semibold text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Line Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Line</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('pie')}
              className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 ${
                chartType === 'pie'
                  ? 'bg-white shadow-2xs font-semibold text-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Donut / Pie Chart"
            >
              <PieIcon className="w-3.5 h-3.5" />
              <span>Donut</span>
            </button>
          </div>

          {/* Aggregator Selector */}
          <select
            value={aggregator}
            onChange={(e) => setAggregator(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
          >
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="count">Count</option>
          </select>
        </div>
      </div>

      {/* Main Chart Area */}
      {aggregatedData.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          No data available for aggregation
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          {/* Chart Canvas */}
          <div className="lg:col-span-2 min-h-[320px] flex items-center justify-center">
            {chartType === 'bar' && (
              <div className="w-full space-y-4 pt-4">
                {aggregatedData.map((item, idx) => {
                  const percentage = Math.round((item.value / maxValue) * 100);
                  const isHovered = hoveredIndex === idx;

                  return (
                    <div
                      key={item.label}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="space-y-1.5 transition-transform"
                    >
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-800">{item.label}</span>
                        <span className="font-mono text-slate-900">
                          {item.value} {measure === 'duration_hours' ? 'hrs' : ''} ({item.count} shifts)
                        </span>
                      </div>
                      <div className="w-full h-8 bg-slate-100 rounded-lg overflow-hidden flex items-center p-1 relative">
                        <div
                          style={{
                            width: `${Math.max(percentage, 6)}%`,
                            backgroundColor: item.color,
                          }}
                          className={`h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2 text-[11px] font-bold text-white shadow-2xs ${
                            isHovered ? 'brightness-110' : ''
                          }`}
                        >
                          {percentage > 15 && `${percentage}%`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {chartType === 'line' && (
              <div className="w-full h-64 relative flex flex-col justify-end pt-8">
                <svg className="w-full h-48 overflow-visible" viewBox="0 0 500 150">
                  <line x1="0" y1="0" x2="500" y2="0" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="50" x2="500" y2="50" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="150" x2="500" y2="150" stroke="#e2e8f0" strokeWidth="1" />

                  {(() => {
                    const step = 500 / Math.max(aggregatedData.length - 1, 1);
                    const points = aggregatedData.map((d, i) => {
                      const x = i * step;
                      const y = 140 - (d.value / maxValue) * 120;
                      return `${x},${y}`;
                    });

                    return (
                      <>
                        <polyline
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points.join(' ')}
                        />
                        {aggregatedData.map((d, i) => {
                          const x = i * step;
                          const y = 140 - (d.value / maxValue) * 120;
                          return (
                            <circle
                              key={d.label}
                              cx={x}
                              cy={y}
                              r="6"
                              fill={d.color}
                              stroke="#ffffff"
                              strokeWidth="2"
                              className="cursor-pointer hover:r-8 transition-all"
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>

                <div className="flex justify-between text-[11px] font-semibold text-slate-500 pt-3 border-t border-slate-200">
                  {aggregatedData.map((d) => (
                    <span key={d.label} className="truncate max-w-[80px] text-center">
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {chartType === 'pie' && (
              <div className="flex flex-col items-center justify-center relative">
                <svg className="w-56 h-56 transform -rotate-90" viewBox="0 0 100 100">
                  {(() => {
                    let cumulativeAngle = 0;
                    return aggregatedData.map((item, idx) => {
                      const sliceRatio = totalValue > 0 ? item.value / totalValue : 0;
                      const strokeDasharray = `${sliceRatio * 282.7} 282.7`;
                      const strokeDashoffset = -cumulativeAngle * 282.7;
                      cumulativeAngle += sliceRatio;

                      return (
                        <circle
                          key={item.label}
                          r="45"
                          cx="50"
                          cy="50"
                          fill="transparent"
                          stroke={item.color}
                          strokeWidth="10"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className="cursor-pointer hover:stroke-[12] transition-all"
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
                  <span className="text-xl font-bold font-mono text-slate-900">
                    {totalValue.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-slate-500">hours</span>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown Stats Panel */}
          <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Metric Breakdown</span>
              <span className="font-mono text-slate-700">{aggregatedData.length} Categories</span>
            </div>

            <div className="space-y-3">
              {aggregatedData.map((item, idx) => {
                const share = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
                return (
                  <div
                    key={item.label}
                    className={`p-2.5 rounded-lg border transition cursor-default ${
                      hoveredIndex === idx
                        ? 'bg-white border-blue-500 shadow-xs'
                        : 'bg-white/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold text-slate-800">{item.label}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{item.value}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 pl-4.5">
                      <span>{item.count} shifts</span>
                      <span>{share}% of total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
