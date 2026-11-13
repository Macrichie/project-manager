"use client";

import { AuthGate } from "./auth";
import { ProjectBoard } from "./board-view";

export default function Home() {
  return <AuthGate>{(user, onSignedOut) => <ProjectBoard user={user} onSignedOut={onSignedOut} />}</AuthGate>;
}
