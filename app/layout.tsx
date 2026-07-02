import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Landmark AI Search",
  description: "AI answer summaries for thelandmark.church site search",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Georgia, serif", margin: 0, background: "#f4f1ea" }}>{children}</body>
    </html>
  );
}
