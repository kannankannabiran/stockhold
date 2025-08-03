// ServiceCards.jsx / .tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import services from "./content_data/servicesData";

export default function ServiceCards() {
  return (
    <div className="container mx-auto py-4">
      {/* Title */}
      <h2 className="text-4xl font-bold text-blue-700 mb-2 mt-5 text-center">
        We Offer Services
      </h2>

      {/* Paragraph */}
      <p className="max-w-2xl mx-auto text-gray-600 mb-8 text-center">
        Anyone can invest money in different currencies to increase their earnings
        <span className="block">with the help of Bitrader online.</span>
      </p>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {services.map((service, index) => {
          const content = (
            <div
              aria-label={service.title}
              className={`group flex flex-col items-center bg-white shadow-md rounded-lg p-6 transition duration-200 text-center ${
                service.link
                  ? "hover:bg-green-500 hover:text-white cursor-pointer"
                  : "opacity-90 cursor-default"
              }`}
            >
              <div className="w-16 h-16 relative mb-2">
                <Image
                  src={service.icon}
                  alt={`${service.title} Icon`}
                  fill
                  sizes="64px"
                  className="object-contain"
                  priority={index < 3}
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">{service.title}</h3>
              <p
                className={`transition duration-200 ${
                  service.link ? "group-hover:text-white text-gray-600" : "text-gray-600"
                }`}
              >
                {service.description}
              </p>
            </div>
          );

          return service.link ? (
            <Link key={index} href={service.link} aria-label={service.title}>
              {content}
            </Link>
          ) : (
            <div key={index}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
