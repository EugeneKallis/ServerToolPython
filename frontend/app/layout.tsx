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
    default: "ServerTool",
    template: "ServerTool - %s",
  },
  description: "Manage and execute shell commands via a streaming terminal interface.",
};

import Navigation from "./components/Navigation";
import { TerminalProvider } from "./context/TerminalContext";
import { MacroProvider } from "./context/MacroContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <TerminalProvider>
          <MacroProvider>
            <Navigation>
              {children}
            </Navigation>
          </MacroProvider>
        </TerminalProvider>
      </body>
    </html>
  );
}
