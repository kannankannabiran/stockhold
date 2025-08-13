import { promises as fs } from "fs";
import path from "path";

export async function POST(req) {
  try {
    const { id, status } = await req.json();
    const filePath = path.join(process.cwd(), "data", "purchases.json");

    const fileData = await fs.readFile(filePath, "utf-8");
    const purchases = JSON.parse(fileData);

    const index = purchases.findIndex(order => order.id === id);
    if (index !== -1) {
      purchases[index].status = status;
      await fs.writeFile(filePath, JSON.stringify(purchases, null, 2));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, message: "Order not found" }), { status: 404 });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
