"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function Header() {
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
  
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

  return (
    <header className="bg-[#0B132B] text-white shadow-md sticky top-0 z-50 border-b border-slate-800">
      <div className="max-w-[1600px] mx-auto px-8 h-16 flex items-center justify-between">
        
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-slate-700/50 flex-shrink-0">
            <Image src="/reAIgent_V2.png" alt="reAIgent Logo" width={40} height={40} className="object-cover w-full h-full" priority />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">reAIgent</h1>
          </div>
        </Link>
        
        <nav className="hidden md:flex space-x-1 text-sm font-medium">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.name} href={link.href} className={`px-4 py-2 rounded-md transition-all ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:text-white hover:bg-white/10"}`}>
                {link.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-200 leading-none">{user.email}</p>
            <p className="text-[10px] text-blue-400 mt-1 uppercase tracking-wider font-bold">{role || "Loading..."}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner">
            {getInitials(user.email)}
          </div>
          <button 
            onClick={signOut}
            className="text-xs font-bold text-slate-400 hover:text-white transition-colors border-l border-slate-700 pl-5 py-1"
          >
            LOGOUT
          </button>
        </div>

      </div>
    </header>
  );
}