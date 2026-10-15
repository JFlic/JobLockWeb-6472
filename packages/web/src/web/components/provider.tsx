import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import { authClient } from "../lib/auth";
import { Loading } from "./ui/feedback";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

interface ProviderProps {
  children: React.ReactNode;
}

// App-level providers — add theme/context providers here, wrapping children.
// QueryClientProvider must stay (all API calls run through TanStack Query).
export function Provider({ children }: ProviderProps) {
  // Finish a returning managed sign-in redirect once, before routes render.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authClient.managedAuth
      .handleRedirect()
      .catch((error) => console.error("[auth] handleRedirect failed:", error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AutumnProvider useBetterAuth>
        {ready ? (
          children
        ) : (
          <div className="flex min-h-screen items-center justify-center bg-surface">
            <Loading label="Starting Job Lock…" />
          </div>
        )}
      </AutumnProvider>
    </QueryClientProvider>
  );
}
