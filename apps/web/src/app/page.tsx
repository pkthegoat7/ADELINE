import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold text-brand-700">Adelina PMS</h1>
        <p className="text-lg text-stone-600">
          Sistema de gestão para pousadas e hotéis com channel manager bidirecional integrado a
          Airbnb e Booking.
        </p>
        <Link
          href="/calendar"
          className="inline-block bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-lg font-medium transition"
        >
          Abrir calendário operacional →
        </Link>
      </div>
    </main>
  );
}
