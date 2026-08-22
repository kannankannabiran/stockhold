import db from "./db";

export const DESKTOP_PRODUCT = "desktop";
const PURCHASE_MSG = "Purchase product";

const getStmt = db.prepare(
  "SELECT * FROM licenses WHERE mobile = ? AND product = ?"
);
const upsertStmt = db.prepare(`
  INSERT INTO licenses (mobile, product, status, updated_at)
  VALUES (@mobile, @product, @status, @updated_at)
  ON CONFLICT(mobile, product) DO UPDATE SET
    status = excluded.status,
    updated_at = excluded.updated_at
`);

export function licensePayload(mobile) {
  const row = getStmt.get(mobile, DESKTOP_PRODUCT);
  const status =
    row?.status === "active" || row?.status === "revoked" ? row.status : "none";
  const active = status === "active";
  return {
    active,
    status,
    message: active ? "" : PURCHASE_MSG,
    product: DESKTOP_PRODUCT,
  };
}

export function setDesktopLicense(mobile, action) {
  const status = action === "activate" ? "active" : "revoked";
  upsertStmt.run({
    mobile,
    product: DESKTOP_PRODUCT,
    status,
    updated_at: new Date().toISOString(),
  });
  return { mobile, ...licensePayload(mobile) };
}
