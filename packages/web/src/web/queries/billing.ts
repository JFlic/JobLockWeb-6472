import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type Balance = {
  allowed: boolean;
  unlimited: boolean;
  remaining: number;
  granted: number;
  usage: number;
};

/** Remaining AI allowances + tracker slots for the signed-in user. */
export function useUsage(enabled = true) {
  return useQuery(orpc.billing.usage.queryOptions({ enabled, staleTime: 15_000 }));
}

/** Human-readable "3 of 30 left" style label for a metered balance. */
export function formatBalance(balance?: Balance | null) {
  if (!balance) return "—";
  if (balance.unlimited) return "Unlimited";
  return `${Math.max(0, balance.remaining)} of ${balance.granted} left`;
}
