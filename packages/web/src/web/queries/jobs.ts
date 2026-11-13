import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

// The server pulls new jobs hourly; open tabs re-check every few minutes.
const LIVE_JOBS = { refetchInterval: 5 * 60_000, refetchOnWindowFocus: true } as const;

export type JobFilters = {
  query?: string;
  level?: "intern" | "new_grad" | "junior" | "other";
  location?: string;
  remote?: boolean;
  sponsorsVisa?: boolean;
  postedWithinDays?: number;
  sort?: "newest" | "company";
  limit?: number;
  offset?: number;
};

export function useJobs(filters: JobFilters) {
  return useQuery(
    orpc.jobs.list.queryOptions({
      input: { sort: "newest", limit: 24, offset: 0, ...filters },
      staleTime: 60_000,
      placeholderData: keepPreviousData,
      ...LIVE_JOBS,
    }),
  );
}

export function useJobStats() {
  return useQuery(orpc.jobs.stats.queryOptions({ staleTime: 120_000, ...LIVE_JOBS }));
}

export function useJobLocations() {
  return useQuery(orpc.jobs.locations.queryOptions({ staleTime: 600_000 }));
}

export function useJob(id: number | null) {
  return useQuery(
    orpc.jobs.get.queryOptions({
      input: { id: id ?? 0 },
      enabled: id !== null,
      staleTime: 120_000,
    }),
  );
}

export function useCompanies() {
  return useQuery(orpc.companies.list.queryOptions({ staleTime: 600_000 }));
}
