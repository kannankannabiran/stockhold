import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST(req) {
  try {
    const data = await req.json();
    const filePath = path.join(process.cwd(), 'data', 'longterm.json');

    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Error saving scan data:', error);
    return new Response(JSON.stringify({ error: 'Failed to save data' }), { status: 500 });
  }
}