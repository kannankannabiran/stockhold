import fs from "fs";
import path from "path";

const BASE = path.resolve("./store");
const SYMBOLS_DIR = path.join(BASE, "symbols");
const INDEX_PATH = path.join(BASE, "index.json");

// ensure directories
function ensureDirs() {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE);
  if (!fs.existsSync(SYMBOLS_DIR)) fs.mkdirSync(SYMBOLS_DIR);
}

function safeReadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.warn("Failed to parse", filePath, e);
    return null;
  }
}

function safeWriteJSON(filePath, obj) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write", filePath, e);
  }
}

// Per-symbol operations
export function readSymbol(symbol) {
  ensureDirs();
  const file = path.join(SYMBOLS_DIR, `${symbol}.json`);
  const data = safeReadJSON(file);
  if (data) return data;
  return { data: [], lastScanDate: null, latestResult: null };
}

export function writeSymbol(symbol, entry) {
  ensureDirs();
  const file = path.join(SYMBOLS_DIR, `${symbol}.json`);
  safeWriteJSON(file, entry);
  // also update index summary
  const index = readIndex();
  index[symbol] = entry.latestResult || null;
  writeIndex(index);
}

// Index operations
export function readIndex() {
  ensureDirs();
  const idx = safeReadJSON(INDEX_PATH);
  return idx || {}; // { symbol: latestResult }
}

export function writeIndex(indexObj) {
  ensureDirs();
  safeWriteJSON(INDEX_PATH, indexObj);
}
