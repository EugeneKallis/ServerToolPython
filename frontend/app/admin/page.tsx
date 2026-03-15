import { AdminPanel } from './components/AdminPanel';

export default function AdminPage() {
  return (
    <div className="flex min-h-[calc(100vh-1rem)] lg:h-[calc(100vh-1rem)] flex-col p-6 text-zinc-100">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Admin Settings</h1>
      
      <div className="flex-1 min-h-0 bg-zinc-950/50 rounded-xl overflow-y-auto lg:overflow-hidden">
        <AdminPanel />
      </div>
    </div>
  );
}
