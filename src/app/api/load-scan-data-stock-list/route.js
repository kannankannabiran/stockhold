import db from '@/lib/db';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = searchParams.get("mobile");
    if (!mobile) {
      return new Response(JSON.stringify({ error: "Missing mobile" }), { status: 400 });
    }

    const row = db.prepare('SELECT stock_list, results FROM stock_lists WHERE mobile = ?').get(mobile);

    if (!row) {
      return new Response(JSON.stringify({ stockList: [], results: {} }), { status: 200 });
    }

    return new Response(JSON.stringify({
      stockList: JSON.parse(row.stock_list),
      results: JSON.parse(row.results),
    }), { status: 200 });
  } catch (error) {
    console.error("Error loading stock list:", error);
    return new Response(JSON.stringify({ stockList: [] }), { status: 200 });
  }
}