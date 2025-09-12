"use client";
import Image from 'next/image';
import Chart_img from '../../../public/onetoone.svg';
import { FiArrowRight } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa";
import Footer from '../Footer/page';
import { useRouter } from 'next/navigation';

export default function Chart() {
  const router = useRouter();

  const handleGetStarted = () => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      router.push('/payment/Longtermstock');
    } else {
      localStorage.setItem('redirectAfterSignup', '/payment/Longtermstock');
      router.push('/signup');
    }
  };

  // Long term Stocks Pick items
  const items = [
    { left: "1", right: "Basic Of Stock Market" },
    { left: "2", right: "Fundamental Analysis For Stocks" },
    { left: "3", right: "Technical Analysis For Stocks" },
    { left: "4", right: "How to Use our Ai Based Indicator" },
    { left: "5", right: "Market Decode With our Data" },
    { left: "6", right: "Convert Loss To Profitable" },
    { left: "7", right: "Market Direction" },
    { left: "8", right: "Exact Entry Point" },
    { left: "9", right: "Option Trading Advance" },
    { left: "10", right: "Advance Option Chain" },
    { left: "11", right: "How to Identfy Fii Dii Entry Point" },
    { left: "12", right: "How to Identfy Trending Days" },
    { left: "13", right: "How to use Our Indicator" },
  ];

  // Course Curriculum items
  const curriculum = [
    {
      title: "Introduction to Stock Market Investing",
      points: [
        "Basics of the Stock Market",
        "Understanding Stocks, Shares, and Indices",
        "Overview of Capital Markets and Securities",
        "Types of Investments (Stocks, Mutual Funds, ETFs)",
      ],
    },
    {
      title: "Fundamental Analysis for Stocks",
      points: [
        "Concept and Importance of Fundamental Analysis",
        "Analyzing Financial Statements (Income Statement, Balance Sheet, Cash Flow)",
        "Key Financial Ratios (PE Ratio, ROE, ROCE, Debt to Equity, etc.)",
        "Company Valuation Techniques",
        "Understanding Macroeconomic Factors",
        "Industry and Sector Analysis",
        "Corporate Governance and Management Evaluation",
      ],
    },
    {
      title: "Technical Analysis for Stocks",
      points: [
        "Basics of Technical Analysis and Chart Reading",
        "Trend Identification and Market Patterns",
        "Support and Resistance Levels",
        "Candlestick Patterns",
        "Moving Averages, RSI, MACD, and other Indicators",
        "Volume Analysis",
        "Using Technical Analysis for Timing Entries and Exits",
      ],
    },
    {
      title: "Using AI-Based Indicators and Tools",
      points: [
        "Introduction to AI and Machine Learning in Stock Market",
        "How AI-based Indicators Work",
        "Applying AI to Identify Stock Trends and Signals",
        "Integrating AI into Long-Term Investment Strategy",
      ],
    },
    {
      title: "Market Decode with Data Analysis",
      points: [
        "Using Market Data to Understand Stock Movements",
        "Interpreting Institutional Investor Actions (FII, DII)",
        "Seasonality and Market Cycles",
        "Economic Indicators Impacting Markets",
      ],
    },
    {
      title: "Risk Management and Portfolio Building",
      points: [
        "Understanding Risks in Stock Investing",
        "Diversification Strategies",
        "Asset Allocation for Long-Term Growth",
        "Managing Losses and Converting Them into Profits",
      ],
    },
    {
      title: "Advanced Concepts and Strategies",
      points: [
        "Options Trading Basics & Advanced Strategies for Hedging",
        "Using Option Chains for Market Direction",
        "Identifying Exact Entry and Exit Points",
        "Recognizing Trending Days and Market Momentum",
        "Monitoring and Adjusting Your Portfolio",
      ],
    },
  ];

  return (
    <>
      {/* Hero / Top Section */}
      <div className="pb-28" style={{background : '#0e3429'}} >
        <div className="container mx-auto py-8 px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Right Column */}
            <div className="w-full md:w-1/2">
              <Image
                src={Chart_img}
                alt="Chart"
                className="w-full max-w-[450px] mx-auto"
              />
            </div>
            {/* Left Column */}
            <div className="w-full md:w-1/2">
              <h2 className="text-3xl sm:text-4xl font-bold mb-2 text-white">
                <span className="text-green-500">How to Select</span> Long Term Stocks
              </h2>
              <p className="text-white mb-6">
                Learn the proven methods of identifying stocks that create wealth over time. This course is designed for beginners and intermediate investors aiming to build a strong long-term portfolio.
              </p>
              {/* Button Row */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleGetStarted}
                  className="bg-green-400 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Get Started <FiArrowRight />
                </button>
                <button className="bg-red-400 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
                  <FaYoutube className="text-white text-xl" />
                  Watch Video
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stylish Long Term Stocks Pick Section */}
      <div className="bg-gradient-to-br from-green-50 via-white to-green-100 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-green-700 mb-2">
            What You Will Learn
          </h2>
          <p className="text-lg text-center text-gray-600 mb-10">
            Unlock the secrets to successful long-term investing with our expert-picked topics and innovative strategies.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {items.map(({ left, right }, idx) => (
              <div
                key={idx}
                className="flex items-center p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all border border-gray-100 group"
              >
                {/* Number badge with gradient */}
                <div className="flex-shrink-0 h-14 w-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg group-hover:scale-105 transition-transform">
                  {left}
                </div>
                {/* Topic text */}
                <div className="ml-6">
                  <p className="text-xl font-semibold text-gray-900 group-hover:text-green-600 transition-colors">{right}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Long Term Stocks Selected Course Content Section */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-10 text-green-700">
          What You Will Learn
        </h2>
        <div className="space-y-12">
          {curriculum.map((section, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-2xl font-semibold mb-4 text-green-600">{section.title}</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {section.points.map((point, idx) => (
                  <li key={idx}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

        <div className="py-16 bg-green-50">
        <h2 className="text-3xl text-center font-bold mb-12">Our Plans</h2>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 px-6">
          {[
            { plan: "Starter", price: "₹499/mo", features: ["Basic Stock Picks", "Weekly Reports"] },
            { plan: "Pro", price: "₹999/mo", features: ["Advanced Strategies", "AI Tools", "Exclusive Webinars"], highlighted: true },
            { plan: "Elite", price: "₹1999/mo", features: ["1-on-1 Mentorship", "VIP Chat", "All Features Included"] },
          ].map((p, idx) => (
            <div
              key={idx}
              className={`p-6 rounded-lg shadow-md ${p.highlighted ? "bg-green-600 text-white scale-105" : "bg-white"} transition`}
            >
              <h3 className="text-2xl font-bold mb-2">{p.plan}</h3>
              <p className="text-3xl font-semibold mb-4">{p.price}</p>
              <ul className="mb-6 space-y-2">
                {p.features.map((f, i) => (
                  <li key={i}>✅ {f}</li>
                ))}
              </ul>
              <button
                onClick={handleGetStarted}
                className={`w-full py-2 rounded-lg ${p.highlighted ? "bg-white text-green-700 hover:bg-gray-200 cursor-pointer" : "bg-green-500 text-white hover:bg-green-600 cursor-pointer"}`}
              >
                Choose Plan
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center bg-green-500 text-white py-12 px-6 mb-10">
        <h2 className="text-3xl font-bold mb-4">Start Your Investment Journey Today 🚀</h2>
        <p className="mb-6">Don’t wait! Learn, invest, and grow your wealth with us.</p>
        <button
          onClick={handleGetStarted}
          className="bg-white text-green-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition cursor-pointer"
        >
          Join Now
        </button>
      </div>

      {/* Footer */}
      <Footer />
    </>
  );
}
