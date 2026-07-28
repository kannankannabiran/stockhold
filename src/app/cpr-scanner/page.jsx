"use client";
import { useEffect, useState } from "react";

export default function CPRScannerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [selectedIndex, setSelectedIndex] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");

  const fetchScannerData = async (isBackground = false) => {
    if (!isBackground && !data) setLoading(true);
    setIsRefreshing(true);
    try {
      const url = selectedExpiry 
        ? `/api/cpr-scanner?index=${selectedIndex}&expiry=${selectedExpiry}`
        : `/api/cpr-scanner?index=${selectedIndex}`;
        
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch data");
      const json = await res.json();
      
      setData(json);
      
      if (!selectedExpiry && json.expiry) {
        setSelectedExpiry(json.expiry);
      }
      
      setLastUpdated(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" }));
    } catch (err) {
      if (!isBackground) setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchScannerData(false);
    const interval = setInterval(() => fetchScannerData(true), 5000); 
    return () => clearInterval(interval);
  }, [selectedExpiry, selectedIndex]);

  const handleIndexChange = (e) => {
    setSelectedIndex(e.target.value);
    setSelectedExpiry(""); 
    setData(null);         
  };

  const TouchBadge = ({ touches }) => {
    if (!touches || touches.length === 0) return <span className="text-gray-300 text-sm font-medium">—</span>;
    return (
      <div className="flex flex-col gap-1.5 items-center justify-center">
        {touches.map((t, idx) => (
          <div 
            key={idx} 
            className={`flex items-center justify-between w-[120px] px-2 py-1 text-[11px] font-bold rounded-md border ${
              t.level === "Top" ? "bg-green-50 border-green-200 text-green-700 shadow-sm" :
              t.level === "Bottom" ? "bg-red-50 border-red-200 text-red-700 shadow-sm" :
              "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
            }`}
          >
            <span className="uppercase tracking-widest">{t.level}</span>
            <span className="font-mono text-gray-500 bg-white/60 px-1 rounded">{t.time}</span>
          </div>
        ))}
      </div>
    );
  };

  const CPRDisplay = ({ cpr }) => {
    if (!cpr) return <span className="text-gray-300">—</span>;
    return (
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 shadow-inner w-fit mx-auto">
        <div className="flex gap-1.5"><span className="text-gray-400 font-sans font-bold">TC</span><span className="text-gray-700 font-semibold">{cpr.TC}</span></div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5"><span className="text-blue-500 font-sans font-bold">P</span><span className="text-blue-700 font-bold">{cpr.Pivot}</span></div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5"><span className="text-gray-400 font-sans font-bold">BC</span><span className="text-gray-700 font-semibold">{cpr.BC}</span></div>
      </div>
    );
  };

  if (loading || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
      <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-10 h-10 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin"></div>
        <p className="text-gray-500 text-sm font-semibold tracking-wide">Connecting to Market...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-5 rounded-xl max-w-lg text-center shadow-md">
        <svg className="w-8 h-8 mx-auto mb-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <h3 className="font-bold text-lg mb-1">System Error</h3>
        <p className="text-sm font-medium">{error}</p>
      </div>
    </div>
  );

  // SAFE ATM STRIKE COMPUTATION (Prevents empty array crash)
  const atmStrike = data?.rows?.length > 0 
    ? data.rows.reduce((prev, curr) => 
        Math.abs(curr.strike - data.spot) < Math.abs(prev.strike - data.spot) ? curr : prev
      ).strike 
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans selection:bg-yellow-200">
      <div className="w-full mx-auto">
        
        {/* Terminal Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-8 flex flex-col lg:flex-row justify-between items-center gap-6 shadow-sm relative overflow-hidden">
          
          <div className="flex items-center gap-5 z-10">
            <div className="h-12 w-12 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-xl flex items-center justify-center text-yellow-950 shadow-inner">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-800 tracking-tight">CPR Scanner <span className="text-xs font-bold text-white bg-gray-800 px-2.5 py-0.5 rounded ml-1">PRO</span></h1>
              <div className="flex items-center gap-4 mt-1.5 text-sm font-medium">
                
                <select 
                  value={selectedIndex}
                  onChange={handleIndexChange}
                  className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-xs uppercase cursor-pointer transition-all hover:bg-blue-100 shadow-sm tracking-wider"
                >
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>
                
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">Spot <span className="font-mono text-gray-900 bg-gray-100 px-1.5 rounded ml-1">{data.spot}</span></span>
                <span className="text-gray-300">|</span>
                
                <span className="text-gray-500 flex items-center gap-1.5">
                  Exp 
                  <select 
                    value={selectedExpiry || data.expiry}
                    onChange={(e) => setSelectedExpiry(e.target.value)}
                    className="font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-xs font-bold cursor-pointer transition-all hover:bg-gray-100 shadow-sm"
                  >
                    {data.availableExpiries?.map((exp) => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </span>

              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-5 z-10">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 text-green-600 text-xs font-bold tracking-widest uppercase mb-1">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 ${isRefreshing ? 'animate-ping' : ''}`}></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live Market (5s)
              </div>
              <span className="font-mono text-xs text-gray-400">Sync: {lastUpdated}</span>
            </div>
            <button 
              onClick={() => fetchScannerData(false)}
              className="bg-gray-900 hover:bg-gray-800 border border-gray-900 text-white text-sm py-2 px-4 rounded-lg transition-all active:scale-95 flex items-center gap-2 shadow-sm"
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>

        {/* Pro Data Table */}
        <div className="w-full overflow-x-auto pb-10">
          {(!data.rows || data.rows.length === 0) ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 font-semibold">
              No strike data found for {selectedIndex} on expiry {data.expiry}.
            </div>
          ) : (
            <table className="w-full text-center border-separate" style={{ borderSpacing: '0 8px' }}>
              <thead>
                <tr className="text-xs uppercase tracking-widest font-extrabold text-gray-500">
                  <th className="pb-2 w-1/4">Yesterday CPR</th>
                  <th className="pb-2 w-[10%] text-gray-800">LTP</th>
                  <th className="pb-2 w-[15%] text-green-600">CE Touches (9:20 - 3:30)</th>
                  <th className="pb-2 w-[10%] text-gray-400">Strike</th>
                  <th className="pb-2 w-[15%] text-red-600">PE Touches (9:20 - 3:30)</th>
                  <th className="pb-2 w-[10%] text-gray-800">LTP</th>
                  <th className="pb-2 w-1/4">Yesterday CPR</th>
                </tr>
              </thead>
              
              <tbody>
                {data.rows.map((row) => {
                  const isAtm = row.strike === atmStrike;
                  
                  return (
                    <tr 
                      key={row.strike} 
                      className={`group transition-all duration-300 shadow-sm ${
                        isAtm 
                          ? "bg-yellow-50 relative z-10" 
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <td className={`py-4 px-2 rounded-l-xl border-y border-l ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <CPRDisplay cpr={row.CE?.cpr} />
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <span className={`text-[17px] font-black ${isAtm ? 'text-green-700' : 'text-green-600'}`}>
                          {row.CE?.ltp || "-"}
                        </span>
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 bg-green-50/30 group-hover:border-gray-300'}`}>
                        <TouchBadge touches={row.CE?.touches} />
                      </td>

                      <td className={`py-4 px-2 relative border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <div className={`mx-auto w-24 py-1.5 rounded-lg flex flex-col items-center justify-center font-black text-lg tracking-tight transition-all
                          ${isAtm 
                            ? "bg-yellow-400 text-yellow-950 shadow-md ring-2 ring-yellow-200 ring-offset-2" 
                            : "bg-gray-100 text-gray-800 border border-gray-200 group-hover:bg-gray-200"
                          }`}
                        >
                          {isAtm && (
                            <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-yellow-900 text-yellow-100 px-2 py-0.5 rounded shadow-sm border border-yellow-700">
                              ATM
                            </span>
                          )}
                          {row.strike}
                        </div>
                      </td>

                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 bg-red-50/30 group-hover:border-gray-300'}`}>
                        <TouchBadge touches={row.PE?.touches} />
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <span className={`text-[17px] font-black ${isAtm ? 'text-red-700' : 'text-red-600'}`}>
                          {row.PE?.ltp || "-"}
                        </span>
                      </td>
                      <td className={`py-4 px-2 rounded-r-xl border-y border-r ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <CPRDisplay cpr={row.PE?.cpr} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        
      </div>
    </div>
  );
}