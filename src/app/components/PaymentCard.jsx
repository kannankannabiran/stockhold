"use client";
import Image from "next/image";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import { useState } from "react";

export default function PaymentCard({ image, title, price, description, signupLink }) {
  const [mobile, setMobile] = useState("");
  const [touched, setTouched] = useState(false);

  const isValidMobile = /^\d{10}$/.test(mobile);
  const showError = touched && !isValidMobile;
  const userMobile = localStorage.getItem('user')

  const handleComplete = (data)=>{
    const {title, price, description, signupLink} = data;
    console.log("purchase product",data)
  }

  return (
    <div style={{ background: "#fff" }}>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Image */}
          <div className="w-full md:w-1/2 p-4">
            {/* If image is a string path, use standard <img>; if it's imported, use next/image */}
            {typeof image === "string" ? (
              // fallback to regular image if not imported
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt="Product"
                className="w-full max-w-[500px] mx-auto"
              />
            ) : (
              <Image
                src={image}
                alt="Product"
                className="w-full max-w-[500px] mx-auto"
              />
            )}
          </div>

          {/* Text */}
          <div className="w-full md:w-1/2 p-4">
            <p className="text-lg font-bold mb-2 mt-10 text-gray-700">
              Scan To Pay
            </p>
            <p className="mb-1 text-3xl sm:text-4xl font-semibold mt-2 text-green-400">
              {title}
            </p>
            <p className="text-xxl font-bold my-2 text-gray-700">
              Rs: <span>{price}</span>
            </p>
            <p className="mb-4 pt-3 mt-2 text-gray-700 text-base sm:text-lg">
              {description}
            </p>

            {/* Input + Button */}
            <div className="sm:block flex flex-col sm:flex-row gap-4 mt-5">
              {/* <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="9876543210"
                    value={mobile}
                    onChange={(e) =>
                      setMobile(e.target.value.replace(/\D/g, ""))
                    }
                    onBlur={() => setTouched(true)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      showError ? "border-red-500" : "border-gray-300"
                    } focus:outline-none focus:ring-2 focus:ring-green-300`}
                  />
                </div>
                {showError && (
                  <p className="mt-1 text-xs text-red-600">
                    Please enter a valid 10-digit mobile number.
                  </p>
                )}
              </div> */}

              <Link
                href={signupLink}
                onClick={()=>handleComplete({title:title, price:price, mobile:userMobile, signupLink:signupLink })}
                className="mt-2 inline-flex bg-green-400 text-gray-700 px-6 mr-2 py-2 rounded-lg hover:bg-green-600 hover:text-white transition duration-200 items-center justify-center gap-2"
              >
                Compleate<FiArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
