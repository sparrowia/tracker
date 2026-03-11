"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function handleCallback() {
      // Case 1: PKCE flow — ?code= in URL
      const code = searchParams.get("code");
      if (code) {
        const { data, error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) {
          setError(err.message);
          return;
        }
        if (data?.user) {
          await markInvitationAccepted(data.user.email);
          router.replace("/set-password");
          return;
        }
      }

      // Case 2: Implicit flow — #access_token= in hash fragment
      // The Supabase client auto-parses hash fragments on init.
      // Give it a moment to process, then check for session.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await markInvitationAccepted(session.user.email);
        router.replace("/set-password");
        return;
      }

      // Case 3: Listen for auth state change (hash parsing may be async)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          subscription.unsubscribe();
          await markInvitationAccepted(session.user.email);
          router.replace("/set-password");
        }
      });

      // Timeout — if nothing happens in 5 seconds, redirect to login
      setTimeout(() => {
        subscription.unsubscribe();
        router.replace("/login");
      }, 5000);
    }

    async function markInvitationAccepted(email: string | undefined) {
      if (!email) return;
      try {
        // Use a server endpoint to mark invitation accepted (needs admin client)
        await fetch("/api/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } catch {
        // Non-critical — invitation acceptance is a nice-to-have
      }
    }

    handleCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <p className="text-red-600 text-sm">{error}</p>
          <a href="/login" className="text-blue-600 hover:text-blue-800 text-sm">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-2">
        <div className="text-gray-500 text-sm">Setting up your account...</div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
