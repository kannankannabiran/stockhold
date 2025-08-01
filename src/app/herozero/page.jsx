'use client'
import dynamic from "next/dynamic";

const OptionChain = dynamic(() => import("./herozero"), { ssr: false });

export default function OptionChainPage() {
  return <OptionChain />;
}
