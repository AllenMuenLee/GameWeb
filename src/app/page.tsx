import Link from "next/link";
import { games } from "@/lib/games";

export default function Home() {
  const featured = games[0];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,#0f172a,transparent_38%),radial-gradient(circle_at_90%_10%,#1f2937,transparent_35%),#020617] px-6 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">GameWeb Store</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-100 sm:text-6xl">
            Pick a title. Jump straight into the game.
          </h1>
          <p className="max-w-2xl text-slate-300">
            This website is your game launcher. Every game has its own dedicated page, UI style, and play flow.
          </p>
        </header>

        {featured ? (
          <section className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(120deg,rgba(14,116,144,0.35),rgba(15,23,42,0.85))] p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Featured</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{featured.title}</h2>
            <p className="mt-3 max-w-2xl text-slate-200">{featured.description}</p>
            <Link
              href={featured.href ?? `/games/${featured.slug}`}
              className="mt-6 inline-flex rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Launch Featured Game
            </Link>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold text-slate-100">Library</h2>
            <p className="text-sm text-slate-400">{games.length} games</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <Link
                key={game.slug}
                href={game.href ?? `/games/${game.slug}`}
                className="group rounded-xl border border-slate-700/80 bg-slate-900/70 p-5 transition hover:-translate-y-1 hover:border-cyan-300/60"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-slate-100">{game.title}</h3>
                  <span className="rounded-full border border-cyan-500/50 px-3 py-1 text-xs font-medium text-cyan-200">
                    {game.status}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-300">{game.description}</p>
                <p className="mt-5 text-sm font-medium text-cyan-300 group-hover:text-cyan-200">Launch Game</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
