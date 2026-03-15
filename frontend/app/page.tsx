import Terminal from "./components/Terminal";

export default function Home() {
  return (
    <div className="h-full flex flex-col p-4 lg:p-6 min-h-0 bg-white dark:bg-black">
      {/* Main Terminal Section */}
      <div className="flex-1 min-h-0">
        <Terminal className="h-full" />
      </div>
    </div>
  );
}
