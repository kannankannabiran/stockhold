import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'longterm.json');
    const data = await readFile(filePath, 'utf-8');
    return new Response(data, { status: 200 });
  } catch (error) {
    console.error('Error reading scan data:', error);
    return new Response(JSON.stringify([]), { status: 200 });
  }
}