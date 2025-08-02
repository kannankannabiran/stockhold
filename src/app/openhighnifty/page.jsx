'use client';

import React, { useEffect, useState } from 'react';
import { useAccessControl } from '../../hooks/useAccessControl';

export default function NiftyOHLCPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl('/openhighnifty');
  
  const [ohlc, setOhlc] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/open-high-nifty-index')
      .then((res) => res.json())
      .then((data) => {
        // Sort by date descending
        const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));
        setOhlc(sortedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch OHLC data:', err);
        setLoading(false);
      });
  }, []);

  const maxHigh = Math.max(...ohlc.map(o => o.high || 0));
  const minLow = Math.min(...ohlc.map(o => o.low || Infinity));

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700">📊 Nifty 50 OHLC (Live)</h1>

      {loading ? (
        <p className="text-gray-500 text-center">Loading data...</p>
      ) : (
        <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
          <table className="min-w-full table-auto text-sm border-collapse">
            <thead className="bg-blue-100 text-gray-700 sticky top-0 z-10">
              <tr>
                <th className="p-3 border border-indigo-200">Date</th>
                <th className="p-3 border border-indigo-200">Open</th>
                <th className="p-3 border border-indigo-200">High</th>
                <th className="p-3 border border-indigo-200">Low</th>
                <th className="p-3 border border-indigo-200">Close</th>
              </tr>
            </thead>
            <tbody>
              {ohlc.map((row, index) => {
                const isHigh = row.high === maxHigh;
                const isLow = row.low === minLow;

                return (
                  <tr
                    key={index}
                    className="text-center hover:bg-gray-50 transition duration-150"
                  >
                    <td className="p-3 border border-gray-200">{row.date}</td>
                    <td className="p-3 border border-gray-200">{row.open?.toFixed(2)}</td>
                    <td
                      className={`p-3 border border-gray-200 ${
                        isHigh ? 'bg-green-100 font-semibold text-green-700' : ''
                      }`}
                    >
                      {row.high?.toFixed(2)}
                    </td>
                    <td
                      className={`p-2 border border-gray-200 ${
                        isLow ? 'bg-red-100 font-semibold text-red-700' : ''
                      }`}
                    >
                      {row.low?.toFixed(2)}
                    </td>
                    <td className="p-2 border border-gray-200">{row.close?.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
