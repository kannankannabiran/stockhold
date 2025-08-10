'use client';
import React from 'react';

async function api(action, data) {
  const res = await fetch(`/api/auth?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export function LoginForm({ onSuccess, onError }) {
  const [mobile, setMobile] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const resp = await api('login', { mobile, password });
    setLoading(false);
    if (resp.success) {
      localStorage.setItem('userId', resp.member.id);
      window.dispatchEvent(new Event('userLogin'));
      onSuccess && onSuccess(resp.member);
    } else {
      onError && onError(resp.error);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        placeholder="Mobile"
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        required
        className="border p-2 rounded"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="border p-2 rounded"
      />
      <button
        disabled={loading}
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
}
