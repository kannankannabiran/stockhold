// app/components/HeroSection.jsx
import Image from "next/image";
import FeatureItem from "@/app/FeatureItem";
import featuresData from "@/app/content_data/featuresData";
import Mentor_img from '../../public/kannabiran.svg';

export default function HeroSection() {
  return (
    <div style={{background:'#F9FAFC'}}>
    <div className="container mx-auto py-8 px-4">
  <div className="flex flex-col md:flex-row items-center justify-between gap-8">
    {/* Left Column */}
    <div className="w-full md:w-1/2">
      <h2 className="text-3xl sm:text-4xl font-bold mb-2">Choose Your Right</h2>
      <p className="mb-4 text-3xl sm:text-4xl font-semibold">
        <span className="font-semibold text-blue-700">Mentor</span>
      </p>

      {/* Loop through data */}
      {featuresData.map((item, index) => (
        <FeatureItem
          key={index}
          icon={item.icon}
          title={item.title}
          description={item.description}
        />
      ))}
    </div>

    {/* Right Column */}
    <div className="w-full md:w-1/2">
      <Image
        src={Mentor_img}
        alt="Chart"
        className="w-full max-w-[450px] mx-auto mix-blend-luminosity hover:mix-blend-normal hover:ease-in-out"
      />
    </div>
  </div>
</div>
</div>
  );
}
