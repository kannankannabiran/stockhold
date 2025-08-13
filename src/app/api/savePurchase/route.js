import { promises as fs } from "fs";
import path from "path";

export async function POST(req) {
  try {
    const newPurchase = await req.json();
    const filePath = path.join(process.cwd(), "data", "purchases.json");

    // Ensure purchases.json exists
    try {
      await fs.access(filePath);
    } catch {
      await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify([], null, 2));
    }

    const fileData = await fs.readFile(filePath, "utf-8");
    const purchases = JSON.parse(fileData);

    purchases.push({
      ...newPurchase,
      id: Date.now(),
      date: new Date().toISOString(),
      status: "pending"
    });

    await fs.writeFile(filePath, JSON.stringify(purchases, null, 2));

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
