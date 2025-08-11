// app/thanks/page.jsx
"use client";

export default function ThanksPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* SVG Green Tick */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto h-20 w-20 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Title */}
        <h1 className="mt-6 text-3xl font-bold text-gray-800">
          Thanks for Your Payment!
        </h1>

        {/* Paragraph */}
        <p className="mt-4 text-gray-600 text-lg">
          Your transaction Detail once Confirmation Successful. Purchasing Product Activate with in 5 Min Please Wait ... Any Clearfication Please Fell Free Contacct :7200630057...
        </p>

        {/* Optional button */}
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full transition-all shadow-md cursor-pointer"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
