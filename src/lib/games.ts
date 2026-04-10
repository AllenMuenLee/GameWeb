export type Game = {
  slug: string;
  title: string;
  description: string;
  status: "Live" | "Coming Soon";
};

export const games: Game[] = [
  {
    slug: "1a2b",
    title: "1A2B",
    description: "Multiplayer number guessing game with room code matching.",
    status: "Live",
  },
  {
    slug: "tic-tac-toe",
    title: "Tic Tac Toe",
    description: "Two-player online tic-tac-toe with turn-based synchronization.",
    status: "Live",
  },
];

export const gameBySlug = new Map(games.map((game) => [game.slug, game]));
