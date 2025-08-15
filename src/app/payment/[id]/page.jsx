"use client";
import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import PaymentCard from "@/app/components/PaymentCard";
import paymentProducts from "@/app/content_data/paymentData";
import Footer from "@/app/Footer/page";
import { usePurchaseCheck } from "@/hooks/usePurchaseCheck";

export default function PaymentDetailPage({ params }) {
  const router = useRouter();
  const { id } = use(params);

  useEffect(() => {
    const checkPurchase = async () => {
      const userId = localStorage.getItem('userId');
      if (!userId) return;
      
      const result = await usePurchaseCheck(id, userId);
      if (result.shouldRedirect) {
        router.push(result.redirectUrl);
        return;
      }
    };
    
    checkPurchase();
  }, [id]);

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
        productId={product.id}
      />
      <Footer />
    </>
  );
}