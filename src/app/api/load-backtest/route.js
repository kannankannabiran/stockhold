// app/api/load-backtest/route.js
import fs from "fs";
import path from "path";

export async function GET() {
  const filePath = path.join(process.cwd(), "data", "backtest.json");

  try {
    const file = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(file);
    return Response.json(json);
  } catch (err) {
    return new Response(JSON.stringify({ error: "No saved data" }), {
      status: 404,
    });
  }
}
