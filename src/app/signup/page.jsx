'use client';
import React from 'react';
import { SignupForm } from '../components/SignupForm';

export default function SignupPage() {
  const [message, setMessage] = React.useState(null);

  const handleSuccess = (member) => {
    localStorage.setItem("userId", member.id);
    localStorage.setItem("user", member.mobile);
    setMessage(
      `✅ Signup successful for ${member.name || member.mobile}. Desktop access is pending admin activation.`
    );
  };
  const handleError = (err) => {
    setMessage(`❌ ${err}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white rounded shadow p-8">
        <h1 className="text-2xl font-bold mb-4">Sign Up</h1>
        {message && (
          <div className="mb-4 p-3 rounded border bg-yellow-50">
            {message}
          </div>
        )}
        <SignupForm onSuccess={handleSuccess} onError={handleError} />
        <div className="mt-3 text-sm">
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 underline">
            Log in
          </a>
        </div>
      </div>
    </div>
  );
}
