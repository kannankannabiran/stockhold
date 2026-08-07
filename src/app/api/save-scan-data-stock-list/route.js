import db from '@/lib/db';

export async function POST(req) {
  try {
    const data = await req.json();
    const { mobile, stockList, results } = data;

    if (!mobile) {
      return new Response(JSON.stringify({ error: "Missing mobile" }), { status: 400 });
    }

    const existing = db.prepare('SELECT stock_list, results FROM stock_lists WHERE mobile = ?').get(mobile);

    const merged = {
      stockList: stockList !== undefined ? stockList : (existing ? JSON.parse(existing.stock_list) : []),
      results: results !== undefined ? results : (existing ? JSON.parse(existing.results) : {}),
    };

    db.prepare(`
      INSERT INTO stock_lists (mobile, stock_list, results, updated_at)
      VALUES (@mobile, @stock_list, @results, @updated_at)
      ON CONFLICT(mobile) DO UPDATE SET
        stock_list = excluded.stock_list,
        results = excluded.results,
        updated_at = excluded.updated_at
    `).run({
      mobile,
      stock_list: JSON.stringify(merged.stockList),
      results: JSON.stringify(merged.results),
      updated_at: Date.now(),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error saving stock list:", error);
    return new Response(JSON.stringify({ error: "Failed to save data" }), { status: 500 });
  }
}