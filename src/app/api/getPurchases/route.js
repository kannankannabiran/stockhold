import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "purchases.json");
    const fileData = await fs.readFile(filePath, "utf-8");
    const purchases = JSON.parse(fileData);
    return new Response(JSON.stringify(purchases), { status: 200 });
  } catch {
    return new Response(JSON.stringify([]), { status: 200 });
  }
}
