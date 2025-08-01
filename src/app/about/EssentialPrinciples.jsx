"use client";

const principles = [
  { title: "Risk Management", text: "Protect your capital by managing position sizes and setting stop-loss levels." },
  { title: "Technical Analysis", text: "Use charts, indicators, and patterns to anticipate market moves." },
  { title: "Fundamental Analysis", text: "Evaluate financial health and news to understand asset value." },
  { title: "Trading Psychology", text: "Develop discipline, emotional control, and a winning mindset." },
  { title: "Strategy Development", text: "Create, test, and refine trading plans that match your style." },
  { title: "Position Sizing", text: "Know how much to invest in each trade for optimal returns." },
  { title: "Entry & Exit Timing", text: "Learn when to get in and out of trades efficiently." },
  { title: "Market Trends", text: "Recognize bullish/bearish cycles and align your trades accordingly." },
  { title: "Risk-to-Reward Ratio", text: "Choose trades with favorable return potential over risk taken." },
  { title: "Journaling & Review", text: "Track your trades and learn from past results to improve." },
  { title: "Economic Awareness", text: "Stay informed about macro events that affect markets." },
  { title: "Consistency & Patience", text: "Stick to your strategy and avoid impulsive decisions." }
];

export default function EssentialPrinciples() {
  return (
    <div className="bg-white py-12 px-4">
      {/* Title & Subtitle */}
      <div className="max-w-4xl mx-auto text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold text-black mb-2"><span className="text-blue-600">Master the Core Areas</span> of Trading</h2>
        <p className="text-lg sm:text-xl font-medium">
        Our program is designed to give you a solid foundation in every aspect of trading. Learn from industry experts and develop the skills you need to trade with confidence.
        </p>
      </div>

      {/* Principles List */}
      <div className="max-w-5xl mx-auto space-y-6 shadow-sm rounded-2xl bg-gray-50 p-10">
        {principles.map((item, index) => (
          <div
            key={index}
            className="flex items-start gap-4 p-4 rounded-lg"
          >
            {/* Left Green Circle with Number */}
            <div className="min-w-[40px] h-[40px] flex items-center justify-center bg-green-500 text-white font-bold rounded-full text-lg">
              {index + 1}
            </div>

            {/* Right Text */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{item.title}</h3>
              <p className="text-gray-600 text-sm mt-1">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
