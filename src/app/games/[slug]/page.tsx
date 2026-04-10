import Link from "next/link";
import { notFound } from "next/navigation";
import { gameBySlug } from "@/lib/games";

type GamePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { slug } = await params;
  const game = gameBySlug.get(slug);

  if (!game) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10 sm:px-10">
      <Link href="/" className="mb-8 text-sm text-cyan-300 hover:text-cyan-200">
        Back to Store
      </Link>

      <h1 className="text-4xl font-bold tracking-tight">{game.title}</h1>
      <p className="mt-4 text-slate-300">{game.description}</p>

      <section className="mt-8 rounded-xl border border-dashed border-cyan-500/60 bg-slate-900/60 p-8">
        <p className="text-lg font-semibold text-cyan-200">Coming Soon</p>
        <p className="mt-3 text-slate-300">
          This route is reserved for future games. Current live games have dedicated pages and visual themes.
        </p>
      </section>
    </main>
  );
}
