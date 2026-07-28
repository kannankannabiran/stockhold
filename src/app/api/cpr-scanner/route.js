import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";
import { INDEX_CONFIG } from "../../../lib/optionChainCore";

let memoryCache = {}; 
const CACHE_TTL = 4500; 

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const reqExpiry = searchParams.get("expiry") || ""; 

  const cacheKey = `${indexKey}_${reqExpiry}`;

  if (memoryCache[cacheKey] && Date.now() - memoryCache[cacheKey].timestamp < CACHE_TTL && memoryCache[cacheKey].data) {
    return NextResponse.json({ ...memoryCache[cacheKey].data, cached: true });
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
    const spot = spotQuote?.[cfg.spotSymbol]?.last_price;
    if (!spot) throw new Error("Could not fetch spot price");

    const exchangeSegment = cfg.exchange || (indexKey === "SENSEX" ? "BSE" : "NFO");
    const allInstruments = await kc.getInstruments([exchangeSegment]);
    
    // Fallback spot token retrieval
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

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 5);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);
    const actualTodayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    // Fetch Spot Historical Data & Calculate Spot CPR / Touches
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
          const prevDateStr = dates.filter((d) => d !== actualTodayStr).pop();
          
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
          if (byDate[actualTodayStr]) {
            const todayCandles = byDate[actualTodayStr]
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
            const prevDateStr = dates.filter((d) => d !== actualTodayStr).pop();
            
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
            
            if (byDate[actualTodayStr]) {
              const todayCandles = byDate[actualTodayStr]
                .filter((c) => {
                  const timeStr = new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" });
                  return timeStr >= "09:20:00" && timeStr <= "15:30:00";
                })
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

              if (byDate[actualTodayStr].length > 0) {
                ltp = byDate[actualTodayStr][byDate[actualTodayStr].length - 1].close;
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
      await sleep(350);
    }

    const rows = Object.values(resultsByStrike).sort((a, b) => a.strike - b.strike);
    
    const finalData = { spot, index: indexKey, expiry, availableExpiries: expiries, rows, spotData, updatedAt: new Date().toISOString() };
    
    memoryCache[cacheKey] = { timestamp: Date.now(), data: finalData };
    if (!reqExpiry) {
      memoryCache[`${indexKey}_`] = { timestamp: Date.now(), data: finalData };
    }

    return NextResponse.json({ ...finalData, cached: false });
  } catch (err) {
    return NextResponse.json({ error: "fetch_failed", message: err.message }, { status: 500 });
  }
}