import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const browserId = searchParams.get("browserId");

    if (!browserId) {
      return new Response(JSON.stringify({ error: "Missing browserId" }), { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'data', `stocklist-${browserId}.json`);
    const file = await readFile(filePath, 'utf-8');
    const data = JSON.parse(file);

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ stockList: [] }), { status: 200 });
  }
}
