import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "催事手配管理 | 安岡蒲鉾",
    template: "%s | 催事手配管理",
  },
  description: "安岡蒲鉾 催事手配管理システム",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/logo-square.png", type: "image/png" },
    ],
    apple: "/brand/logo-square.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
