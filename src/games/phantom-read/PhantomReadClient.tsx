"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  PhantomReadAction,
  PhantomReadDashDirection,
  PublicRoomState,
} from "@/lib/multiplayer/types";

type ApiError = { error: string };
type RoomApi = { room: PublicRoomState };

const ACTIONS: PhantomReadAction[] = ["strike", "parry", "dash", "feint", "focus"];

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

function actionLabel(action: PhantomReadAction) {
  return action[0].toUpperCase() + action.slice(1);
}

export default function PhantomReadClient() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [action, setAction] = useState<PhantomReadAction>("strike");
  const [readTarget, setReadTarget] = useState<PhantomReadAction>("strike");
  const [dashDirection, setDashDirection] = useState<PhantomReadDashDirection>("right");
  const [error, setError] = useState<string | null>(null);

  const me = room?.players.find((p) => p.id === playerId) ?? null;
  const opponent = room?.players.find((p) => p.id !== playerId) ?? null;

  const myFighter = useMemo(() => {
    if (!room?.phantomRead || !playerId) return null;
    return room.phantomRead.fighters[playerId] ?? null;
  }, [room, playerId]);

  const enemyFighter = useMemo(() => {
    if (!room?.phantomRead || !opponent) return null;
    return room.phantomRead.fighters[opponent.id] ?? null;
  }, [room, opponent]);

  const mySubmitted = Boolean(room?.phantomRead && playerId && room.phantomRead.submitted[playerId]);

  async function createRoom() {
    setError(null);
    const res = await fetch("/api/multiplayer/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "phantom-read", playerName }),
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
    }, 700);

    return () => clearInterval(timer);
  }, [roomCode]);

  async function sendAction(payload: Record<string, unknown>) {
    if (!roomCode || !playerId) return;

    const res = await fetch(`/api/multiplayer/rooms/${roomCode}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, action: payload }),
    });

    const data = (await res.json()) as RoomApi | ApiError;
    if (!res.ok || "error" in data) {
      setError("Action failed.");
      return;
    }

    setRoom(data.room);
    setError(null);
  }

  async function submitMove(e: FormEvent) {
    e.preventDefault();
    await sendAction({
      type: "submit-move",
      move: {
        action,
        read: readTarget,
        dashDirection: action === "dash" ? dashDirection : undefined,
      },
    });
  }

  async function restartGame() {
    await sendAction({ type: "restart-game" });
  }

  if (!roomCode || !playerId || !room) {
    return (
      <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-6">
        <p className="text-slate-200">
          Phantom Read is a 1v1 prediction action duel. Create a room or enter a room code.
        </p>
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

  const winnerName = room.winnerPlayerId
    ? room.players.find((p) => p.id === room.winnerPlayerId)?.name ?? "Unknown"
    : null;

  return (
    <section className="space-y-6 rounded-xl border border-slate-700 bg-slate-900/50 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <p>
          Room: <span className="font-bold text-cyan-300">{room.roomCode}</span>
        </p>
        <p>You: {me?.name ?? "Player"}</p>
        <p>Status: {room.status}</p>
        <p>Round: {room.phantomRead?.round ?? 1} / 20</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-slate-700 bg-slate-950/50 p-4">
          <p className="mb-2 font-semibold text-cyan-200">You</p>
          <p>HP: {myFighter?.hp ?? 0}</p>
          <p>Stamina: {myFighter?.stamina ?? 0}</p>
          <p>Momentum: {myFighter?.momentum ?? 0}</p>
          <p>Position: {myFighter?.position ?? 0}</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-950/50 p-4">
          <p className="mb-2 font-semibold text-rose-200">Opponent</p>
          <p>Name: {opponent?.name ?? "Waiting..."}</p>
          <p>HP: {enemyFighter?.hp ?? 0}</p>
          <p>Stamina: {enemyFighter?.stamina ?? 0}</p>
          <p>Momentum: {enemyFighter?.momentum ?? 0}</p>
          <p>Position: {enemyFighter?.position ?? 0}</p>
        </div>
      </div>

      {room.status === "waiting" ? <p>Waiting for another player...</p> : null}

      {room.status === "playing" ? (
        <form onSubmit={submitMove} className="space-y-3 rounded border border-slate-700 bg-slate-950/50 p-4">
          <p className="font-semibold">Plan your move</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm text-slate-300">Action</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as PhantomReadAction)}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              >
                {ACTIONS.map((item) => (
                  <option key={item} value={item}>
                    {actionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">Read opponent action</span>
              <select
                value={readTarget}
                onChange={(e) => setReadTarget(e.target.value as PhantomReadAction)}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              >
                {ACTIONS.map((item) => (
                  <option key={item} value={item}>
                    {actionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {action === "dash" ? (
            <label className="space-y-1">
              <span className="text-sm text-slate-300">Dash direction</span>
              <select
                value={dashDirection}
                onChange={(e) => setDashDirection(e.target.value as PhantomReadDashDirection)}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          ) : null}

          <button
            disabled={mySubmitted || room.players.length < 2}
            className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
          >
            {mySubmitted ? "Move Submitted" : "Submit Move"}
          </button>
        </form>
      ) : null}

      {room.status === "finished" ? (
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold text-emerald-300">
            {winnerName ? `Winner: ${winnerName}` : "Draw"}
          </p>
          <button
            onClick={restartGame}
            className="rounded border border-cyan-400 px-3 py-1 text-sm text-cyan-200 hover:bg-cyan-500/10"
          >
            Play Again
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="font-semibold">Round Logs</p>
        {room.phantomRead?.recentLogs.length ? (
          room.phantomRead.recentLogs.map((log) => (
            <div key={`${log.round}-${log.at}`} className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-sm font-semibold text-cyan-200">Round {log.round}</p>
              {log.lines.map((line, idx) => (
                <p key={idx} className="text-sm text-slate-300">
                  {line}
                </p>
              ))}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No rounds resolved yet.</p>
        )}
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
