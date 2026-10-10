"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Invalid email or password. Please contact the SuperUser if you have lost your credentials.");
      setIsLoading(false);
    }
    // If successful, the AuthContext automatically detects the session and redirects to the Dashboard.
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0B132B]">
      
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4f4f4f 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        
        <div className="bg-slate-50 p-8 border-b border-slate-200 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm border border-slate-300 mb-4">
            <Image src="/reAIgent_V2.png" alt="reAIgent Logo" width={64} height={64} className="object-cover w-full h-full" priority />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">reAIgent Login</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Enterprise Real Estate Analytics</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-lg text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Email Address</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-3 outline-none transition-all" 
                placeholder="Enter your registered email"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Password</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-3 outline-none transition-all" 
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all text-sm disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Authenticating...
                </>
              ) : "Access Platform"}
            </button>
          </form>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Secure Access Controlled By Platform SuperUser</p>
        </div>

      </div>
    </div>
  );
}