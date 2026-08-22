'use client';
import React from 'react';

export function LoginForm({ onSuccess, onError }) {
  const [mobile, setMobile] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mobile, password }),
    });
    const resp = await res.json();
    setLoading(false);
    if (resp.ok) {
      localStorage.setItem('userId', resp.id || resp.mobile);
      window.dispatchEvent(new Event('userLogin'));
      const redirectUrl = localStorage.getItem('redirectAfterSignup');
      if (redirectUrl) {
        const paymentProducts = (await import('../content_data/paymentData.js')).default;
        const allowedRedirectPages = paymentProducts.map(product => `/payment/${product.id}`);

        if (allowedRedirectPages.includes(redirectUrl)) {
          localStorage.removeItem('redirectAfterSignup');
          window.location.href = redirectUrl;
          return;
        }
      }
      onSuccess && onSuccess({ id: resp.id, mobile: resp.mobile, name: resp.mobile }, mobile);
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
