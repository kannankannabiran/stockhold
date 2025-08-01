'use client'
import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  CandlestickSeries
} from "lightweight-charts";
import { FaToggleOn, FaToggleOff, FaTimes } from "react-icons/fa";

// ----------- INDICATOR LOGIC -----------
const EMA_PERIODS = [12, 26, 50, 100, 200];
const INDICATORS = [
  ...EMA_PERIODS.map((p) => ({ type: "ema", period: p })),
  { type: "bb", period: 20 } // standard BB
];
const EMA_COLORS = {
  12: "lightblue",
  26: "blue",
  50: "green",
  100: "orange",
  200: "red"
};
const BB_COLORS = {
  upper: "red",
  middle: "gray",
  lower: "blue"
};

function calculateEMA(data, length) {
  const ema = [];
  let multiplier = 2 / (length + 1);
  let prevEMA = null;
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    if (typeof bar.close !== "number" || isNaN(bar.close)) {
      ema.push({ time: bar.time, value: null });
      continue;
    }
    if (i < length - 1) {
      ema.push({ time: bar.time, value: null });
      continue;
    }
    if (prevEMA === null) {
      const sum = data
        .slice(i - length + 1, i + 1)
        .reduce((acc, b) => acc + b.close, 0);
      prevEMA = sum / length;
    } else {
      prevEMA = (bar.close - prevEMA) * multiplier + prevEMA;
    }
    ema.push({ time: bar.time, value: prevEMA });
  }
  return ema;
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const bands = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      bands.push({
        time: data[i].time,
        upper: null,
        middle: null,
        lower: null
      });
      continue;
    }
    const window = data.slice(i - period + 1, i + 1);
    const closes = window.map((bar) => bar.close);
    const mean = closes.reduce((a, b) => a + b, 0) / period;
    const variance =
      closes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdev = Math.sqrt(variance);
    bands.push({
      time: data[i].time,
      upper: mean + multiplier * stdev,
      middle: mean,
      lower: mean - multiplier * stdev
    });
  }
  return bands;
}

