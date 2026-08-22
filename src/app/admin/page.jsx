'use client';
import React from 'react';
import { AdminPanel } from '../components/AdminPanel';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.admin) setAuthenticated(true);
      })
      .catch(() => {});
  }, []);

  const verify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="container mx-auto">
        <div className="bg-white rounded shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">Admin Panel</h1>
          {!authenticated ? (
            <form onSubmit={verify} className="flex flex-col gap-3 max-w-sm">
              <div className="text-sm mb-2">
                Enter admin password to access member management.
              </div>
              <input
                type="password"
                placeholder="Admin Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border p-2 rounded"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 text-white px-4 py-2 rounded"
              >
                {loading ? 'Verifying...' : 'Enter'}
              </button>
              {error && (
                <div className="text-red-600 text-sm mt-1">{error}</div>
              )}
            </form>
          ) : (
            <div>
              <div className="mb-4 text-green-700">Authenticated as admin.</div>
              <AdminPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
