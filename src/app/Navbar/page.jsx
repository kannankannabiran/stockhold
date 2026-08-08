"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FaChevronDown, FaBars, FaTimes, FaChevronRight } from "react-icons/fa";
import Image from "next/image";
import Logo from "../../../public/navbar_logo.svg";
import Link from "next/link";
import { useNavbarAccess } from "../../hooks/useNavbarAccess";
import PaymentDetailPage from "../payment/[id]/page";

/**
 * Stubbed user hook. Replace with real auth/session logic.
 */
function useUser() {
  const [user, setUser] = useState({
    isAdmin: false,
    permissions: [],
    isAuthenticated: false,
    name: "",
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkAuth = () => {
      const userId = localStorage.getItem("userId") || sessionStorage.getItem("userId");
      setUser(prev => ({ ...prev, isAuthenticated: !!userId }));
    };
    
    checkAuth();
    
    const handleStorageChange = () => checkAuth();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userLogin', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userLogin', handleStorageChange);
    };
  }, []);

  const login = (overrides = {}) =>
    setUser((u) => ({ ...u, isAuthenticated: true, ...overrides }));
  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("userId");
    setUser({
      isAdmin: false,
      permissions: [],
      isAuthenticated: false,
      name: "",
    });
  };

  return { user: mounted ? user : { ...user, isAuthenticated: false }, login, logout, mounted };
}

const AvatarPlaceholder = () => (
  <div className="w-8 h-8 rounded-full bg-gray-200 items-center justify-center overflow-hidden hidden md:flex">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="#555" strokeWidth="1.5" />
      <path
        d="M4 20c0-4 4-6 8-6s8 2 8 6"
        stroke="#555"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  </div>
);

const PROTECTED_PAYMENT_ROUTES = {
  "/chart": "/payment/Longtermstock",
  "/longterm": "/payment/Longtermstock",
  "/stocklist": "/payment/Longtermstock",
  "/backtest": "/payment/Longtermstock",
  "/options": "/payment/Longtermstock",
  "/trendingoi": "/payment/Longtermstock",
  "/openhighnifty": "/payment/Longtermstock",
  "/herozero": "/payment/Longtermstock",
  "/individual": "/payment/Longtermstock",
  "/trading": "/payment/Longtermstock",
  "/selling-scanner": "/payment/Longtermstock",
  "/portfolio-tracker": "/payment/Longtermstock",
};

const PROTECTED_PATHS = Object.keys(PROTECTED_PAYMENT_ROUTES);

