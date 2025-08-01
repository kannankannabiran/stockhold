"use client";

import Image from "next/image";
import services from "./content_data/servicesData";

export default function ServiceCards() {
  return (
    <div className="container mx-auto py-4">
      {/* Title */}
      <h2 className="text-4xl font-bold text-blue-700 mb-2 mt-5 text-center">We offer Services</h2>

      {/* Paragraph */}
      <p className="max-w-2xl mx-auto text-gray-600 mb-8 text-center">
        Anyone can invest money in different currencies to increase their earnings
        <span className="block">with the help of Bitrader through online.</span>
      </p>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {services.map((service, index) => (
          <div
            key={index}
            className="bg-white shadow-md rounded-lg p-6 hover:bg-green-500 hover:text-white group transition duration-200 cursor-pointer text-center"
          >
            <Image
              src={service.icon}
              alt={`${service.title} Icon`}
              className="w-1/5 mx-auto my-2"
            />
            <h3 className="text-xl font-semibold mb-2">{service.title}</h3>
            <p className="text-gray-600 group-hover:text-white transition duration-200">
              {service.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
