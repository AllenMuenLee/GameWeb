import Link from "next/link";
import GameEngine from "@/components/GameEngine";

export default function PhantomReadPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#0f2861,transparent_45%),radial-gradient(circle_at_80%_10%,#4a2008,transparent_35%),#050814] px-6 py-10 text-cyan-50 sm:px-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Link
          href="/"
          className="inline-flex rounded-full border border-cyan-300/40 px-4 py-1 text-sm hover:bg-cyan-200/10"
        >
          Back to Store
        </Link>

        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Neon Duel Arena</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Phantom Read</h1>
          <p className="max-w-3xl text-cyan-100/85">
            Read your rival, feint the parry, and land the decisive strike in a 90-second duel.
          </p>
        </header>

        <GameEngine />
      </div>
    </main>
  );
}

