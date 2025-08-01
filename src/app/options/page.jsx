'use client'
import dynamic from "next/dynamic";

const OptionChain = dynamic(() => import("./OptionChain"), { ssr: false });

export default function OptionChainPage() {
  return <OptionChain />;
}
