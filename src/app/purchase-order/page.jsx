"use client";
import { useAccessControl } from "@/hooks/useAccessControl";
import { useEffect, useState } from "react";

export default function PurchaseOrderPage() {
  const { hasAccess, loading } = useAccessControl('/purchase-order');
  const [orders, setOrders] = useState([]);

  const fetchOrders = async () => {
    const res = await fetch("/api/getPurchases");
    const data = await res.json();

    // Sort: pending first, then by date (latest first)
    const sortedData = data.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.date) - new Date(a.date); // latest first
    });

    setOrders(sortedData);
  };

  const updateStatus = async (id, status) => {
    await fetch("/api/updateStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchOrders();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">📦 Purchase Orders</h1>
      <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
        <table className="w-full text-sm text-left text-gray-700">
          <thead className="bg-blue-200 text-gray-700">
            <tr>
              <th className="p-4">Order ID</th>
              <th className="p-4">Title</th>
              <th className="p-4">Price</th>
              <th className="p-4">Mobile</th>
              <th className="p-4">Date & Time</th>
              <th className="p-4">Status</th>
              <th className="p-4">Action</th>
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
                  <td className="p-4">{order.title}</td>
                  <td className="p-4 text-green-600 font-semibold">
                    ₹ {order.price}
                  </td>
                  <td className="p-4">{order.mobile}</td>
                  <td className="p-4 text-gray-600">
                    {order.date ? formatDate(order.date) : "—"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        order.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4">
                    {order.status === "pending" && (
                      <button
                        onClick={() => updateStatus(order.id, "complete")}
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-lg shadow-md transition duration-150"
                      >
                        ✅ Mark Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="p-6 text-center text-gray-500">
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
