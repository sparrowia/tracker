"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const deactivated = searchParams.get("error") === "account_deactivated";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    deactivated ? "Your account has been deactivated. Contact your administrator." : null
  );
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const loginSubmittedRef = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  // Detect invite tokens: Supabase may redirect here with auth tokens in the
  // URL hash (#access_token=...) or as a ?code= param. The Supabase client
  // auto-parses hash tokens. We listen for SIGNED_IN to catch both cases and
  // redirect invited users to /set-password instead of showing a useless login form.
  useEffect(() => {
    // Handle ?code= (PKCE flow) — exchange it immediately
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        if (!err && data?.session) {
          router.replace("/set-password");
        } else {
          setChecking(false);
        }
      });
      return;
    }

    // Check for existing session (from hash fragment auto-parse or prior login)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // User already has a session — check if they need to set a password
        // Invited users have role in user_metadata set by inviteUserByEmail
        const meta = session.user.user_metadata;
        if (meta?.role && !deactivated) {
          router.replace("/set-password");
          return;
        }
        // Already logged in with a password — go to dashboard
        if (!deactivated) {
          router.replace("/dashboard");
          return;
        }
      }
      setChecking(false);
    });

    // Listen for auth state change from hash fragment processing
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !loginSubmittedRef.current) {
        // Authenticated via invite link tokens — redirect to set password
        router.replace("/set-password");
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    loginSubmittedRef.current = true;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      loginSubmittedRef.current = false;
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address"); return; }
    setError(null);
    setResetLoading(true);

    const siteUrl = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/set-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setResetLoading(false);
  }

  if (checking) {
    return (
      <div className="mt-8 text-center text-sm text-gray-500">
        Checking authentication...
      </div>
    );
  }

  if (resetMode) {
    return (
      <div className="mt-8 space-y-6">
        {resetSent ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
            Password reset link sent to <strong>{email}</strong>. Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}
            <p className="text-sm text-gray-600">Enter your email and we'll send you a link to reset your password.</p>
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@edcet.com"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {resetLoading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
        <button
          onClick={() => { setResetMode(false); setResetSent(false); setError(null); }}
          className="w-full text-center text-sm text-blue-600 hover:text-blue-800"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleLogin} className="mt-8 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@edcet.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => { setResetMode(true); setError(null); }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Forgot password?
            </button>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Edcetera
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Project Tracker
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
