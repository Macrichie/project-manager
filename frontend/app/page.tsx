"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "./auth";
import { ProjectBoard } from "./board-view";
import { BoardsList } from "./boards-list";
import type { User } from "./auth";

type Route = { view: "boards" } | { view: "board"; boardId: number; boardName?: string };

function parseHash(): Route {
  const hash = window.location.hash;
  const match = hash.match(/^#\/boards\/(\d+)(?:\?name=(.*))?$/);
  if (match) return { view: "board", boardId: Number(match[1]), boardName: match[2] ? decodeURIComponent(match[2]) : undefined };
  return { view: "boards" };
}

function AppRouter({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    function onHashChange() { setRoute(parseHash()); }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const goToBoards = useCallback(() => {
    window.location.hash = "#/boards";
  }, []);

  const goToBoard = useCallback((boardId: number, boardName?: string) => {
    const name = boardName ? `?name=${encodeURIComponent(boardName)}` : "";
    window.location.hash = `#/boards/${boardId}${name}`;
  }, []);

  if (route.view === "board") {
    return <ProjectBoard
      user={user}
      boardId={route.boardId}
      boardName={route.boardName}
      onSignedOut={onSignedOut}
      onBack={goToBoards}
    />;
  }

  return <BoardsList
    user={user}
    onSignedOut={onSignedOut}
    onSelectBoard={(boardId) => goToBoard(boardId)}
  />;
}

export default function Home() {
  return <AuthGate>{(user, onSignedOut) => <AppRouter user={user} onSignedOut={onSignedOut} />}</AuthGate>;
}
