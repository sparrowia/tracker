"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
        <h2 style={{ color: "#b91c1c" }}>Something went wrong</h2>
        <pre style={{
          fontSize: "13px",
          color: "#dc2626",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "6px",
          padding: "12px",
          whiteSpace: "pre-wrap",
          overflow: "auto",
          maxHeight: "300px",
        }}>
          {error.message}
          {error.stack && "\n\n" + error.stack}
        </pre>
        <button
          onClick={reset}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            fontSize: "14px",
            color: "white",
            background: "#2563eb",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
