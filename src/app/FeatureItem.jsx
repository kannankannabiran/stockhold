import Image from "next/image";

export default function FeatureItem({ icon, title, description }) {
  return (
    <div className="flex items-start space-x-4 py-4">
      <Image src={icon} alt={title} width={64} height={64} className="object-contain" />
      <div>
        <h2 className="text-xl font-bold text-blue-700">{title}</h2>
        <p className="text-gray-600 text-base mb-2">{description}</p>
      </div>
    </div>
  );
}
