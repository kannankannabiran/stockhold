"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FaChevronDown, FaBars, FaTimes, FaChevronRight } from "react-icons/fa";
import Image from "next/image";
import Logo from '../../../public/navbar_logo.svg';
import Link from "next/link";

export default function Navbar() {
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showScannerSubmenu, setShowScannerSubmenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  const handleNavigate = (path) => {
    setShowCourseDropdown(false);
    setShowToolsDropdown(false);
    setShowProductDropdown(false);
    setShowScannerSubmenu(false);
    setMenuOpen(false);
    if (pathname !== path) {
      router.push(path);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-custom">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left: Logo + Desktop Nav */}
        <div className="flex items-center space-x-6">
          <Link href="https://stockhold.in/">
            <Image src={Logo} alt="Logo" className="w-[200px]" />
          </Link>

          <div className="hidden md:flex space-x-6 items-center relative text-gray-800">
            <div onClick={() => handleNavigate("/")} className="cursor-pointer hover:underline">Home</div>
            <div onClick={() => handleNavigate("/about")} className="cursor-pointer hover:underline">About Us</div>

            {/* Course Dropdown */}
            <div className="relative">
              <div onClick={() => {
                setShowCourseDropdown(!showCourseDropdown);
                setShowProductDropdown(false);
                setShowToolsDropdown(false);
              }} className="flex items-center space-x-1 cursor-pointer hover:underline">
                <span>Course</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showCourseDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/long-term-stocks-pick")}>Long Term Stocks</div>
                </div>
              )}
            </div>

            {/* Product Menu */}
            <div className="relative">
              <div onClick={() => {
                setShowProductDropdown(!showProductDropdown);
                setShowCourseDropdown(false);
                setShowToolsDropdown(false);
              }} className="flex items-center space-x-1 cursor-pointer hover:underline">
                <span>Product</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showProductDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/chart")}>Chart</div>
                  
                  <div className="relative group">
                    <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center" onMouseDown={() => setShowScannerSubmenu(true)}>
                      <span>Scanner</span>
                      <FaChevronRight className="text-xs ml-2" />
                    </div>

                    {showScannerSubmenu && (
                      <div className="absolute top-0 left-full ml-1 bg-white rounded-md shadow-lg w-44 z-30">
                        <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/longterm")}>Scan</div>
                        <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/stocklist")}>Stocks List</div>
                        <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/backtest")}>Back Test</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
              <div onClick={() => {
                setShowToolsDropdown(!showToolsDropdown);
                setShowCourseDropdown(false);
                setShowProductDropdown(false);
              }} className="flex items-center space-x-1 cursor-pointer hover:underline">
                <span>Tools</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showToolsDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/options")}>Option Chain</div>
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/trendingoi")}>Trending OI</div>
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/openhighnifty")}>Nifty OHLC</div>
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/herozero")}>Hero Zero</div>
                  <div className="px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={() => handleNavigate("/individual")}>Individual Strike</div>
                </div>
              )}
            </div>

            <div onClick={() => handleNavigate("/contact")} className="cursor-pointer hover:underline">Contact Us</div>
          </div>
        </div>

        {/* Mobile: Hamburger + Login */}
        <div className="flex items-center space-x-4">
          <div className="md:hidden">
            <button onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <FaTimes size={24} className="text-green-400" /> : <FaBars size={24} className="text-green-400" />}
            </button>
          </div>
          <div className="hidden md:block bg-green-400 text-gray-800 px-4 py-1 rounded-sm cursor-pointer hover:bg-green-600 hover:text-white">
            Login
          </div>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {menuOpen && (
        <div className="md:hidden bg-green-400 text-white px-4 pb-4 space-y-2">
          <div onClick={() => handleNavigate("/")}>Home</div>
          <div onClick={() => handleNavigate("/about")}>About Us</div>
          <div>
            <div onClick={() => setShowCourseDropdown(!showCourseDropdown)} className="flex items-center justify-between">
              <span>Course</span> <FaChevronDown className="text-xs" />
            </div>
            {showCourseDropdown && (
              <div className="ml-4">
                <div onClick={() => handleNavigate("/long-term-stocks-pick")}>Long Term Stocks</div>
              </div>
            )}
          </div>
          <div>
            <div onClick={() => setShowProductDropdown(!showProductDropdown)} className="flex items-center justify-between">
              <span>Product</span> <FaChevronDown className="text-xs" />
            </div>
            {showProductDropdown && (
              <div className="ml-4">
                <div onClick={() => handleNavigate("/chart")}>Chart</div>
                <div>
                  <div onClick={() => setShowScannerSubmenu(!showScannerSubmenu)} className="flex items-center justify-between">
                    <span>Scanner</span> <FaChevronDown className="text-xs" />
                  </div>
                  {showScannerSubmenu && (
                    <div className="ml-4">
                      <div onClick={() => handleNavigate("/longterm")}>Scan</div>
                      <div onClick={() => handleNavigate("/stocklist")}>Stocks List</div>
                      <div onClick={() => handleNavigate("/backtest")}>Back Test</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div>
            <div onClick={() => setShowToolsDropdown(!showToolsDropdown)} className="flex items-center justify-between">
              <span>Tools</span> <FaChevronDown className="text-xs" />
            </div>
            {showToolsDropdown && (
              <div className="ml-4">
                <div onClick={() => handleNavigate("/options")}>Option Chain</div>
                <div onClick={() => handleNavigate("/trendingoi")}>Trending OI</div>
                <div onClick={() => handleNavigate("/openhighnifty")}>Nifty OHLC</div>
                <div onClick={() => handleNavigate("/herozero")}>Hero Zero</div>
                <div onClick={() => handleNavigate("/individual")}>Individual Strike</div>
              </div>
            )}
          </div>
          <div onClick={() => handleNavigate("/contact")}>Contact Us</div>
          <div className="hover:text-red-200 mt-2">Login</div>
        </div>
      )}
    </nav>
  );
}
