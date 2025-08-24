"use client";
import { useState } from "react";
import Image from "next/image";
import { FaYoutube, FaInstagram, FaWhatsapp, FaTelegram, FaTwitter, FaPhoneAlt } from "react-icons/fa";
import { FiArrowRight } from "react-icons/fi";
import Home_page_monitor from "../../../public/contact_page_img.svg";
import Footer from "../Footer/page";
import Link from "next/link";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setSuccess(true);
        setFormData({ name: "", mobile: "", email: "", message: "" });
      }
    } catch (err) {
      console.error("Mail send error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <div style={{ backgroundImage: 'url("/contact_bg.svg")', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="container mx-auto py-8 px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Image */}
            <div className="w-full md:w-1/2 p-4">
              <Image src={Home_page_monitor} alt="Chart" className="w-full max-w-[500px] mx-auto" />
            </div>

            {/* Text */}
            <div className="w-full md:w-1/2 p-4">
              <h2 className="text-3xl sm:text-4xl font-bold mb-2 md:mt-10 text-white">Contact Us</h2>
              <p className="mb-4 pt-3 mt-2 text-white text-base sm:text-lg">
                Hey there! So glad you stopped by to Meet Our Company. Don't miss out on this opportunity to learn about
                what we do and the amazing team that makes it all happen!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-5">
                <Link href="/signup" className="bg-green-600 text-gray-700 px-6 py-2 rounded-lg hover:bg-green-700 hover:text-white transition duration-200 flex items-center gap-2 cursor-pointer justify-center">
                  Get Started <FiArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="bg-[#00150F] text-white p-10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          {/* Left */}
          <div>
            <h2 className="text-3xl font-bold mb-6">
              Let's <span className="text-green-400">get in touch</span>
              <span className="block"> with us</span>
            </h2>

            <div className="flex space-x-6 text-3xl mb-4">
              <a href="https://www.youtube.com/@stockholdin" target="_blank" className="hover:text-red-600"><FaYoutube /></a>
              <a href="https://www.instagram.com/stockhold.in/" target="_blank" className="hover:text-pink-500"><FaInstagram /></a>
              {/* <a href="#" className="hover:text-green-500"><FaWhatsapp /></a> */}
              <a href="https://web.telegram.org/k/#@stockholdin" target="_blank" className="hover:text-blue-400"><FaTelegram /></a>
              {/* <a href="#" className="hover:text-blue-500"><FaTwitter /></a> */}
            </div>

            <p className="flex items-center gap-2 text-green-400 text-lg font-semibold mt-2">
              <FaPhoneAlt className="text-white" /> Contact: <span className="text-white">7200630057</span>
            </p>
          </div>

          {/* Right: Form */}
          <div className="rounded-xl shadow-lg text-white">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="block mb-1 font-medium text-white">Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-white">Mobile</label>
                <input
                  type="tel"
                  placeholder="Enter your mobile number"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-white">Email</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-white">Message</label>
                <textarea
                  rows="4"
                  placeholder="Type your message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 transition-colors duration-200 text-white px-6 py-3 rounded-md w-full text-lg font-semibold cursor-pointer"
                disabled={loading}
              >
                {loading ? "Sending..." : "Submit"}
              </button>

              {success && (
                <p className="text-green-600 font-medium mt-2">✅ Message sent successfully!</p>
              )}
            </form>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
