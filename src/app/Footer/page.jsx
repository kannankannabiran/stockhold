import { FaYoutube, FaInstagram, FaWhatsapp, FaTelegram, FaTwitter } from "react-icons/fa";
import Image from "next/image";
import Logo from "../../../public/footer_logo.svg"; // your logo path
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#00150F] text-white">
      {/* First Row */}
      <div className="container mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        {/* Column 1: Logo & Paragraph */}
        <div>
          <Link href="https://stockhold.in/"><Image src={Logo} alt="Logo" className="w-42" /></Link>
          <p className="text-sm text-gray-300">
            Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. 
          </p>
        </div>

        {/* Column 2: Quick Links */}
        <div className="lg:ml-26">
          <h3 className="text-lg font-semibold mb-3">Quick Link</h3>
          <ul className="space-y-2 text-sm text-gray-300">
           <li><Link href="/" className="border-b-2 border-transparent hover:border-green-400 pb-1 transition-all">Home</Link></li>
          <li><Link href="/about" className="border-b-2 border-transparent hover:border-green-400 transition-all">About</Link></li>
          <li><Link href="/long-term-stocks-pick" className="border-b-2 border-transparent hover:border-green-400 transition-all">Course</Link></li>
          <li><Link href="/contact" className="border-b-2 border-transparent hover:border-green-400 transition-all">Contact</Link></li>
          </ul>
        </div>

        {/* Column 3: Support */}
        <div className="lg:ml-14">
          <h3 className="text-lg font-semibold mb-3">Support</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li><Link href="#" className="border-b-2 border-transparent hover:border-green-400 transition-all">Terms & Condition</Link></li>
            <li><Link href="#" className="border-b-2 border-transparent hover:border-green-400 transition-all">Privacy Policy</Link></li>
            <li><Link href="#" className="border-b-2 border-transparent hover:border-green-400 transition-all">FAQs</Link></li>
            <li><Link href="#" className="border-b-2 border-transparent hover:border-green-400 transition-all">Support Center</Link></li>
          </ul>
        </div>

        {/* Column 4: Social Media */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Social Media</h3>
          <div className="flex space-x-4 text-white text-xl">
            <Link href="#"><FaYoutube /></Link>
            <Link href="#"><FaInstagram /></Link>
            <Link href="#"><FaWhatsapp /></Link>
            <Link href="#"><FaTelegram /></Link>
            <Link href="#"><FaTwitter /></Link>
          </div>
        </div>
      </div>

      {/* Divider Line */}
      <div className="border-t border-white opacity-20 my-4 mx-auto w-11/12"></div>

      {/* Second Row */}
      <div className="text-center text-sm text-gray-400 pb-6">
        © 2025 ALL Rights Reserved By <span className="font-semibold text-green-400"><Link href="https://stockhold.in/">Stock Hold</Link></span>
      </div>
    </footer>
  );
}
