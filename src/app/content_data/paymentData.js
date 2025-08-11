// content_data/paymentData.js
const paymentProducts = [
  {
    id: "candlestick",
    image: "/candlestick_payment.svg", // you can also import in the page if you prefer
    title: (
      <>
        All <span className="text-green-400">Candle Stick</span> Pattern
      </>
    ),
    price: 199,
    description:
      "Hey there! So glad you stopped by to Meet Our Company. Don’t miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we’re dedicated to delivering results that exceed expectations.",
    signupLink: "/thanks",
  },
    {
    id: "Longtermstock",
    image: "/longtermstockscourse.svg", // you can also import in the page if you prefer
    title: (
      <>
        How to Select <span className="text-green-400">Long Term Stocks</span> 
      </>
    ),
    price: 4999,
    description:
      "Hey there! So glad you stopped by to Meet Our Company. Don’t miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we’re dedicated to delivering results that exceed expectations.",
    signupLink: "/thanks",
  },
    {
    id: "Longtermstockscanner",
    image: "/payment-longterm-scanner.svg", // you can also import in the page if you prefer
    title: (
      <>
        Scanner For <span className="text-green-400">Long Term Stocks</span> 
      </>
    ),
    price: 2499,
    description:
      "Hey there! So glad you stopped by to Meet Our Company. Don’t miss out on this opportunity to learn about what we do and the amazing team that makes it all happen! Our company is all about creating innovative solutions and providing top-notch services to our clients. From start to finish, we’re dedicated to delivering results that exceed expectations.",
    signupLink: "/thanks",
  },
];

export default paymentProducts;
