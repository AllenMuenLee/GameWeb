import Link from "next/link";
import { games } from "@/lib/games";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
          Game Portal
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Small games, one place.
        </h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Click any card to enter a game page. Add new entries in{" "}
          <code>src/lib/games.ts</code> as you create more games.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/games/${game.slug}`}
            className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition hover:-translate-y-1 hover:border-cyan-300"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-100">
                {game.title}
              </h2>
              <span className="rounded-full border border-cyan-500/50 px-3 py-1 text-xs font-medium text-cyan-200">
                {game.status}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-300">{game.description}</p>
            <p className="mt-4 text-sm font-medium text-cyan-300 group-hover:text-cyan-200">
              Enter game
            </p>
          </Link>
        ))}
      </section>

      <footer className="mt-10 text-sm text-slate-400">
        This is your hub shell. Each game can live in its own route under{" "}
        <code>/games/&lt;slug&gt;</code>.
      </footer>
    </main>
  );
}
