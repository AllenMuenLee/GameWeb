import Link from "next/link";
import OneATwoBClient from "@/games/1a2b/OneATwoBClient";

export default function OneATwoBPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#7c2d12,transparent_45%),radial-gradient(circle_at_80%_10%,#78350f,transparent_35%),#09090b] px-6 py-10 text-amber-50 sm:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Link href="/" className="inline-flex rounded-full border border-amber-300/40 px-4 py-1 text-sm hover:bg-amber-200/10">
          Back to Store
        </Link>

        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Mind Duel Series</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">1A2B: Cipher Clash</h1>
          <p className="max-w-3xl text-amber-100/80">
            Set your secret code, predict your rival, and break their lock before they crack yours.
          </p>
        </header>

        <OneATwoBClient />
      </div>
    </main>
  );
}
