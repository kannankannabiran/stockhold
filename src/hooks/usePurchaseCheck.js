const PRODUCT_ROUTE_MAP = {
  "Longtermstock": "/order",
  "Longtermstockscanner": "/longterm",
  "candlestick": "/order"
};

export const usePurchaseCheck = async (productId, userId) => {
  try {
    if (!userId) return { hasPurchase: false, shouldRedirect: true, redirectUrl: '/signup' };

    const response = await fetch('/api/members?userId=' + userId);
    const { members } = await response.json();
    const currentUser = members.find(member => member.id === userId);

    if (!currentUser) return { hasPurchase: false, shouldRedirect: false };

    const purchasesResponse = await fetch('/api/getPurchases');
    const purchases = await purchasesResponse.json();

    const existingPurchase = purchases.find(
      purchase => purchase.productId === productId && 
                 purchase.mobile === currentUser.mobile
    );
    
    if (existingPurchase) {
      if (existingPurchase.status === 'pending') {
        return { 
          hasPurchase: true, 
          shouldRedirect: true,
          redirectUrl: '/thanks'
        };
      } else if (existingPurchase.status === 'complete') {
        const redirectPath = PRODUCT_ROUTE_MAP[productId];
        return { 
          hasPurchase: true, 
          shouldRedirect: true,
          redirectUrl: redirectPath || `/payment/${productId}`
        };
      }
    }
    
    return { 
      hasPurchase: false, 
      shouldRedirect: false
    };
  } catch (err) {
    console.error(err);
    return { hasPurchase: false, shouldRedirect: false };
  }
};