import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "システム",
  description: "After-Service Management System",
  manifest: "/manifest.json",
  themeColor: "#111111",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "システム" },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
    shortcut: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="icon" href="/icon.png" />
      </head>
      <body className="h-dvh flex flex-col overflow-hidden bg-gray-900">
        <SessionProvider>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
          <BottomNav />
        </SessionProvider>
      </body>
    </html>
  );
}
