import axios from "axios";
import fs from "fs";
import path from "path";
import { authenticator } from "otplib";
import { KiteConnect } from "kiteconnect";

/**
 * Automates Zerodha Kite's web login (user_id + password + TOTP)
 * to obtain a request_token, then exchanges it for an access_token
 * using the official kiteconnect SDK — no browser/Selenium needed.
 *
 * Requires TOTP-based 2FA to be enabled on the Kite account
 * (Settings > Password & security > External TOTP app).
 * SMS/App-push OTP cannot be automated this way.
 */

const KITE_LOGIN_URL = "https://kite.zerodha.com/api/login";
const KITE_TWOFA_URL = "https://kite.zerodha.com/api/twofa";
const KITE_CONNECT_URL = "https://kite.zerodha.com/connect/login";
const KITE_ROOT_URL = "https://kite.zerodha.com/";
const DEBUG = process.env.KITE_AUTOLOGIN_DEBUG === "1";

// Real browser headers — Zerodha's servers appear to treat requests without
// these as non-browser traffic and quietly fall back to serving the login
// page instead of authenticating, even with valid session cookies.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://kite.zerodha.com",
  Referer: "https://kite.zerodha.com/",
};

function log(...args) {
  if (DEBUG) console.log("[auto-login]", ...args);
}

const TOTP_STATE_PATH = path.join(process.cwd(), "data", "totp-state.json");
const TOTP_STEP_SECONDS = 30;

function currentTotpStep() {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
}

function readLastUsedStep() {
  try {
    return JSON.parse(fs.readFileSync(TOTP_STATE_PATH, "utf-8")).step;
  } catch {
    return null;
  }
}

function writeLastUsedStep(step) {
  fs.mkdirSync(path.dirname(TOTP_STATE_PATH), { recursive: true });
  fs.writeFileSync(TOTP_STATE_PATH, JSON.stringify({ step }));
}

/**
 * Kite rejects a TOTP code that's already been submitted once within the
 * same 30s window (replay protection) — this bites reconnect attempts that
 * happen back-to-back. If the code we're about to use matches the one from
 * the last successful/attempted login, wait for the next window instead of
 * sending a code we know will be rejected.
 */
async function ensureFreshTotpWindow() {
  const lastStep = readLastUsedStep();
  const nowStep = currentTotpStep();
  if (lastStep === nowStep) {
    const msIntoStep = Date.now() % (TOTP_STEP_SECONDS * 1000);
    const waitMs = TOTP_STEP_SECONDS * 1000 - msIntoStep + 250; // small buffer
    await new Promise((r) => setTimeout(r, waitMs));
  }
  writeLastUsedStep(currentTotpStep());
}

function buildJar() {
  const store = {};
  return {
    set(setCookieHeaders = []) {
      for (const raw of setCookieHeaders) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx > -1) {
          store[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        }
      }
    },
    header() {
      return Object.entries(store)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
  };
}