// ------------ INDICATOR PANEL -----------
function IndicatorPanel({
  activeIndicators,
  onAdd,
  onToggle,
  onRemove
}) {
  // Only show indicators not already active
  const availableIndicators = INDICATORS.filter(
    ind =>
      !activeIndicators.some(
        ai => ai.type === ind.type && ai.period === ind.period
      )
  );

  const handleAdd = e => {
    const value = e.target.value;
    if (!value) return;
    const [type, period] = value.split("-");
    onAdd({ type, period: Number(period) });
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ margin: "10px" }}>
        <select onChange={handleAdd} defaultValue="">
          <option value="">Add Indicator</option>
          {availableIndicators.map(ind => (
            <option
              key={`${ind.type}-${ind.period}`}
              value={`${ind.type}-${ind.period}`}
            >
              {ind.type === "ema"
                ? `EMA ${ind.period}`
                : `Bollinger Bands ${ind.period}`}
            </option>
          ))}
        </select>
      </div>
      <div
        style={{
          margin: "10px 0",
          display: "flex",
          flexWrap: "wrap"
        }}
      >
        {activeIndicators.map(({ type, period, visible }) => (
          <div
            key={`${type}-${period}`}
            style={{
              display: "flex",
              alignItems: "center",
              background: "#f4f4f8",
              padding: "6px 12px",
              borderRadius: "16px",
              marginRight: 16,
              marginBottom: 10,
              fontSize: 15,
              boxShadow: visible
                ? `0 0 0 2px ${
                    type === "ema"
                      ? EMA_COLORS[period]
                      : BB_COLORS.middle
                  }55`
                : "none"
            }}
          >
            <span
              style={{
                color: type === "ema" ? EMA_COLORS[period] : "#444",
                fontWeight: 700,
                marginRight: 8
              }}
            >
              {type === "ema"
                ? `EMA ${period}`
                : `Bollinger ${period}`}
            </span>
            <button
              onClick={() => onToggle(type, period)}
              aria-label="Show/hide"
              style={{
                background: "white",
                color:
                  visible && type === "ema"
                    ? EMA_COLORS[period]
                    : visible && type === "bb"
                    ? BB_COLORS.middle
                    : "#b0b0b0",
                border: `2px solid ${
                  visible && type === "ema"
                    ? EMA_COLORS[period]
                    : visible && type === "bb"
                    ? BB_COLORS.middle
                    : "#e0e0e0"
                }`,
                borderRadius: "50%",
                width: 32,
                height: 32,
                marginRight: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s, color 0.2s",
                cursor: "pointer",
                fontSize: 17
              }}
            >
              {visible ? <FaToggleOn /> : <FaToggleOff />}
            </button>
            <button
              onClick={() => onRemove(type, period)}
              title="Remove"
              style={{
                background: "transparent",
                border: "none",
                color: "#888",
                borderRadius: "50%",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                marginLeft: 2,
                cursor: "pointer",
                fontSize: 18,
                transition: "color 0.2s, background 0.2s"
              }}
              onMouseOver={e => (e.currentTarget.style.color = "#d32f2f")}
              onMouseOut={e => (e.currentTarget.style.color = "#888")}
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------- MAIN CHART COMPONENT -----------
const TradingViewChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);

  // Series refs for the indicators
  const emaSeriesMapRef = useRef({});
  const bbSeriesMapRef = useRef({}); // {20: {upper, middle, lower}}

  // [{ type: 'ema'|'bb', period: number, visible: true }]
  const [activeIndicators, setActiveIndicators] = useState([]);

  // Chart and series setup
  useEffect(() => {
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        textColor: "black",
        background: { type: "solid", color: "white" }
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false }
      }
    });
    chartRef.current = chart;
    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries);

    // Prepare series for EMAs
    EMA_PERIODS.forEach((period) => {
      emaSeriesMapRef.current[period] = chart.addSeries(LineSeries, {
        color: EMA_COLORS[period],
        lineWidth: 2,
        priceLineVisible: false
      });
    });

    // BB bands only: for each unique BB period you want, create three line series
    bbSeriesMapRef.current[20] = {
      upper: chart.addSeries(LineSeries, {
        color: BB_COLORS.upper,
        lineWidth: 1
      }),
      middle: chart.addSeries(LineSeries, {
        color: BB_COLORS.middle,
        lineWidth: 1,
        lineStyle: 1
      }),
      lower: chart.addSeries(LineSeries, {
        color: BB_COLORS.lower,
        lineWidth: 1
      })
    };

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Update price series and indicators
  useEffect(() => {
    if (!data || data.length === 0)
      return;
    candlestickSeriesRef.current.setData(data);

    // Update EMA
    EMA_PERIODS.forEach(period => {
      const emaState = activeIndicators.find(
        ai => ai.type === "ema" && ai.period === period && ai.visible
      );
      const series = emaSeriesMapRef.current[period];
      if (emaState && series) {
        const emaData = calculateEMA(data, period);
        series.setData(emaData.filter(pt => pt.value !== null));
      } else if (series) {
        series.setData([]);
      }
    });

    // Update Bollinger Bands (only BB 20 in this example)
    const bbState = activeIndicators.find(
      ai => ai.type === "bb" && ai.period === 20 && ai.visible
    );
    const bbSeries = bbSeriesMapRef.current[20];
    if (bbState && bbSeries) {
      const bands = calculateBollingerBands(data, 20, 2);
      bbSeries.upper.setData(
        bands.filter(b => b.upper !== null).map(({ time, upper }) => ({ time, value: upper }))
      );
      bbSeries.middle.setData(
        bands.filter(b => b.middle !== null).map(({ time, middle }) => ({ time, value: middle }))
      );
      bbSeries.lower.setData(
        bands.filter(b => b.lower !== null).map(({ time, lower }) => ({ time, value: lower }))
      );
    } else if (bbSeries) {
      bbSeries.upper.setData([]);
      bbSeries.middle.setData([]);
      bbSeries.lower.setData([]);
    }
  }, [data, activeIndicators]);

  // Panel handler logic
  const handleAddIndicator = (indicator) => {
    setActiveIndicators([
      ...activeIndicators,
      { ...indicator, visible: true }
    ]);
  };
  const handleToggleIndicator = (type, period) => {
    setActiveIndicators(inds =>
      inds.map(i =>
        i.type === type && i.period === period
          ? { ...i, visible: !i.visible }
          : i
      )
    );
  };
  const handleRemoveIndicator = (type, period) => {
    setActiveIndicators(inds =>
      inds.filter(i => !(i.type === type && i.period === period))
    );
  };

  return (
    <div>
      <IndicatorPanel
        activeIndicators={activeIndicators}
        onAdd={handleAddIndicator}
        onToggle={handleToggleIndicator}
        onRemove={handleRemoveIndicator}
      />
      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height: "600px"
        }}
      />
    </div>
  );
};

export default TradingViewChart;
