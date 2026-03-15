import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-12 py-32 px-16 bg-white dark:bg-black sm:items-start text-center sm:text-left">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Home
        </Link>

        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
            About ServerToolPython
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            ServerToolPython is a powerful, modern tool designed to bridge the gap between Python backend services and high-performance web frontends. Built with FastAPI and Next.js, it offers a seamless developer experience for building data-driven applications.
          </p>
          
          <div className="grid grid-cols-1 gap-8 pt-8 sm:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Modern Stack</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                Leveraging the latest in web technology: Next.js 16, React 19, and FastAPI for ultra-fast performance.
              </p>
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Scalable & Robust</h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                Designed with scalability in mind, including Docker and Helm support for enterprise-grade deployments.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
           <a
            className="flex h-12 items-center justify-center rounded-full bg-black px-8 text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </main>
    </div>
  );
}