export default function Navbar() {
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showScannerSubmenu, setShowScannerSubmenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const profileRef = useRef(null);

  const { user, login, logout } = useUser();
  const { hasAccess } = useNavbarAccess();

  const handleNavigate = async (path) => {
    const access = await hasAccess(path);
    const userId = localStorage.getItem('userId');
    if (path === '/longterm' && !userId) {
      localStorage.setItem('redirectAfterSignup', '/payment/Longtermstockscanner');
      router.push('/signup');
      return;
    }
    if (path === '/stocklist' && !userId) {
      localStorage.setItem('redirectAfterSignup', '/payment/Longtermstockscanner');
      router.push('/signup');
      return;
    }
    if (path === '/backtest' && !userId) {
      localStorage.setItem('redirectAfterSignup', '/payment/Longtermstockscanner');
      router.push('/signup');
      return;
    }
    if (!access) {
      const paymentUrl = PROTECTED_PAYMENT_ROUTES[path];
      if (paymentUrl) {
        router.push(paymentUrl);
      } else {
        router.push("/payment/default");
      }
      return;
    }
    setShowCourseDropdown(false);
    setShowToolsDropdown(false);
    setShowProductDropdown(false);
    setShowScannerSubmenu(false);
    setShowProfileMenu(false);
    setMenuOpen(false);
    router.push(path);
  };

  const handleLogout = () => {
    logout();
    setShowProfileMenu(false);
    router.push("/");
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderLink = (label, path) => {
    return (
      <div
        onClick={() => handleNavigate(path)}
        className="cursor-pointer hover:underline relative flex items-center"
      >
        {label}
        {PROTECTED_PATHS.includes(path) && !user.isAdmin && (
          <span className="ml-1 text-xs text-red-500" aria-label="protected">
            *
          </span>
        )}
      </div>
    );
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-custom">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center space-x-6">
          <Link href="/">
            <Image src={Logo} alt="Logo" className="w-[200px]" />
          </Link>

          <div className="hidden md:flex space-x-6 items-center relative text-gray-800">
            {renderLink("Home", "/")}
            {renderLink("About Us", "/about")}

            {/* Course */}
            <div className="relative">
              <div
                onClick={() => {
                  setShowCourseDropdown((v) => !v);
                  setShowProductDropdown(false);
                  setShowToolsDropdown(false);
                }}
                className="flex items-center space-x-1 cursor-pointer hover:underline"
              >
                <span>Course</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showCourseDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() =>
                      handleNavigate("/long-term-stocks-pick")
                    }
                  >
                    Long Term Stocks
                  </div>
                </div>
              )}
            </div>

            {/* Product */}
            <div className="relative">
              <div
                onClick={() => {
                  setShowProductDropdown((v) => !v);
                  setShowCourseDropdown(false);
                  setShowToolsDropdown(false);
                }}
                className="flex items-center space-x-1 cursor-pointer hover:underline"
              >
                <span>Equity</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showProductDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleNavigate("/portfolio-tracker")}
                    >
                      Portfolio Tracker
                    </div>
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleNavigate("/longterm")}
                    >
                      Long Scanner
                    </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/chart")}
                  >
                    Historical Chart
                  </div>
                  
                </div>
              )}
            </div>

            {/* Tools */}
            <div className="relative">
              <div
                onClick={() => {
                  setShowToolsDropdown((v) => !v);
                  setShowCourseDropdown(false);
                  setShowProductDropdown(false);
                }}
                className="flex items-center space-x-1 cursor-pointer hover:underline"
              >
                <span>F&O</span>
                <FaChevronDown className="text-sm" />
              </div>
              {showToolsDropdown && (
                <div className="absolute left-0 mt-2 bg-white shadow-lg rounded-md w-44 z-20">
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/options")}
                  >
                    Option Chain
                  </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/trendingoi")}
                  >
                    Trending OI
                  </div>
                   <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/open-high")}
                  >
                    Open High
                  </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/herozero")}
                  >
                    Hero Zero
                  </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/individual")}
                  >
                    Individual Strike
                  </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/selling-scanner")}
                  >
                    Selling Scanner
                  </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleNavigate("/trading")}
                  >
                    Trading
                  </div>
                </div>
              )}
            </div>

            {renderLink("Contact Us", "/contact")}
          </div>
        </div>

        {/* Right: Mobile toggle + Profile */}
        <div className="flex items-center space-x-4">
          <div className="md:hidden">
            <button onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? (
                <FaTimes size={24} className="text-green-400" />
              ) : (
                <FaBars size={24} className="text-green-400" />
              )}
            </button>
          </div>

          <div className="relative ml-2 hidden md:block" ref={profileRef}>
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="flex items-center gap-1 focus:outline-none"
            >
              <AvatarPlaceholder />
              <FaChevronDown className="text-xs ml-1 hidden md:inline" />
            </button>
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 bg-white shadow-lg rounded-md w-36 z-30">
                {!user.isAuthenticated ? (
                  <>
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleNavigate("/signup")}
                    >
                      Signup
                    </div>
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleNavigate("/login")}
                    >
                      Login
                    </div>
                    
                  </>
                ) : (
                    <>
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleNavigate("/order")}
                    >
                      Order
                    </div>
                  <div
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={handleLogout}
                  >
                    Logout
                  </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-green-400 text-white px-4 pb-4 space-y-2">
          <div onClick={() => handleNavigate("/")}>Home</div>
          <div onClick={() => handleNavigate("/about")}>About Us</div>
          <div>
            <div
              onClick={() => setShowCourseDropdown((v) => !v)}
              className="flex items-center justify-between"
            >
              <span>Course</span> <FaChevronDown className="text-xs" />
            </div>
            {showCourseDropdown && (
              <div className="ml-4">
                <div
                  onClick={() => handleNavigate("/long-term-stocks-pick")}
                >
                  Long Term Stocks
                </div>
              </div>
            )}
          </div>
          <div>
            <div
              onClick={() => setShowProductDropdown((v) => !v)}
              className="flex items-center justify-between"
            >
              <span>Equity</span> <FaChevronDown className="text-xs" />
            </div>
            {showProductDropdown && (
              <div className="ml-4">
                <div onClick={() => handleNavigate("/longterm")}>
                      Long Scanner
                </div>
               <div onClick={() => handleNavigate("/portfolio-tracker")}>   
                  Portfolio Tracker
                </div>
                <div onClick={() => handleNavigate("/chart")}>Historical Chart</div>
               
              </div>
            )}
          </div>
          <div>
            <div
              onClick={() => setShowToolsDropdown((v) => !v)}
              className="flex items-center justify-between"
            >
              <span>F&O</span> <FaChevronDown className="text-xs" />
            </div>
            {showToolsDropdown && (
              <div className="ml-4">
                <div onClick={() => handleNavigate("/options")}>
                  Option Chain
                </div>
                <div onClick={() => handleNavigate("/trendingoi")}>
                  Trending OI
                </div>
                <div onClick={() => handleNavigate("/open-high")}>
                  Open High
                </div>
                <div onClick={() => handleNavigate("/herozero")}>
                  Hero Zero
                </div>
                <div onClick={() => handleNavigate("/individual")}>
                  Individual Strike
                </div>
                <div onClick={() => handleNavigate("/selling-scanner")}>
                  Selling Scanner
                </div>
                <div onClick={() => handleNavigate("/trading")}>
                  Traing
                </div>
              </div>
            )}
          </div>
          <div onClick={() => handleNavigate("/contact")}>Contact Us</div>

          {/* Mobile profile block */}
          <div className="mt-2 border-t border-green-300 pt-2">
            <div className="flex items-center gap-2">
              <AvatarPlaceholder />
              <div className="flex flex-col">
                {!user.isAuthenticated ? (
                  <>
                    <div
                      className="cursor-pointer hover:underline"
                      onClick={() => handleNavigate("/signup")}
                    >
                      Signup
                    </div>
                    <div
                      className="cursor-pointer hover:underline"
                      onClick={() => handleNavigate("/login")}
                    >
                      Login
                    </div>
                  </>
                ) : (
                  <>
                  <div
                    className="cursor-pointer hover:underline"
                    onClick={() => handleNavigate("/order")}
                  >
                    Order
                  </div>
                  <div
                    className="cursor-pointer hover:underline"
                    onClick={handleLogout}
                  >
                    Logout
                  </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
