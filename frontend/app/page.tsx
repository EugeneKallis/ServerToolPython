import Terminal from "./components/Terminal";

export const dynamic = 'force-dynamic';

export default function Home() {
  const env = process.env.APP_ENVIRONMENT || 'Local';
  const tag = process.env.APP_DOCKER_TAG || 'dev';

  return (
    <div className="h-full w-full flex flex-col p-4 lg:p-6 min-h-0 bg-white dark:bg-black">
      {/* Main Terminal Section */}
      <div className="flex-1 min-h-0">
        <Terminal className="h-full" environment={env} dockerTag={tag} />
      </div>
    </div>
  );
}
