import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";
import { INDEX_CONFIG } from "../../../lib/optionChainCore";
import db from "../../../lib/db"; // Import your SQLite db connection

let instrumentCache = {}; 
const INSTRUMENT_TTL = 3600000; // 1 hour

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function batch(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function calculateCPR(high, low, close) {
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = (pivot - bc) + pivot;
  return {
    TC: Number(Math.max(tc, bc).toFixed(2)),
    Pivot: Number(pivot.toFixed(2)),
    BC: Number(Math.min(tc, bc).toFixed(2)),
  };
}

async function getCachedInstruments(kc, exchangeSegment) {
  const now = Date.now();
  if (instrumentCache[exchangeSegment] && now - instrumentCache[exchangeSegment].timestamp < INSTRUMENT_TTL) {
    return instrumentCache[exchangeSegment].data;
  }
  const instruments = await kc.getInstruments([exchangeSegment]);
  instrumentCache[exchangeSegment] = { timestamp: now, data: instruments };
  return instruments;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const reqExpiry = searchParams.get("expiry") || ""; 
  const reqDate = searchParams.get("date") || ""; 

  const istTodayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const targetDateStr = reqDate || istTodayStr;

  // 1. Check SQLite DB first for past dates to load instantly
  if (targetDateStr !== istTodayStr && reqExpiry) {
    const cachedRows = db.prepare(`
      SELECT * FROM cpr_scanner_snapshots 
      WHERE index_key = ? AND expiry = ? AND date = ?
      ORDER BY strike ASC
    `).all(indexKey, reqExpiry, targetDateStr);

    if (cachedRows.length > 0) {
      const rows = cachedRows.map(r => ({
        strike: r.strike,
        CE: {
          symbol: r.ce_symbol,
          ltp: r.ce_ltp,
          cpr: r.ce_cpr_tc ? { TC: r.ce_cpr_tc, Pivot: r.ce_cpr_pivot, BC: r.ce_cpr_bc } : null,
          touches: r.ce_touches ? JSON.parse(r.ce_touches) : []
        },
        PE: {
          symbol: r.pe_symbol,
          ltp: r.pe_ltp,
          cpr: r.pe_cpr_tc ? { TC: r.pe_cpr_tc, Pivot: r.pe_cpr_pivot, BC: r.pe_cpr_bc } : null,
          touches: r.pe_touches ? JSON.parse(r.pe_touches) : []
        }
      }));

      const spotData = cachedRows[0].spot_data ? JSON.parse(cachedRows[0].spot_data) : null;
      const spot = cachedRows[0].spot;

      const expiriesQuery = db.prepare(`SELECT DISTINCT expiry FROM cpr_scanner_snapshots WHERE index_key = ?`).all(indexKey);
      const availableExpiries = expiriesQuery.map(e => e.expiry);

      return NextResponse.json({
        spot,
        index: indexKey,
        expiry: reqExpiry,
        date: targetDateStr,
        availableExpiries,
        rows,
        spotData,
        cached: true,
        source: "sqlite"
      });
    }
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const kc = newClient(accessToken);
  const cfg = INDEX_CONFIG[indexKey];

  try {
    const spotQuote = await kc.getQuote([cfg.spotSymbol]);
    let spot = spotQuote?.[cfg.spotSymbol]?.last_price;
    if (!spot) throw new Error("Could not fetch spot price");

    const exchangeSegment = cfg.exchange || (indexKey === "SENSEX" ? "BSE" : "NFO");
    const allInstruments = await getCachedInstruments(kc, exchangeSegment);
    
    let spotToken = spotQuote?.[cfg.spotSymbol]?.instrument_token;
    if (!spotToken) {
      const spotInst = allInstruments.find(i => i.tradingsymbol === cfg.spotSymbol || (i.name === cfg.name && (i.instrument_type === "EQ" || i.instrument_type === "IND")));
      spotToken = spotInst?.instrument_token;
    }

    const indexOpts = allInstruments.filter(
      (i) => i.name === cfg.name && (i.instrument_type === "CE" || i.instrument_type === "PE")
    );
    
    const expiries = Array.from(new Set(indexOpts.map((i) => i.expiry.toISOString().slice(0, 10)))).sort();
    
    let expiry = expiries[0];
    if (reqExpiry && expiries.includes(reqExpiry)) {
      expiry = reqExpiry;
    }

    const chainOpts = indexOpts.filter((i) => i.expiry.toISOString().slice(0, 10) === expiry);
    const uniqueStrikes = Array.from(new Set(chainOpts.map((i) => i.strike))).sort((a, b) => a - b);
    
    let atmIndex = 0, atmDist = Infinity;
    uniqueStrikes.forEach((s, idx) => {
      const d = Math.abs(s - spot);
      if (d < atmDist) {
        atmDist = d;
        atmIndex = idx;
      }
    });

    const startIdx = Math.max(0, atmIndex - 4);
    const endIdx = Math.min(uniqueStrikes.length, atmIndex + 5);
    const targetStrikes = new Set(uniqueStrikes.slice(startIdx, endIdx));
    const targetOpts = chainOpts.filter((o) => targetStrikes.has(o.strike));

    const targetDateObj = new Date(targetDateStr);
    const fromDate = new Date(targetDateObj);
    fromDate.setDate(fromDate.getDate() - 10);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = targetDateStr;

    let spotData = null;
    if (spotToken) {
      try {
        const spotCandles = await kc.getHistoricalData(spotToken, "minute", fromStr, toStr, false, 0);
        if (spotCandles && spotCandles.length > 0) {
          const byDate = {};
          spotCandles.forEach((c) => {
            const dStr = new Date(c.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            if (!byDate[dStr]) byDate[dStr] = [];
            byDate[dStr].push(c);
          });
          const dates = Object.keys(byDate).sort();
          const prevDateStr = dates.filter((d) => d < targetDateStr).pop();
          
          let cpr = null;
          if (prevDateStr && byDate[prevDateStr]) {
            const prevCandles = byDate[prevDateStr];
            let pHigh = -Infinity, pLow = Infinity, pClose = prevCandles[prevCandles.length - 1].close;
            prevCandles.forEach((c) => {
              if (c.high > pHigh) pHigh = c.high;
              if (c.low < pLow) pLow = c.low;
            });
            cpr = calculateCPR(pHigh, pLow, pClose);
          }

          const touches = [];
          if (byDate[targetDateStr]) {
            const todayCandles = byDate[targetDateStr]
              .filter((c) => {
                const timeStr = new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" });
                return timeStr >= "09:20:00" && timeStr <= "15:30:00";
              })
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            if (todayCandles.length > 0 && cpr) {
              let hitTC = false, hitPivot = false, hitBC = false;
              for (const c of todayCandles) {
                const tStr = new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: '2-digit', minute:'2-digit' });
                if (!hitTC && cpr.TC <= c.high && cpr.TC >= c.low) {
                  hitTC = true; touches.push({ level: "Top", time: tStr });
                }
                if (!hitPivot && cpr.Pivot <= c.high && cpr.Pivot >= c.low) {
                  hitPivot = true; touches.push({ level: "Pivot", time: tStr });
                }
                if (!hitBC && cpr.BC <= c.high && cpr.BC >= c.low) {
                  hitBC = true; touches.push({ level: "Bottom", time: tStr });
                }
                if (hitTC && hitPivot && hitBC) break;
              }
            }
            spot = byDate[targetDateStr][byDate[targetDateStr].length - 1].close;
          }
          spotData = { ltp: spot, cpr, touches };
        }
      } catch (err) {
        console.error("Failed historical fetch for spot", err);
      }
    }

    const resultsByStrike = {};
    const batches = batch(targetOpts, 3);
    for (const chunk of batches) {
      await Promise.all(
        chunk.map(async (opt) => {
          try {
            const candles = await kc.getHistoricalData(opt.instrument_token, "minute", fromStr, toStr, false, 0);
            if (!candles || candles.length === 0) return;

            const byDate = {};
            candles.forEach((c) => {
              const dStr = new Date(c.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
              if (!byDate[dStr]) byDate[dStr] = [];
              byDate[dStr].push(c);
            });

            const dates = Object.keys(byDate).sort();
            const prevDateStr = dates.filter((d) => d < targetDateStr).pop();
            
            let cpr = null;
            if (prevDateStr && byDate[prevDateStr]) {
              const prevCandles = byDate[prevDateStr];
              let pHigh = -Infinity, pLow = Infinity, pClose = prevCandles[prevCandles.length - 1].close;
              prevCandles.forEach((c) => {
                if (c.high > pHigh) pHigh = c.high;
                if (c.low < pLow) pLow = c.low;
              });
              cpr = calculateCPR(pHigh, pLow, pClose);
            }

            const touches = [];
            let ltp = null;
            
            if (byDate[targetDateStr]) {
              const todayCandles = byDate[targetDateStr]
                .filter((c) => {
                  const timeStr = new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" });
                  return timeStr >= "09:20:00" && timeStr <= "15:30:00";
                })
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

              if (byDate[targetDateStr].length > 0) {
                ltp = byDate[targetDateStr][byDate[targetDateStr].length - 1].close;
              }

              if (todayCandles.length > 0 && cpr) {
                let hitTC = false, hitPivot = false, hitBC = false;
                for (const c of todayCandles) {
                  const tStr = new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: '2-digit', minute:'2-digit' });
                  if (!hitTC && cpr.TC <= c.high && cpr.TC >= c.low) {
                    hitTC = true; touches.push({ level: "Top", time: tStr });
                  }
                  if (!hitPivot && cpr.Pivot <= c.high && cpr.Pivot >= c.low) {
                    hitPivot = true; touches.push({ level: "Pivot", time: tStr });
                  }
                  if (!hitBC && cpr.BC <= c.high && cpr.BC >= c.low) {
                    hitBC = true; touches.push({ level: "Bottom", time: tStr });
                  }
                  if (hitTC && hitPivot && hitBC) break;
                }
              }
            }

            const side = opt.instrument_type;
            if (!resultsByStrike[opt.strike]) resultsByStrike[opt.strike] = { strike: opt.strike };
            resultsByStrike[opt.strike][side] = { symbol: opt.tradingsymbol, ltp, cpr, touches };

          } catch (err) {
            console.error(`Failed historical fetch for ${opt.tradingsymbol}`, err);
          }
        })
      );
      await sleep(200);
    }

    const rows = Object.values(resultsByStrike).sort((a, b) => a.strike - b.strike);

    // Save fetched results into SQLite DB in a high-speed transaction
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO cpr_scanner_snapshots 
      (id, index_key, expiry, date, strike, spot, ce_symbol, ce_ltp, ce_cpr_tc, ce_cpr_pivot, ce_cpr_bc, ce_touches, pe_symbol, pe_ltp, pe_cpr_tc, pe_cpr_pivot, pe_cpr_bc, pe_touches, spot_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saveToDb = db.transaction((rowsData) => {
      for (const row of rowsData) {
        const rowId = `${indexKey}_${expiry}_${targetDateStr}_${row.strike}`;
        insertStmt.run(
          rowId,
          indexKey,
          expiry,
          targetDateStr,
          row.strike,
          spot,
          row.CE?.symbol || null,
          row.CE?.ltp || null,
          row.CE?.cpr?.TC || null,
          row.CE?.cpr?.Pivot || null,
          row.CE?.cpr?.BC || null,
          JSON.stringify(row.CE?.touches || []),
          row.PE?.symbol || null,
          row.PE?.ltp || null,
          row.PE?.cpr?.TC || null,
          row.PE?.cpr?.Pivot || null,
          row.PE?.cpr?.BC || null,
          JSON.stringify(row.PE?.touches || []),
          JSON.stringify(spotData),
          Date.now()
        );
      }
    });

    saveToDb(rows);

    const finalData = { spot, index: indexKey, expiry, date: targetDateStr, availableExpiries: expiries, rows, spotData, updatedAt: new Date().toISOString() };
    return NextResponse.json({ ...finalData, cached: false });
  } catch (err) {
    return NextResponse.json({ error: "fetch_failed", message: err.message }, { status: 500 });
  }
}