import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "案件管理システム",
  description: "案件管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full bg-gray-50">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
