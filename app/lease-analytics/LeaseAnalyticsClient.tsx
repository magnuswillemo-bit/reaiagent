'use client';

import React, { useState, useEffect } from 'react';

export default function LeaseAnalyticsClient() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'financials'>('overview');

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 200);
    
    // Safe stylesheet handling to satisfy strict TypeScript rules
    const handleStyleSheets = () => {
      try {
        for (let i = 0; document.styleSheets && i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i] as CSSStyleSheet;
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j];
              if (rule && 'style' in rule) {
                // Safe inspection
              }
            }
          }
        }
      } catch (e) {
        console.warn('Stylesheet inspection note:', e);
      }
    };

    handleStyleSheets();
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex justify-center items-center min-h-[400px]">
        <div className="text-gray-500 text-lg font-medium animate-pulse">Loading Lease Analytics...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lease Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">Comprehensive real estate lease portfolio tracking and financial metrics.</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'overview' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'schedule' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Schedule & Terms
          </button>
          <button
            onClick={() => setActiveTab('financials')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'financials' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Financials
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Monthly Rental</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">R 87,018.75</p>
            <span className="text-xs text-green-600 font-semibold mt-1 inline-block">Active Lease Agreement</span>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Security Deposit</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">R 128,326.52</p>
            <span className="text-xs text-blue-600 font-semibold mt-1 inline-block">Held by Landlord / Agent</span>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Lease Period</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">24 Months</p>
            <span className="text-xs text-gray-500 font-semibold mt-1 inline-block">Expiring 28 Feb 2028</span>
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Lease Terms & Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div className="p-4 bg-gray-50 rounded-lg">
              <strong className="block text-gray-900 mb-1">Commencement Date</strong>
              01 March 2026
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <strong className="block text-gray-900 mb-1">Termination Date</strong>
              29 February 2028
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <strong className="block text-gray-900 mb-1">Rental Escalation</strong>
              10% per annum
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <strong className="block text-gray-900 mb-1">Property Description</strong>
              Villa Cap D'Afrique, Clifton, Cape Town
            </div>
          </div>
        </div>
      )}

      {activeTab === 'financials' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Financial Breakdown</h2>
          <p className="text-sm text-gray-600">Detailed expenditure, deposit interest tracking, and payment history.</p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Item</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm text-gray-700">
                <tr>
                  <td className="p-4 font-medium">Monthly Rental</td>
                  <td className="p-4">R 87,018.75</td>
                  <td className="p-4"><span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Current</span></td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Lease Agreement Fee</td>
                  <td className="p-4">R 450.00</td>
                  <td className="p-4"><span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Settled</span></td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Credit Check Fee</td>
                  <td className="p-4">R 100.00</td>
                  <td className="p-4"><span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Settled</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}