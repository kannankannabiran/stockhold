import db from "@/lib/db";

export async function GET() {
  try {
    const orders = db
      .prepare(`
        SELECT id, title, price, mobile, date, status, product_id AS productId
        FROM purchase_orders
      `)
      .all();
    return new Response(JSON.stringify(orders), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}