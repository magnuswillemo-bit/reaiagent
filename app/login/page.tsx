"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Redirect to dashboard if they are already logged in
  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B132B] px-4">
      <div className="max-w-md w-full bg-[#151D35] p-8 rounded-2xl shadow-xl border border-slate-800 animate-in fade-in zoom-in duration-300">
        
        {/* Brand Icon & Wordmark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-slate-700/80 mb-3 bg-[#0F172A] flex items-center justify-center">
            {/* Architectural AI Monolith Logo */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 120 120"
              className="w-12 h-12"
              aria-label="reAIgent Logo"
            >
              <defs>
                <linearGradient id="loginTowerGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#60A5FA" />
                  <stop offset="100%" stopColor="#2563EB" />
                </linearGradient>
                <linearGradient id="loginTowerGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
                <linearGradient id="loginSparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#93C5FD" />
                </linearGradient>
              </defs>

              <path d="M20 96 H100" stroke="#334155" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M26 96 V58 L44 49 V96 Z" fill="url(#loginTowerGrad2)" opacity="0.9" />
              <path d="M49 96 V38 L69 27 V96 Z" fill="url(#loginTowerGrad1)" />
              <path d="M74 96 V46 L92 55 V96 Z" fill="#FFFFFF" opacity="0.95" />
              <path
                d="M85 14 C85 23 88 26 97 26 C88 26 85 29 85 38 C85 29 82 26 73 26 C82 26 85 23 85 14 Z"
                fill="url(#loginSparkGrad)"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white leading-none">
            re<span className="text-[#38BDF8]">AI</span>gent
          </h2>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 mt-2">
            Portfolio Intelligence
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/40 border border-rose-800 text-rose-200 text-xs px-4 py-3 rounded-lg mb-6 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wide">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-700/60 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wide">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-700/60 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3.5 px-4 rounded-lg shadow-lg hover:shadow-blue-500/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? "Signing in..." : "SIGN IN"}
          </button>
        </form>
      </div>
    </div>
  );
}