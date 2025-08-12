import PaymentCard from "@/app/components/PaymentCard";
import paymentProducts from "@/app/content_data/paymentData";
import Footer from "@/app/Footer/page";

export default async function PaymentDetailPage({ params }) {
  const { id } = await params; // ✅ Await here

  const product = paymentProducts.find((p) => p.id === id);

  if (!product) {
    return <div className="p-6 text-red-500">Product not found</div>;
  }

  return (
    <>
      <PaymentCard
        key={product.id}
        image={product.image}
        title={product.title}
        price={product.price}
        description={product.description}
        signupLink={product.signupLink}
      />
      <Footer />
    </>
  );
}
