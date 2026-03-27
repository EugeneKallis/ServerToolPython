import type { Metadata } from "next";
import { AdminPanel } from './components/AdminPanel';

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="flex w-full min-h-[calc(100vh-1rem)] flex-col text-on-surface">
      <div className="w-full p-4 lg:p-6 flex flex-col flex-1">
        <h1 className="text-3xl font-headline font-bold tracking-tight mb-6 text-on-surface">Admin Settings</h1>

        <div className="flex-1 min-h-0 bg-surface-container border border-outline-variant overflow-y-auto lg:overflow-hidden">
          <AdminPanel />
        </div>
      </div>
    </div>
  );
}
