import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Schedulely | Student Scheduling",
  description: "AI-assisted student scheduler with wellness-aware planning and daily check-ins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
