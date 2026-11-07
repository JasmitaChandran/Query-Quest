import type { Metadata } from "next";

import { DatabaseBootstrap } from "@/components/database-bootstrap";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QueryQuest — SQL Playground",
    template: "%s — QueryQuest",
  },
  description:
    "A browser-native SQL playground for exploring databases, visualizing queries, and teaching SQL.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <DatabaseBootstrap />
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
