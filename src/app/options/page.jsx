'use client'
import dynamic from "next/dynamic";
import { useAccessControl } from "../../hooks/useAccessControl";

const OptionChain = dynamic(() => import("./OptionChain"), { ssr: false });

export default function OptionChainPage() {
  const { hasAccess, loading } = useAccessControl('/options');

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return <OptionChain />;
}
