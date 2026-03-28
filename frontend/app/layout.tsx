import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#131313" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased min-h-screen bg-surface text-on-surface font-body">
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