export async function autoLogin({
  userId = process.env.KITE_USER_ID,
  password = process.env.KITE_PASSWORD,
  totpSecret = process.env.KITE_TOTP_SECRET,
  apiKey = process.env.KITE_API_KEY,
  apiSecret = process.env.KITE_API_SECRET,
} = {}) {
  if (!userId || !password || !totpSecret || !apiKey || !apiSecret) {
    throw new Error(
      "Missing one of KITE_USER_ID / KITE_PASSWORD / KITE_TOTP_SECRET / KITE_API_KEY / KITE_API_SECRET"
    );
  }

  const jar = buildJar();

  // Step 0: load the root page first to pick up whatever initial session
  // cookie a real browser would get before ever logging in — some of
  // Kite's flows expect the login POST to extend an existing anonymous
  // session rather than create one from nothing.
  const primeResp = await axios.get(KITE_ROOT_URL, {
    headers: BROWSER_HEADERS,
    validateStatus: () => true,
  });
  log("priming GET status", primeResp.status);
  jar.set(primeResp.headers["set-cookie"]);

  // Step 1: user_id + password -> request_id
  const loginResp = await axios.post(
    KITE_LOGIN_URL,
    new URLSearchParams({ user_id: userId, password }),
    {
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: jar.header(),
      },
      validateStatus: () => true, // we check status ourselves so we can report a clear error
    }
  );
  log("login status", loginResp.status, loginResp.data);
  jar.set(loginResp.headers["set-cookie"]);

  if (loginResp.data?.status === "error") {
    throw new Error(
      `Login step rejected (user_id/password): ${loginResp.data.message || "unknown error"}`
    );
  }
  const requestId = loginResp.data?.data?.request_id;
  if (!requestId) {
    throw new Error(
      `Login step failed: no request_id returned. Raw response: ${JSON.stringify(loginResp.data)}`
    );
  }

  // Step 2: TOTP (generated fresh from the secret, valid ~30s).
  // Wait out any window we've already used a code from, so reconnecting
  // right after a previous attempt doesn't send a code Kite will reject
  // as a replay.
  await ensureFreshTotpWindow();
  const totp = authenticator.generate(totpSecret);
  log("generated totp", totp);
  const twofaResp = await axios.post(
    KITE_TWOFA_URL,
    new URLSearchParams({
      user_id: userId,
      request_id: requestId,
      twofa_value: totp,
      twofa_type: "totp",
    }),
    {
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: jar.header(),
      },
      validateStatus: () => true,
    }
  );
  log("twofa status", twofaResp.status, twofaResp.data);
  jar.set(twofaResp.headers["set-cookie"]);

  if (twofaResp.data?.status === "error") {
    throw new Error(
      `TOTP step rejected: ${twofaResp.data.message || "unknown error"} — check KITE_TOTP_SECRET is the base32 secret (not a 6-digit code) and that server clock is accurate`
    );
  }

  // Step 3: hit the Connect authorize URL as a logged-in session and follow
  // the redirect chain manually (Kite may hop through more than one
  // redirect before landing on the final one carrying request_token).
  let requestToken = null;
  let nextUrl = `${KITE_CONNECT_URL}?api_key=${encodeURIComponent(apiKey)}&v=3`;
  const maxHops = 6;

  for (let hop = 0; hop < maxHops && !requestToken; hop++) {
    const resp = await axios.get(nextUrl, {
      headers: { ...BROWSER_HEADERS, Cookie: jar.header() },
      maxRedirects: 0,
      validateStatus: () => true,
    });
    log("redirect hop", hop, "status", resp.status, "location", resp.headers.location);
    jar.set(resp.headers["set-cookie"]);

    if (resp.status >= 200 && resp.status < 300) {
      // No redirect — Kite returned a page directly instead of bouncing us
      // onward. This usually means auth didn't actually succeed, or Kite's
      // connect page is a client-side app that does the real redirect via
      // JS rather than a server redirect (in which case this approach
      // can't see it and needs a different technique).
      const body = String(resp.data);
      const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
      fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), "data", "last-failed-response.html"), body);
      throw new Error(
        `Expected a redirect from Kite but got status ${resp.status} with no Location header. ` +
          `Page title: "${titleMatch ? titleMatch[1] : "unknown"}". ` +
          `Full body saved to data/last-failed-response.html for inspection. ` +
          `Cookie names sent: ${jar.header().split("; ").map((c) => c.split("=")[0]).join(", ")}`
      );
    }

    const location = resp.headers.location;
    if (!location) {
      throw new Error(`Got redirect status ${resp.status} but no Location header was present.`);
    }

    const url = new URL(location, "https://kite.zerodha.com");
    const token = url.searchParams.get("request_token");
    if (token) {
      requestToken = token;
      break;
    }
    nextUrl = url.toString();
  }

  if (!requestToken) {
    throw new Error(
      "Could not find request_token after following redirects — Kite may have changed its login flow. " +
        "Set KITE_AUTOLOGIN_DEBUG=1 in .env.local and check the server console for the exact redirect chain."
    );
  }

  // Step 4: exchange request_token for access_token via official SDK
  const kc = new KiteConnect({ api_key: apiKey });
  const session = await kc.generateSession(requestToken, apiSecret);

  return {
    access_token: session.access_token,
    public_token: session.public_token,
    login_time: session.login_time,
    user_id: session.user_id,
  };
}