// src/app/trading/page.jsx
// Server component — keeps the access_token fetch on the server, hands it to the
// client dashboard as a prop.
import TradingDashboard from './TradingDashboard';
import { getStoredAccessToken } from '@/lib/kiteClient';

export default async function TradingPage() {
  const apiKey = process.env.KITE_API_KEY;
  const accessToken = await getStoredAccessToken();

  if (!accessToken) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Not connected to Kite. Go to /connect to log in first.</p>
      </div>
    );
  }

  return <TradingDashboard apiKey={apiKey} accessToken={accessToken} />;
}