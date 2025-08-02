"use client";
import { useEffect, useState } from "react";
import Image from 'next/image';
import { FiArrowRight } from "react-icons/fi";
import Home_page_monitor from '../../../public/about_page_chart_image.svg';
import Mentor_img from '../../../public/kannabiran.svg';
import Footer from '../Footer/page';
import EssentialPrinciples from "./EssentialPrinciples";
import Link from "next/link";

// Animated Counter Component
function AnimatedCounter({ end, label, duration = 2000 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const increment = end / (duration / 20);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      setCount(Math.floor(start));
    }, 20);

    return () => clearInterval(timer);
  }, [end, duration]);

  return (
    <div className="text-center p-4">
      <h3 className="text-4xl font-bold text-white">{count}+</h3>
      <p className="text-white text-lg mt-2">{label}</p>
    </div>
  );
}

// Main Chart Component
export default function Chart() {
  return (
    <>
      {/* Top Section with Image + Text */}
      <div style={{ background: '#F9FAFC' }}>
        <div className="container mx-auto py-8 px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Image Section */}
            <div className="w-full md:w-1/2 p-4">
              <Image
                src={Home_page_monitor}
                alt="Chart"
                className="w-full max-w-[500px] mx-auto"
              />
            </div>

            {/* Text Section */}
            <div className="w-full md:w-1/2 p-4">
              <h2 className="text-3xl sm:text-4xl font-bold mb-2 md:mt-10 text-gray-700">
                "Your Opportunity Awaits 
              </h2>
              <p className="mb-1 text-3xl sm:text-4xl font-semibold mt-2">
                Connect with Our <span className='text-blue-700'>Mentor!</span>"
              </p>
              <p className="mb-4 pt-3 mt-2 text-gray-700 text-base sm:text-lg">
                Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we're dedicated to delivering results that exceed expectations.
              </p>

              {/* Button */}
              <div className="flex flex-col sm:flex-row gap-4 mt-5">
                <Link href="/signup" className="bg-green-400 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 flex items-center gap-2 cursor-pointer justify-center">
                  Get Started <FiArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Green Animated Stats Section */}
      <div className="bg-green-400 py-10">
        <div className="container mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 px-4">
          <AnimatedCounter end={3000} label="Students" />
          <AnimatedCounter end={1550} label="Active Investors & Traders" />
          <AnimatedCounter end={20} label="Live Memberships" />
          <AnimatedCounter end={12} label="Awards" />
        </div>
      </div>
      <div style={{ background: '#F9FAFC' }}>
        <div className="container mx-auto py-8 px-4">
          <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-8">
            
      
            {/* Left Column (Text) */}
            <div className="w-full md:w-1/2 p-4">
              <h2 className="text-3xl sm:text-4xl font-bold mb-2 mt-10 text-gray-700">
               About For Our<span className="text-blue-700"> Mentor</span>
              </h2>
              <p className="mb-4 pt-3 mt-2 text-gray-700 text-base sm:text-lg">
               Kannabiran, often regarded as one of India's top Stock Holder and Option Trader, brings decades of experience in financial markets. He initially trained as a mathematics teacher and later transitioned into the stock market, where he discovered his niche in options trading. Known for his unconventional approach, Sundar emphasizes simplicity and practicality, frequently challenging traditional trading methodologies. He advocates for straightforward option selling strategies and places a high value on understanding market psychology and volatility, which are crucial in managing risk effectively.
               Sundar's trading style primarily involves option selling, which capitalizes on time decay (theta decay) rather than predicting stock price movements. His insights focus on the importance of hedging, disciplined position sizing, and creating a balanced portfolio that minimizes risk exposure while generating steady returns. Sundar is known to maintain transparency about the realities of trading, often discussing both the gains and potential losses associated with high-risk strategies.
               His educational initiatives include online courses, live workshops, and exclusive mentorship programs.
              </p>
            </div>
            {/* Right Column (Image) */}
            <div className="w-full md:w-1/2">
                  <Image
                    src={Mentor_img}
                    alt="Chart"
                    className="w-full max-w-[450px] mx-auto mix-blend-luminosity hover:mix-blend-normal hover:ease-in-out"
                  />
                </div>
          </div>
        </div>
      </div>
    <EssentialPrinciples/>
      {/* Footer */}
      <Footer />
    </>
  );
}
