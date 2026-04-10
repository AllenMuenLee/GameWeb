"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PublicRoomState } from "@/lib/multiplayer/types";

type ApiError = { error: string };

type RoomApi = { room: PublicRoomState };

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

export default function OneATwoBClient() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [secret, setSecret] = useState("");
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);

  const me = room?.players.find((player) => player.id === playerId) ?? null;
  const isMyTurn = Boolean(room && playerId && room.currentTurnPlayerId === playerId);

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    room?.players.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [room]);

  async function createRoom() {
    setError(null);
    const res = await fetch("/api/multiplayer/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "1a2b", playerName }),
    });

    const data = (await res.json()) as
      | { roomCode: string; playerId: string; room: PublicRoomState }
      | ApiError;

    if (!res.ok || "error" in data) {
      setError("Failed to create room.");
      return;
    }

    setRoomCode(data.roomCode);
    setPlayerId(data.playerId);
    setRoom(data.room);
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/multiplayer/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: joinCode, playerName }),
    });

    const data = (await res.json()) as { playerId: string; room: PublicRoomState } | ApiError;
    if (!res.ok || "error" in data) {
      setError("Failed to join. Check room code or room capacity.");
      return;
    }

    setRoomCode(joinCode.toUpperCase());
    setPlayerId(data.playerId);
    setRoom(data.room);
  }

  async function refreshState(code: string) {
    const res = await fetch(`/api/multiplayer/rooms/${code}`, { cache: "no-store" });
    const data = (await res.json()) as RoomApi | ApiError;

    if (!res.ok || "error" in data) {
      setError("Room not found or expired.");
      return;
    }

    setRoom(data.room);
  }

  useEffect(() => {
    if (!roomCode) return;

    const sync = async () => {
      try {
        await refreshState(roomCode);
      } catch (err) {
        setError(getErrorMessage(err, "Sync failed."));
      }
    };

    void sync();
    const timer = setInterval(() => {
      void sync();
    }, 1000);

    return () => clearInterval(timer);
  }, [roomCode]);

  async function sendAction(action: Record<string, unknown>) {
    if (!roomCode || !playerId) return;

    const res = await fetch(`/api/multiplayer/rooms/${roomCode}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action }),
    });

    const data = (await res.json()) as RoomApi | ApiError;
    if (!res.ok || "error" in data) {
      setError("Action failed. Check if it is your turn.");
      return;
    }

    setRoom(data.room);
    setError(null);
  }

  async function submitSecret(e: FormEvent) {
    e.preventDefault();
    await sendAction({ type: "set-secret", secret });
    setSecret("");
  }

  async function submitGuess(e: FormEvent) {
    e.preventDefault();
    await sendAction({ type: "make-guess", guess });
    setGuess("");
  }

  async function restartGame() {
    await sendAction({ type: "restart-game" });
    setSecret("");
    setGuess("");
  }

  if (!roomCode || !playerId || !room) {
    return (
      <section className="space-y-4 rounded-2xl border border-amber-300/30 bg-amber-950/40 p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)]">
        <p className="text-amber-100">Create a room or enter a room code to play 1A2B.</p>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Your nickname"
          className="w-full rounded border border-amber-700 bg-zinc-950 px-3 py-2"
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={createRoom}
            className="rounded bg-amber-400 px-4 py-2 font-semibold text-zinc-900 hover:bg-amber-300"
          >
            Create Room
          </button>
          <form onSubmit={joinRoom} className="flex flex-wrap items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              className="rounded border border-amber-700 bg-zinc-950 px-3 py-2 uppercase"
            />
            <button className="rounded border border-amber-500 px-4 py-2 text-amber-200 hover:bg-amber-500/10">
              Join
            </button>
          </form>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </section>
    );
  }

  const mySecretSet = Boolean(room.oneATwoB?.hasSecret[playerId]);

  return (
    <section className="space-y-6 rounded-2xl border border-amber-300/30 bg-amber-950/40 p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)]">
      <div className="flex flex-wrap items-center gap-4">
        <p>
          Room: <span className="font-bold text-amber-300">{room.roomCode}</span>
        </p>
        <p>You: {me?.name ?? "Player"}</p>
        <p>Status: {room.status}</p>
      </div>

      <p className="text-sm text-amber-100/90">Players: {room.players.map((p) => p.name).join(" vs ")}</p>

      {room.status === "waiting" ? <p>Waiting for another player...</p> : null}

      {room.status === "setup" ? (
        <form onSubmit={submitSecret} className="flex flex-wrap items-center gap-2">
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            maxLength={4}
            placeholder={mySecretSet ? "Secret already set" : "Set 4 unique digits"}
            className="rounded border border-amber-700 bg-zinc-950 px-3 py-2"
            disabled={mySecretSet}
          />
          <button
            disabled={mySecretSet}
            className="rounded bg-amber-400 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-40"
          >
            Submit Secret
          </button>
        </form>
      ) : null}

      {room.status !== "setup" && room.status !== "waiting" ? (
        <form onSubmit={submitGuess} className="flex flex-wrap items-center gap-2">
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            maxLength={4}
            placeholder={isMyTurn ? "Your turn to guess" : "Waiting for opponent"}
            className="rounded border border-amber-700 bg-zinc-950 px-3 py-2"
            disabled={!isMyTurn || room.status === "finished"}
          />
          <button
            disabled={!isMyTurn || room.status === "finished"}
            className="rounded bg-amber-400 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-40"
          >
            Submit Guess
          </button>
        </form>
      ) : null}

      <div className="space-y-2">
        <p className="font-semibold">Guess History</p>
        {room.oneATwoB?.guesses.length ? (
          room.oneATwoB.guesses
            .slice()
            .reverse()
            .map((item, index) => (
              <p key={`${item.at}-${index}`} className="text-sm text-amber-100">
                {playerNames.get(item.byPlayerId) ?? "Player"}: {item.guess} {"->"} {item.a}A{item.b}B
              </p>
            ))
        ) : (
          <p className="text-sm text-amber-200/70">No guesses yet.</p>
        )}
      </div>

      {room.status === "finished" ? (
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold text-emerald-300">
            {room.winnerPlayerId === playerId ? "You win!" : "You lose."}
          </p>
          <button
            onClick={restartGame}
            className="rounded border border-amber-400 px-3 py-1 text-sm text-amber-100 hover:bg-amber-500/10"
          >
            Play Again
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-300">{isMyTurn ? "Your turn" : "Opponent's turn"}</p>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
