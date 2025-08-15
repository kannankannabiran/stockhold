"use client";
import { useAccessControl } from "@/hooks/useAccessControl";
import { useEffect, useState } from "react";

const PRODUCT_ROUTE_MAP = {
  "Longtermstock": "/order",
  "Longtermstockscanner": "/longterm",
  "candlestick": true
};

export default function PurchaseOrderPage() {
  const { hasAccess, loading } = useAccessControl("/order");
  const [orders, setOrders] = useState([]);
  const [mounted, setMounted] = useState(false);

  const fetchOrders = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    const response = await fetch('/api/members');
    const { members } = await response.json();
    const currentUser = members.find(member => member.id === userId);
    
    if (!currentUser) return;

    const res = await fetch("/api/getPurchases");
    const data = await res.json();

    // Filter only for current logged-in mobile number
    const filteredData = data.filter(
      (order) => order.mobile === currentUser.mobile
    );

    // Sort by date (latest first)
    const sortedData = filteredData.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    setOrders(sortedData);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = '/Candlestick-and-chart-patterns.pdf';
    link.download = 'Candlestick-and-chart-patterns.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  useEffect(() => {
    setMounted(true);
    fetchOrders();
  }, []);

  if (!mounted || loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">
        📦 Orders
      </h1>
      <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
        <table className="w-full text-sm text-left text-gray-700">
          <thead className="bg-blue-200 text-gray-700">
            <tr>
              <th className="p-4">Order ID</th>
              <th className="p-4">Title</th>
              <th className="p-4">Price</th>
              <th className="p-4">Mobile</th>
              <th className="p-4">Date & Time</th>
              <th className="p-4">Purchase</th>
            </tr>
          </thead>
          <tbody>
            {orders.length > 0 ? (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 transition duration-150"
                >
                  <td className="p-4 font-semibold text-gray-800">{order.id}</td>
                  <td className="p-4">{typeof order.title === 'string' ? order.title : 'Product Title'}</td>
                  <td className="p-4 text-green-600 font-semibold">
                    ₹ {order.price}
                  </td>
                  <td className="p-4">{order.mobile}</td>
                  <td className="p-4 text-gray-600">
                    {order.date ? formatDate(order.date) : "—"}
                  </td>
                  <td className="p-4">
                    {order.status === 'complete' ? (
                      PRODUCT_ROUTE_MAP[order.productId] === true ? (
                        <button
                          onClick={handleDownload}
                          className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-lg shadow-md transition duration-150 cursor-pointer"
                        >
                          Download
                        </button>
                      ) : (
                        <button
                          onClick={() => window.location.href = PRODUCT_ROUTE_MAP[order.productId]}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded-lg shadow-md transition duration-150 cursor-pointer"
                        >
                          View
                        </button>
                      )
                    ) : (
                      <span className="bg-yellow-100 text-yellow-700 px-4 py-1 rounded-lg text-sm font-semibold">
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="p-6 text-center text-gray-500">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
