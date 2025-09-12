import ChartClient from "./coursepage";

// ✅ Metadata allowed here (server component)
export const metadata = {
  title: "How to Select Long Term Stocks | Investment Course",
  description:
    "Learn proven methods of identifying long-term stocks. This course covers fundamentals, technicals, AI indicators, risk management, and advanced option strategies.",
  keywords: [
    "long term stocks",
    "stock market course",
    "fundamental analysis",
    "technical analysis",
    "AI trading",
    "option trading",
    "investment strategies"
  ],
  openGraph: {
    title: "How to Select Long Term Stocks | Investment Course",
    description:
      "Master stock market investing with our beginner-to-advanced course. Learn AI tools, FII/DII insights, and exact entry points for long-term profits.",
    url: "https://stockhold.comin/long-term-stocks-pick", // replace with your actual domain
    siteName: "Your Brand",
    images: [
      {
        url: "/onetoone.svg",
        width: 800,
        height: 600,
        alt: "Stock Market Training",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Select Long Term Stocks | Investment Course",
    description:
      "Step-by-step course on long-term stock investing with fundamentals, technicals, AI indicators, and risk management.",
    images: ["/onetoone.svg"],
    creator: "@yourtwitterhandle",
  },
};

export default function ChartPage() {
  return <ChartClient />;
}
