"use client";

import React, { useEffect, useState, useRef } from "react";
import { FaSitemap } from "react-icons/fa";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

const indexOptions = ["NIFTY", "BANKNIFTY"];

export default function OptionChain() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [rows, setRows] = useState([]);
  const [atm, setAtm] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = async (sym) => {
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}`);
      const data = await res.json();
      if (!Array.isArray(data)) return setError("API error");

      setRows(data);
      const atmStrike = data[Math.floor(data.length / 2)]?.strikePrice || null;
      setAtm(atmStrike);
      setSelectedStrike(atmStrike);
    } catch (err) {
      setError("Network error");
    }
  };

  useEffect(() => {
    fetchData(symbol);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(symbol), 10000);
    return () => clearInterval(intervalRef.current);
  }, [symbol]);

  const selectedRow = rows.find(r => r.strikePrice === Number(selectedStrike));

  const barChartData = {
    labels: ['Call OI', 'Put OI'],
    datasets: [
      {
        label: 'Open Interest',
        data: selectedRow ? [selectedRow.openInterest || 0, selectedRow.openInterest_PE || 0] : [0, 0],
        backgroundColor: ['#008000', '#f43f5e'],
      },
    ],
  };

  const lineChartData = {
    labels: (() => {
  const result = [];
  let hour = 9;
  let minute = 15;

  while (hour < 15 || (hour === 15 && minute <= 30)) {
    result.push(`${hour}:${minute.toString().padStart(2, '0')}`);
    minute += 15;
    if (minute === 60) {
      hour += 1;
      minute = 0;
    }
  }

  return result;
})(),
    datasets: [
      {
        label: 'Call OI',
        data: [1200, 1300, 1250, 1400, selectedRow?.openInterest || 1500],
        borderColor: '#008000',
        fill: false,
        tension: 0.4,
      },
      {
        label: 'Put OI',
        data: [1000, 1150, 1100, 1200, selectedRow?.openInterest_PE || 1350],
        borderColor: '#f43f5e',
        fill: false,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: false },
    },
  };

  // 👇 Market Direction Logic
  const getDirection = (callOi, putOi) => {
    if (putOi > callOi) return "Bullish";
    if (callOi > putOi) return "Bearish";
    return "Neutral";
  };

  return (
    <div className="p-6 max-w-screen-xl mx-auto bg-white rounded-lg">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-semibold text-gray-800 flex justify-center items-center gap-3">
          <FaSitemap className="text-blue-600" /> {symbol} Option Chain
        </h2>
      </div>

      {/* Dropdowns */}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        <select
          className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          {indexOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50"
          value={selectedStrike || ""}
          onChange={(e) => setSelectedStrike(Number(e.target.value))}
        >
          {rows.map((r) => (
            <option key={r.strikePrice} value={r.strikePrice}>
              {r.strikePrice}
            </option>
          ))}
        </select>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Current OI (4 columns on medium and up) */}
        <div className="md:col-span-3 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">Current OI</h3>
          <div className="h-[460px]"> {/* Set a fixed height */}
            <Bar data={barChartData} options={{ ...chartOptions, maintainAspectRatio: false }} />
          </div>
        </div>

        {/* OI Trend (8 columns on medium and up) */}
        <div className="md:col-span-9 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">OI Trend</h3>
          <Line data={lineChartData} options={chartOptions} />
        </div>
      </div>

      {/* Selected Strike Info */}
      {selectedRow && (
        <div className="mt-8 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-800 text-center">
          <div><strong>Strike:</strong> {selectedRow.strikePrice}</div>
          <div><strong>Call OI:</strong> {selectedRow.openInterest?.toLocaleString()}</div>
          <div><strong>Put OI:</strong> {selectedRow.openInterest_PE?.toLocaleString()}</div>
          <div><strong>Δ Call OI:</strong> {selectedRow.changeinOpenInterest?.toLocaleString()}</div>
          <div><strong>Δ Put OI:</strong> {selectedRow.changeinOpenInterest_PE?.toLocaleString()}</div>
          <div><strong>LTP CE:</strong> ₹{selectedRow.lastPrice}</div>
          <div><strong>LTP PE:</strong> ₹{selectedRow.lastPrice_PE}</div>
          <div><strong>Vol CE:</strong> {selectedRow.totalTradedVolume}</div>
          <div><strong>Vol PE:</strong> {selectedRow.totalTradedVolume_PE}</div>
        </div>
      )}

      {/* Market Direction Table */}
      {rows.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-3 text-center">Market Direction (Based on OI)</h3>
          <div className="overflow-auto">
            <table className="min-w-full text-sm text-center border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-4 py-2">Strike</th>
                  <th className="border px-4 py-2">Call OI</th>
                  <th className="border px-4 py-2">Put OI</th>
                  <th className="border px-4 py-2">Direction</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.strikePrice} className="hover:bg-gray-50">
                    <td className="border px-4 py-1">{row.strikePrice}</td>
                    <td className="border px-4 py-1">{row.openInterest}</td>
                    <td className="border px-4 py-1">{row.openInterest_PE}</td>
                    <td
                      className={`border px-4 py-1 font-semibold ${
                        row.openInterest > row.openInterest_PE
                          ? "text-red-600"
                          : row.openInterest_PE > row.openInterest
                          ? "text-green-600"
                          : "text-gray-500"
                      }`}
                    >
                      {getDirection(row.openInterest, row.openInterest_PE)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-center mt-4">{error}</div>
      )}
    </div>
  );
}
