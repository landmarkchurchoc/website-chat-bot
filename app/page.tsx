import Script from "next/script";

// Internal test page — mimics the Webflow search page so the widget can be
// exercised end-to-end before embedding on thelandmark.church.
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontWeight: 400 }}>Landmark AI Search — test page</h1>
      <p style={{ color: "#666" }}>
        Type a question and press Enter. This page uses the same <code>widget.js</code> you will
        embed on the Webflow site.
      </p>
      <input
        type="search"
        placeholder='Try: "What time are Sunday services?" or "How do I forgive someone?"'
        style={{
          width: "100%",
          padding: "14px 16px",
          fontSize: 16,
          border: "1px solid #ccc",
          borderRadius: 10,
          marginBottom: 24,
          boxSizing: "border-box",
        }}
      />
      <div data-ai-answer />
      <Script src="/widget.js" strategy="afterInteractive" />
    </main>
  );
}
