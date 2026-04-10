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

export default function TicTacToeClient() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = room?.players.find((player) => player.id === playerId) ?? null;
  const myIndex = room?.players.findIndex((player) => player.id === playerId) ?? -1;
  const myMark = myIndex === 0 ? "X" : myIndex === 1 ? "O" : "-";
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
      body: JSON.stringify({ gameType: "tic-tac-toe", playerName }),
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

  async function placeMark(index: number) {
    if (!roomCode || !playerId) return;

    const res = await fetch(`/api/multiplayer/rooms/${roomCode}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action: { type: "place-mark", index } }),
    });

    const data = (await res.json()) as RoomApi | ApiError;
    if (!res.ok || "error" in data) {
      setError("Move failed. Check if it is your turn.");
      return;
    }

    setRoom(data.room);
    setError(null);
  }

  async function sendAction(action: Record<string, unknown>) {
    if (!roomCode || !playerId) return;

    const res = await fetch(`/api/multiplayer/rooms/${roomCode}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action }),
    });

    const data = (await res.json()) as RoomApi | ApiError;
    if (!res.ok || "error" in data) {
      setError("Action failed. Please try again.");
      return;
    }

    setRoom(data.room);
    setError(null);
  }

  async function restartGame() {
    await sendAction({ type: "restart-game" });
  }

  if (!roomCode || !playerId || !room) {
    return (
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-6">
        <p className="text-slate-200">Create a room or enter a room code to play Tic Tac Toe.</p>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Your nickname"
          className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2"
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={createRoom}
            className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Create Room
          </button>
          <form onSubmit={joinRoom} className="flex flex-wrap items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              className="rounded border border-slate-600 bg-slate-950 px-3 py-2 uppercase"
            />
            <button className="rounded border border-cyan-500 px-4 py-2 text-cyan-300 hover:bg-cyan-500/10">
              Join
            </button>
          </form>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </section>
    );
  }

  const winner = room.ticTacToe?.winner;

  return (
    <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900/50 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <p>
          Room: <span className="font-bold text-cyan-300">{room.roomCode}</span>
        </p>
        <p>You: {me?.name ?? "Player"}</p>
        <p>Your mark: {myMark}</p>
      </div>

      <p className="text-sm text-slate-300">
        Players: {room.players.map((p, index) => `${p.name}(${index === 0 ? "X" : "O"})`).join(" vs ")}
      </p>

      {room.status === "waiting" ? <p>Waiting for another player...</p> : null}

      <div className="grid max-w-xs grid-cols-3 gap-2">
        {room.ticTacToe?.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => placeMark(index)}
            disabled={
              room.status !== "playing" || !isMyTurn || cell !== null || room.players.length < 2
            }
            className="h-20 rounded border border-slate-600 bg-slate-950 text-3xl font-bold text-cyan-200 disabled:opacity-45"
          >
            {cell ?? ""}
          </button>
        ))}
      </div>

      {winner === "draw" ? <p className="text-lg font-semibold text-amber-300">Draw</p> : null}
      {winner === "X" || winner === "O" ? (
        <p className="text-lg font-semibold text-emerald-300">
          Winner: {playerNames.get(room.winnerPlayerId ?? "") ?? winner}
        </p>
      ) : null}
      {room.status === "playing" ? (
        <p className="text-sm text-slate-300">{isMyTurn ? "Your turn" : "Opponent's turn"}</p>
      ) : null}
      {room.status === "finished" ? (
        <button
          onClick={restartGame}
          className="rounded border border-cyan-400 px-3 py-1 text-sm text-cyan-200 hover:bg-cyan-500/10"
        >
          Play Again
        </button>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
