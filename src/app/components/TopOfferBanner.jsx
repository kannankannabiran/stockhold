import { useState, useEffect } from "react";

function useCountdownToMidnight() {
  const calculateTimeLeft = () => {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    const difference = midnight - now;

    if (difference <= 0) {
      return { expired: true, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      expired: false,
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    if (timeLeft.expired) return;

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  return timeLeft;
}

export default function TopOfferBanner() {
  const [visible, setVisible] = useState(false);
  const { hours, minutes, seconds, expired } = useCountdownToMidnight();

  // Show after 5 seconds delay, every time (all users)
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible || expired) return null;

  return (
    <div className="top-0 left-0 right-0 bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-white shadow-lg z-50 flex justify-between items-center px-6 py-4 animate-slideDown">
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 max-w-7xl mx-auto w-full">
        <span className="font-semibold text-lg md:text-xl">
          Welcome Offer! Get{" "}
          <span className="font-extrabold text-3xl text-amber-300">50% Off</span> on your Purchase. Hurry up, offer expires in{" "}
          <span className="font-mono text-amber-300 text-3xl">
            {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
            {String(seconds).padStart(2, "0")}
          </span>
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
