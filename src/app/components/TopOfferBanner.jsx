import { useState, useEffect } from "react";

export default function TopOfferBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, 2000); // 5 seconds delay

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-18 left-0 right-0 bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-white shadow-lg z-50 flex justify-between items-center px-6 py-4 animate-slideDown">
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 max-w-7xl mx-auto w-full text-center">
        <span className="font-semibold text-lg md:text-xl">
          Welcome Offer! Get{" "}
          <span className="font-extrabold text-3xl text-amber-300"> 50% Off</span> on your first investment.
        </span>
      </div>
      <button
        className="ml-4 text-white hover:text-gray-200 transition text-3xl font-bold select-none cursor-pointer"
        aria-label="Close offer banner"
        onClick={() => setVisible(false)}
      >
        &times;
      </button>
      <style jsx>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.5s ease forwards;
        }
      `}</style>
    </div>
  );
}
