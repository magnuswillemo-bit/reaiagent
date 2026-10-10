export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] animate-in fade-in duration-300">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-600 font-bold tracking-tight">Initializing Dashboard...</p>
      <p className="text-xs text-slate-400 mt-2">Connecting to Google Maps and retrieving analytics.</p>
    </div>
  );
}