import db from "@/lib/db";

export async function POST(req) {
  try {
    const newPurchase = await req.json();
    const id = String(Date.now());
    const date = new Date().toISOString();

    db.prepare(`
      INSERT INTO purchase_orders (id, title, price, mobile, date, status, product_id, timestamp)
      VALUES (@id, @title, @price, @mobile, @date, @status, @productId, @timestamp)
    `).run({
      id,
      title: newPurchase.title ?? null,
      price: newPurchase.price ?? null,
      mobile: newPurchase.mobile ?? null,
      date,
      status: "pending",
      productId: newPurchase.productId ?? null,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({ success: true, id }), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}