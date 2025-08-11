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

  // Data for Long term Stocks Pick items
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

  return (
    <>
      {/* Top Section with image and intro */}
      <div
        style={{ backgroundImage: 'url("/onetoonebg.svg")', backgroundSize: 'cover', backgroundPosition: 'center bottom' }}
        className="pb-28"
      >
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
                Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we're dedicated to delivering results that exceed expectations.
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

      {/* Long term Stocks Pick Section */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Section Title */}
        <h2 className="text-2xl font-semibold text-center mb-10">
          Long term Stocks Pick
        </h2>

        {/* 2-column grid for 6 items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {items.map(({ left, right }, idx) => (
            <div
              key={idx}
              className="flex rounded-lg overflow-hidden shadow-md"
            >
              {/* Left side - gray bg with vertical green line */}
              <div className="relative flex items-center bg-gray-200 px-5 py-4 flex-1">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-400 rounded-l-md"></div>
                <p className="ml-4 font-medium text-white p-3 w-12 text-center rounded-full text-xl" style={{background: 'oklch(0.26 0.04 170.89)'}}>{left}</p>
              </div>

              {/* Right side - green bg with white text */}
              <div className="flex items-center bg-green-600 px-5 py-4 flex-1 rounded-r-lg">
                <p className="text-white font-medium">{right}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className='text-normal m-15'>Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we're dedicated to delivering results that exceed expectations. Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we're dedicated to delivering results that exceed expectations.</p>
        <div className='text-center bg-green-400 text-gray-700 rounded-2xl p-2 w-10 mx-auto px-8 mb-10 hover:bg-green-600 cursor-pointer hover:text-white' onClick={handleGetStarted}>Join Now</div>
      {/* Footer */}
      <Footer />
    </>
  );
}
