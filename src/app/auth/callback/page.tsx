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
      // Case 1: PKCE flow — ?code= in URL query string
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
      // The @supabase/ssr client does NOT auto-parse hash fragments,
      // so we manually extract the tokens and set the session.
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          const { data, error: err } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (err) {
            setError(err.message);
            return;
          }

          if (data?.session?.user) {
            // Clear the hash from URL
            window.history.replaceState(null, "", window.location.pathname);
            await markInvitationAccepted(data.session.user.email);
            router.replace("/set-password");
            return;
          }
        }
      }

      // Case 3: Check for existing session (user may already be authenticated)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await markInvitationAccepted(session.user.email);
        router.replace("/set-password");
        return;
      }

      // Nothing worked — redirect to login
      setError("Unable to verify your invitation. The link may have expired.");
    }

    async function markInvitationAccepted(email: string | undefined) {
      if (!email) return;
      try {
        await fetch("/api/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } catch {
        // Non-critical
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
