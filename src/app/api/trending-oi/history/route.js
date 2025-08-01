import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${symbol}.json`);

  try {
    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    const fileData = fs.readFileSync(filePath, "utf8");
    const parsedData = JSON.parse(fileData);

    return new Response(JSON.stringify(parsedData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error reading history file:", err);
    return new Response(JSON.stringify({ error: "Error reading file" }), {
      status: 500,
    });
  }
}
