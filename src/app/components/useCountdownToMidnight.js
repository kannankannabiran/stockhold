// hooks/useCountdownToMidnight.js
import { useState, useEffect } from "react";

export default function useCountdownToMidnight() {
  const calculateTimeLeft = () => {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // Set to next midnight (today's 24:00 = tomorrow 00:00)

    const difference = midnight - now;

    let timeLeft = {
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: false,
    };

    if (difference > 0) {
      timeLeft = {
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        expired: false,
      };
    } else {
      timeLeft.expired = true;
    }

    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    if (timeLeft.expired) return; // stop if expired

    const timer = setInterval(() => {
      const updatedTimeLeft = calculateTimeLeft();
      setTimeLeft(updatedTimeLeft);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  return timeLeft;
}
