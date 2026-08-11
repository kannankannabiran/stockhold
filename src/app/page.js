"use client";
import Image from 'next/image';
import Coinimg from '../../public/coin_img.svg';
import Chart_img from '../../public/home-page-chart.svg';
import Home_page_monitor from '../../public/home-page-monitor-image.svg';
import { FiArrowRight } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa";
import Article from './article';
import ServiceCards from './servicecards';
import HeroSection from './HeroSection';
import Footer from './Footer/page';
import Link from 'next/link';
//offer banner
import { useState } from "react";
import TopOfferBanner from "../app/components/TopOfferBanner";
//offer banner
export default function Chart() {
  //offer banner
  const [bannerVisible, setBannerVisible] = useState(true);
  //offer banner
  return (
    <>
<div className="container mx-auto py-8 px-4">
  <div className="flex flex-col md:flex-row items-center justify-between gap-8">
    {/* Left Column */}
    <div className="w-full md:w-1/2">
      <Image src={Coinimg} alt="Coin" className="w-16 h-16 mb-4" />

      <h2 className="text-3xl sm:text-4xl font-bold mb-2">Invest your money222</h2>
      <p className="text-3xl sm:text-4xl font-semibold mb-4">
        with <span className="text-blue-700 font-semibold">higher return</span>
      </p>

      <p className="text-gray-700 mb-6">
        Anyone can invest money in different currencies to increase their earnings
        <span className="block">
          with the help of Bitrader through online.
        </span>
      </p>

      {/* Button Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/signup" className="inline-flex bg-green-400 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 items-center justify-center gap-2">
          Get Started <FiArrowRight />
        </Link>

        <button className="bg-red-400 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
          <FaYoutube className="text-white text-xl" />
          Watch Video
        </button>
      </div>
    </div>

    {/* Right Column */}
    <div className="w-full md:w-1/2">
      <Image
        src={Chart_img}
        alt="Chart"
        className="w-full max-w-[450px] mx-auto"
      />
    </div>
  </div>
</div>
<TopOfferBanner />
<div style={{ background: '#F9FAFC' }}>
  <div className="container mx-auto py-8 px-4">
    <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-8">
      {/* Right Column (Image) */}
      <div className="w-full md:w-1/2 p-4">
        <Image
          src={Home_page_monitor}
          alt="Chart"
          className="w-full max-w-[500px] mx-auto"
        />
      </div>

      {/* Left Column (Text) */}
      <div className="w-full md:w-1/2 p-4">
        <h2 className="text-3xl sm:text-4xl font-bold mb-2 mt-10 text-gray-700">
          Meet our Mentor unless
        </h2>
        <p className="mb-1 text-3xl sm:text-4xl font-semibold mt-2">
          miss the opportunity
        </p>
        <p className="mb-4 pt-3 mt-2 text-gray-700 text-base sm:text-lg">
          Hey there! So glad you stopped by to Meet Our Company. Don’t miss out
          on this opportunity to learn about what we do and the amazing team
          that makes it all happen! Our company is all about creating innovative
          solutions and providing top-notch services to our clients. From start
          to finish, were dedicated to delivering results that exceed
          expectations.
        </p>

        {/* Button Row */}
        <div className="flex flex-col sm:flex-row gap-4 mt-5">
          <Link href="/signup" className="inline-flex bg-green-400 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 items-center justify-center gap-2">
          Get Started <FiArrowRight />
        </Link>
        </div>
      </div>
    </div>
  </div>
</div>
<ServiceCards/>
<HeroSection />
<Article />
<Footer />
</>
    );
}
