'use client'
import dynamic from "next/dynamic";
import { useAccessControl } from "../../hooks/useAccessControl";

const OptionChain = dynamic(() => import("./herozero"), { ssr: false });

export default function OptionChainPage() {
  const { hasAccess, loading } = useAccessControl('/herozero');

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return <OptionChain />;
}
