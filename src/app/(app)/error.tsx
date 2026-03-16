"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error Boundary]", error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto mt-20 p-6">
      <h2 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h2>
      <pre className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4 whitespace-pre-wrap overflow-auto max-h-60">
        {error.message}
        {error.stack && "\n\n" + error.stack}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
