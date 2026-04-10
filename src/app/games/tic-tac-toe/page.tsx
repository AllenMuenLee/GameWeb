import Link from "next/link";
import TicTacToeClient from "@/games/tic-tac-toe/TicTacToeClient";

export default function TicTacToePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(120deg,#e0f2fe_0%,#fef3c7_35%,#fee2e2_100%)] px-6 py-10 text-slate-900 sm:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Link href="/" className="inline-flex rounded-full border border-slate-900/20 bg-white/70 px-4 py-1 text-sm hover:bg-white">
          Back to Store
        </Link>

        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-600">Classic Arena</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Tic Tac Toe: Duel Board</h1>
          <p className="max-w-3xl text-slate-700">
            Pure reads, clean tactics, and zero luck. Control space and force the winning line.
          </p>
        </header>

        <TicTacToeClient />
      </div>
    </main>
  );
}
