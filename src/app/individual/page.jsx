'use client'
import dynamic from "next/dynamic";

const OptionChain = dynamic(() => import("./individual-strike-oi"), { ssr: false });

export default function OptionChainPage() {
  return <OptionChain />;
}
