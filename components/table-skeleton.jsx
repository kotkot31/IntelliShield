/**
 * TableSkeleton — Animated shimmer placeholder shown while table data is loading.
 *
 * Props:
 *   columns  {number}  Number of column cells per row
 *   rows     {number}  Number of skeleton rows to render (default 8)
 */
export default function TableSkeleton({ columns = 6, rows = 8 }) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        {/* Fake header */}
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 w-20 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
              </th>
            ))}
          </tr>
        </thead>

        {/* Fake rows */}
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="bg-white dark:bg-slate-900">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <div
                    className="h-3 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800"
                    /* Vary widths so it looks realistic */
                    style={{ width: `${55 + ((rowIdx * columns + colIdx) % 5) * 10}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
