"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function Header() {
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Completely hide the navigation header if the user is not logged in
  if (!user) return null;

  const navLinks = [
    { name: "Dashboard", href: "/" },
    { name: "Database", href: "/database" },
    { name: "Valuation Tool", href: "/valuation" },
    { name: "Lease Analytics", href: "/lease-analytics" },
    { name: "AI Query", href: "/ai-query" },
    { name: "Settings", href: "/settings" },
  ];

  const getInitials = (email: string) => {
    return email ? email.substring(0, 2).toUpperCase() : "U";
  };

  // If the user clicks the nav button for the page they are ALREADY on,
  // dispatch a custom baseline reset event so the active page immediately resets to its home/master state.
  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false);
    if (pathname === href && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("reAIgent:reset-page"));
    }
  };

  return (
    <header className="bg-[#0B132B] text-white shadow-md sticky top-0 z-50 border-b border-slate-800">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        
        {/* Logo / Brand */}
        <Link
          href="/"
          onClick={() => handleNavClick("/")}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity"
        >
          <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-slate-700/50 flex-shrink-0">
            <Image src="/reAIgent_V2.png" alt="reAIgent Logo" width={40} height={40} className="object-cover w-full h-full" priority />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">reAIgent</h1>
          </div>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex space-x-1 text-sm font-medium">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => handleNavClick(link.href)}
                className={`px-4 py-2 rounded-md transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Actions */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-200 leading-none">{user.email}</p>
            <p className="text-[10px] text-blue-400 mt-1 uppercase tracking-wider font-bold">{role || "Loading..."}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner">
            {getInitials(user.email)}
          </div>
          <button 
            onClick={signOut}
            className="text-xs font-bold text-slate-400 hover:text-white transition-colors border-l border-slate-700 pl-4 py-1 hidden sm:block"
          >
            LOGOUT
          </button>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/15 focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

      </div>

      {/* Mobile Dropdown Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-[#0B132B] border-t border-slate-800 px-4 pt-3 pb-5 space-y-2 animate-in slide-in-from-top duration-200">
          <div className="sm:hidden px-3 py-2 mb-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
            <p className="text-xs font-semibold text-slate-200 truncate">{user.email}</p>
            <p className="text-[10px] text-blue-400 mt-0.5 uppercase tracking-wider font-bold">{role || "Loading..."}</p>
          </div>

          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.name} 
                href={link.href} 
                onClick={() => handleNavClick(link.href)}
                className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.name}
              </Link>
            );
          })}

          <div className="pt-3 border-t border-slate-800 flex justify-between items-center px-2">
            <span className="text-xs text-slate-400">Signed in as {user.email}</span>
            <button 
              onClick={() => { setIsMobileMenuOpen(false); signOut(); }}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors py-1"
            >
              LOGOUT
            </button>
          </div>
        </div>
      )}
    </header>
  );
}