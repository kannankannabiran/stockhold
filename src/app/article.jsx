"use client";
import { useState, useRef, useEffect } from "react";
import { FiArrowRight } from "react-icons/fi";
import { FaPlus, FaMinus } from "react-icons/fa";
import articles from "./content_data/articlesData"; // adjust path as needed
import Link from "next/link";

export default function PopularArticles() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="container mx-auto px-4 py-8 mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-blue-600">Popular Trading Articles</h2>
        <Link href="/signup" className="bg-blue-500 text-white px-5 py-2 rounded-md flex items-center gap-2 hover:bg-blue-700 transition cursor-pointer">
          Get Started <FiArrowRight />
        </Link>
      </div>

      {/* Accordion */}
      <div className="space-y-4">
        {articles.map((item, index) => (
          <AccordionItem
            key={index}
            title={item.title}
            content={item.content}
            isOpen={openIndex === index}
            onClick={() => toggle(index)}
          />
        ))}
      </div>
    </div>
  );
}

function AccordionItem({ title, content, isOpen, onClick }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState("0px");

  useEffect(() => {
    if (isOpen) {
      setHeight(`${contentRef.current.scrollHeight}px`);
    } else {
      setHeight("0px");
    }
  }, [isOpen]);

  return (
    <div className="rounded-md bg-white shadow-sm overflow-hidden transition-all">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <span className="text-gray-500">
          {isOpen ? <FaMinus /> : <FaPlus />}
        </span>
      </button>

      <div
        ref={contentRef}
        style={{ height }}
        className="transition-all duration-300 ease-in-out overflow-hidden px-4"
      >
        <p className="py-2 text-gray-600">{content}</p>
      </div>
    </div>
  );
}
