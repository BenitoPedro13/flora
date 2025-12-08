import dynamic from 'next/dynamic';

const Map = dynamic(() => import('@/components/map/Map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center">Loading Map...</div>
});

export default function Home() {
  return (
    <main className="flex h-screen w-screen flex-col">
      <nav className="h-16 border-b px-6 flex items-center font-bold text-xl bg-white shadow-sm z-10 relative">
        Flora 🛰️
      </nav>
      <div className="flex-1 relative">
        <Map />
      </div>
    </main>
  );
}
