import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ServerTool Test",
    template: "ServerTool - %s",
  },
  description: "Manage and execute shell commands via a streaming terminal interface.",
};

export const viewport: Viewport = {
  themeColor: "#131313",
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased h-[100dvh] overflow-hidden bg-surface text-on-surface font-body">
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
