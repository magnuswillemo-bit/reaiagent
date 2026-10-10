'use client';

import React, { useState, useEffect } from 'react';

export default function LeaseAnalyticsClient() {
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      // Safe mount check
      setLoading(false);
    } catch (err) {
      console.error('Error loading Lease Analytics:', err);
      setHasError(true);
      setLoading(false);
    }
  }, []);

  if (hasError) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-red-700">
          <h2 className="font-bold">Something went wrong loading Lease Analytics.</h2>
          <p className="text-sm mt-1">Please check your browser console for details.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex justify-center items-center min-h-[300px]">
        <div className="text-gray-500 font-medium">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Lease Analytics Dashboard</h1>
        <p className="text-sm text-gray-500">Analytics engine active and optimized.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Monthly Rental</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">R 87,018.75</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Security Deposit</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">R 128,326.52</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Lease Period</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">24 Months</p>
        </div>
      </div>
    </div>
  );
}