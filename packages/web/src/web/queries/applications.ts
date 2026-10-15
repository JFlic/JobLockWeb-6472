import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type AppStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export function useApplications(enabled = true) {
  return useQuery(orpc.applications.list.queryOptions({ enabled, staleTime: 15_000 }));
}

export function useApplicationStats(enabled = true) {
  return useQuery(orpc.applications.stats.queryOptions({ enabled, staleTime: 15_000 }));
}

export function useTrackedJobIds(enabled = true) {
  return useQuery(orpc.applications.trackedJobIds.queryOptions({ enabled, staleTime: 15_000 }));
}

function useInvalidateTracker() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: orpc.applications.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
  };
}

export function useTrackJob() {
  const invalidate = useInvalidateTracker();
  return useMutation(orpc.applications.track.mutationOptions({ onSuccess: invalidate }));
}

export function useCreateManualApplication() {
  const invalidate = useInvalidateTracker();
  return useMutation(orpc.applications.createManual.mutationOptions({ onSuccess: invalidate }));
}

type ApplicationRow = { id: number; status: string };

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  const listKey = orpc.applications.list.queryOptions().queryKey;

  return useMutation(
    orpc.applications.updateStatus.mutationOptions({
      onMutate: async (input: { id: number; status: AppStatus }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const prev = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (old: ApplicationRow[] | undefined) =>
          old?.map((row) => (row.id === input.id ? { ...row, status: input.status } : row)),
        );
        return { prev };
      },
      onError: (_err, _input, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(listKey, ctx.prev);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.applications.key() });
      },
    }),
  );
}

export function useRemoveApplication() {
  const queryClient = useQueryClient();
  const listKey = orpc.applications.list.queryOptions().queryKey;

  return useMutation(
    orpc.applications.remove.mutationOptions({
      onMutate: async (input: { id: number }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const prev = queryClient.getQueryData(listKey);
        queryClient.setQueryData(listKey, (old: ApplicationRow[] | undefined) =>
          old?.filter((row) => row.id !== input.id),
        );
        return { prev };
      },
      onError: (_err, _input, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(listKey, ctx.prev);
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.applications.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
      },
    }),
  );
}
