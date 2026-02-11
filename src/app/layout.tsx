import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asset Studio | App Store Asset Generator",
  description: "Create high-converting App Store screenshots in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
