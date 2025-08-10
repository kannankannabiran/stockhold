"use client";
import Image from 'next/image';
import Chart_img from '../../../public/onetoone.svg';
import { FiArrowRight } from "react-icons/fi";
import { FaYoutube } from "react-icons/fa";
import Footer from '../Footer/page';
import Link from 'next/link';

export default function Chart() {
  return (
    <>
  <div style={{ backgroundImage: 'url("/onetoonebg.svg")', backgroundSize: 'cover', backgroundPosition: 'center bottom' }} className='pb-30'>
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
      
      <h2 className="text-3xl sm:text-4xl font-bold mb-2 text-white"><span className='text-green-500'>One</span> To One Training</h2>

      <p className="text-white mb-6">
        Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we're dedicated to delivering results that exceed expectations.
      </p>

      {/* Button Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/payment/Longtermstock" className="bg-green-400 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
          Get Started <FiArrowRight />
        </Link>

        <button className="bg-red-400 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
          <FaYoutube className="text-white text-xl" />
          Watch Video
        </button>
      </div>
    </div>


  </div>
</div>
</div>
<Footer />
</>
    );
}
