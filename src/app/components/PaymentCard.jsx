"use client";
import Image from "next/image";
import { FiArrowRight } from "react-icons/fi";

export default function PaymentCard({ image, title, price, description, signupLink, productId }) {
  const handleComplete = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      window.location.href = '/signup';
      return;
    }

    // Get user data from members API
    const membersRes = await fetch('/api/members');
    const { members } = await membersRes.json();
    const currentUser = members.find(member => member.id === userId);
    
    if (!currentUser) {
      window.location.href = '/signup';
      return;
    }

    const purchaseData = {
      title,
      price,
      mobile: currentUser.mobile,
      signupLink,
      productId
    };

    try {
      const res = await fetch("/api/savePurchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchaseData),
      });

      if (res.ok) {
        window.location.href = "/thanks";
      }
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <div style={{ background: "#fff" }}>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="w-full md:w-1/2 p-4">
            {typeof image === "string" ? (
              <img src={image} alt="Product" className="w-full max-w-[500px] mx-auto" />
            ) : (
              <Image src={image} alt="Product" className="w-full max-w-[500px] mx-auto" />
            )}
          </div>

          <div className="w-full md:w-1/2 p-4">
            <p className="text-lg font-bold mb-2 mt-10 text-gray-700">Scan To Pay</p>
            <p className="mb-1 text-3xl sm:text-4xl font-semibold mt-2 text-green-400">{title}</p>
            <p className="text-xxl font-bold my-2 text-gray-700">
              Rs: <span>{price}</span>
            </p>
            <p className="mb-4 pt-3 mt-2 text-gray-700 text-base sm:text-lg">{description}</p>

            <button
              onClick={handleComplete}
              className="mt-2 inline-flex bg-green-400 text-gray-700 px-6 mr-2 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 items-center justify-center gap-2 cursor-pointer"
            >
              Complete <FiArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
