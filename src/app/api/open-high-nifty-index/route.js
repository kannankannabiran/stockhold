// /app/api/nifty/route.js

export async function GET() {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/^NSEI?interval=1d&range=1mo'
  );

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), { status: 500 });
  }

  const json = await res.json();

  const timestamps = json.chart.result[0].timestamp;
  const ohlc = json.chart.result[0].indicators.quote[0];

  const data = timestamps.map((time, index) => ({
    date: new Date(time * 1000).toISOString().split('T')[0],
    open: ohlc.open[index],
    high: ohlc.high[index],
    low: ohlc.low[index],
    close: ohlc.close[index],
  }));

  return Response.json(data);
}
