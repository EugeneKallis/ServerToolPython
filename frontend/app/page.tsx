import type { Metadata } from "next";
import ChatTerminal from "./components/ChatTerminal";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: { absolute: "ServerTool - Terminal" } };

export default function Home() {
  const env = process.env.APP_ENVIRONMENT || 'Local';
  const tag = process.env.APP_DOCKER_TAG || 'dev';

  return (
    <div className="h-full w-full flex flex-col p-4 lg:p-6 min-h-0 bg-surface-dim">
      <div className="flex-1 min-h-0">
        <ChatTerminal className="h-full" environment={env} dockerTag={tag} />
      </div>
    </div>
  );
}
