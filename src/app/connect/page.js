"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ConnectPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const errorMsg = searchParams.get("error");

  useEffect(() => {
    fetch("/api/optionchain?index=NIFTY", { cache: "no-store" })
      .then((res) => {
        setConnected(res.status !== 401);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Zerodha
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Connect your account</h1>

          {errorMsg && (
            <div
              className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-sm text-rose-700"
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          {checking ? (
            <p className="mt-4 font-mono text-sm text-slate-500">Checking connection…</p>
          ) : connected ? (
            <div className="mt-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="font-mono text-xs text-emerald-700">Connected to Zerodha</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-95 cursor-pointer"
                >
                  Go to option chain
                </button>
                <a
                  href="/api/login"
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-mono text-sm text-slate-700 transition hover:border-amber-500"
                >
                  Reconnect
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm leading-6 text-slate-600">
                Connect your Zerodha account to pull live option chain data. You&apos;ll be
                redirected to Zerodha&apos;s login page, and your credentials never touch this
                app.
              </p>
              <a
                href="/api/login"
                className="mt-5 inline-flex items-center rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
              >
                Connect to Zerodha
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-10 text-slate-900 sm:px-6">
          <div className="mx-auto max-w-xl">
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
              <p className="font-mono text-sm text-slate-500">Loading…</p>
            </div>
          </div>
        </main>
      }
    >
      <ConnectPageInner />
    </Suspense>
  );
}