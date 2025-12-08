import MapWrapper from '@/components/map/MapWrapper';

export default function Home() {
  return (
    <main className="flex h-screen w-screen flex-col">
      <nav className="h-16 border-b px-6 flex items-center font-bold text-xl bg-white shadow-sm z-10 relative">
        Flora 🛰️
      </nav>
      <div className="flex-1 relative">
        <MapWrapper />
      </div>
    </main>
  );
}
