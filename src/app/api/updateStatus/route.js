import db from "@/lib/db";

export async function POST(req) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return new Response(
        JSON.stringify({ success: false, message: "id and status are required" }),
        { status: 400 }
      );
    }

    const result = db
      .prepare(`UPDATE purchase_orders SET status = ? WHERE id = ?`)
      .run(status, id);

    if (result.changes === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Order not found" }),
        { status: 404 }
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}