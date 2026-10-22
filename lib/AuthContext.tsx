"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "./supabase";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
  user: any | null;
  role: "SuperUser" | "Admin" | "User" | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<"SuperUser" | "Admin" | "User" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    const fetchProfileRole = async (userId: string) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      // Explicit cast to prevent TypeScript from throwing an 'any' type mismatch
      return (profile?.role as "SuperUser" | "Admin" | "User") || "User";
    };

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const userRole = await fetchProfileRole(session.user.id);
        if (mounted) {
          setUser(session.user);
          setRole(userRole);
        }
      }
      if (mounted) setIsLoading(false);
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (session?.user) {
          const userRole = await fetchProfileRole(session.user.id);
          if (mounted) {
            setUser(session.user);
            setRole(userRole);
          }
        }
      } else if (event === "SIGNED_OUT") {
        if (mounted) {
          setUser(null);
          setRole(null);
        }
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // App Routing Protection logic
  useEffect(() => {
    if (!isLoading) {
      if (!user && pathname !== "/login") {
        router.push("/login");
      } else if (user && pathname === "/login") {
        router.push("/"); // Redirect logged-in users away from the login screen to the dashboard
      }
    }
  }, [user, isLoading, pathname, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, role, isLoading, signOut }}>
      {/* Prevent UI flashing before auth is confirmed */}
      {!isLoading ? children : (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
           <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}