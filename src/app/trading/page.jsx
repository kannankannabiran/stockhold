// src/app/trading/TradingDashboardWrapper.jsx
'use client';

import { useAccessControl } from '@/hooks/useAccessControl'; // adjust path
import TradingDashboard from '../trading/TradingDashboard'; // adjust path

export default function TradingDashboardWrapper({ apiKey, accessToken }) {
  const { hasAccess, loading, member } = useAccessControl('/trading'); // use your actual required path

  if (loading) return <p>Loading...</p>;
  if (!hasAccess) return null;

  return (
    <TradingDashboard
      apiKey={apiKey}
      accessToken={accessToken}
      mobile={member?.mobile}
    />
  );
}