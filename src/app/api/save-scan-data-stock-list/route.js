import { writeFile, readFile } from 'fs/promises';
import path from 'path';

export async function POST(req) {
  try {
    const data = await req.json();
    const { browserId, stockList, results } = data;

    if (!browserId) {
      return new Response(JSON.stringify({ error: "Missing browserId" }), { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'data', `stocklist-${browserId}.json`);

    let existing = {};
    try {
      const file = await readFile(filePath, 'utf-8');
      existing = JSON.parse(file);
    } catch (_) {}

    const merged = {
      results: results || existing.results || {},
      stockList: stockList || existing.stockList || [],
    };

    await writeFile(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error saving scan data:", error);
    return new Response(JSON.stringify({ error: "Failed to save data" }), { status: 500 });
  }
}
