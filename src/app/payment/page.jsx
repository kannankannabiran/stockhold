import PaymentCard from "@/app/components/PaymentCard";
import paymentProducts from "@/app/content_data/paymentData";
import Footer from "../Footer/page";

export default function PaymentPage() {
  return (
    <>
      {paymentProducts.map((prod) => (
        <PaymentCard
          key={prod.id}
          image={prod.image}
          title={prod.title}
          price={prod.price}
          description={prod.description}
          signupLink={prod.signupLink}
        />
      ))}
      <Footer />
    </>
  );
}
