import { useEffect, useState } from "react";
import { hasSession } from "@/api/desktop-commands";
import { AppShell } from "@/app-shell";
import { SignInForm } from "@/sign-in-form";

type Phase = "checking" | "signed-out" | "signed-in";

export function App() {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let active = true;

    hasSession()
      .then((signedIn) => {
        if (active) setPhase(signedIn ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setPhase("signed-out");
      });

    return () => {
      active = false;
    };
  }, []);

  if (phase === "checking") {
    return (
      <div className="screen-center">
        <p className="status">Loading…</p>
      </div>
    );
  }

  if (phase === "signed-out") {
    return (
      <div className="screen-center">
        <SignInForm onSignedIn={() => setPhase("signed-in")} />
      </div>
    );
  }

  return <AppShell onSignedOut={() => setPhase("signed-out")} />;
}
