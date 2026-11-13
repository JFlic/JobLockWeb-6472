import { Redirect } from "wouter";
import { authClient } from "../lib/auth";
import { Loading } from "./ui/feedback";
import { NO_AUTH } from "../lib/flags";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (NO_AUTH) return <>{children}</>;
  return <SessionGate>{children}</SessionGate>;
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loading label="Checking your session…" />
      </div>
    );
  }

  if (!session) return <Redirect to="/auth" />;

  return <>{children}</>;
}
