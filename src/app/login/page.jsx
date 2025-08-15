'use client';
import React from 'react';
import { LoginForm } from '../components/LoginForm';

export default function LoginPage() {
  const [message, setMessage] = React.useState(null);

  const handleSuccess = (member, mobile) => {
    localStorage.setItem("userId", member.id);
    localStorage.setItem("user", mobile);
    
    const redirectUrl = localStorage.getItem('redirectAfterSignup');
    if (!redirectUrl) {
      setMessage(`✅ Logged in as ${member.name}. Redirecting to home in 10 seconds...`);
      setTimeout(() => {
        window.location.href = '/';
      }, 10000);
    }
  };
  const handleError = (err) => {
    setMessage(`❌ ${err}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white rounded shadow p-8">
        <h1 className="text-2xl font-bold mb-4">Log In</h1>
        {message && (
          <div className="mb-4 p-3 rounded border bg-yellow-50">
            {message}
          </div>
        )}
        <LoginForm onSuccess={handleSuccess} onError={handleError} />
        <div className="mt-3 text-sm">
          New here?{' '}
          <a href="/signup" className="text-blue-600 underline">
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
}
