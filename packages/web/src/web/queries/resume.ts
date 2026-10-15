import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useCurrentResume(enabled = true) {
  return useQuery(orpc.resume.current.queryOptions({ enabled, staleTime: 30_000 }));
}

export function useResumeHistory(enabled = true) {
  return useQuery(orpc.resume.history.queryOptions({ enabled, staleTime: 30_000 }));
}

/**
 * Full upload flow: presign -> PUT straight to storage -> register so the
 * server pulls it back and extracts the text.
 */
export function useUploadResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") {
        throw new Error("Upload a PDF — that's the only format we can read.");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("That file is over 8MB. Export a smaller PDF and try again.");
      }

      const { url, key } = await client.resume.presign({
        filename: file.name,
        contentType: file.type,
      });

      const put = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

      return client.resume.register({ key, filename: file.name });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.resume.key() });
    },
  });
}

export function useScoreResume() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.resume.score.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.resume.history.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
      },
    }),
  );
}

export function useTailorResume() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.resume.tailor.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
      },
    }),
  );
}

export function useApproveChanges() {
  return useMutation(orpc.resume.approveChanges.mutationOptions());
}

/** Fetches a fresh signed link on demand and opens it. */
export function useDownloadResume() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { url } = await client.resume.downloadUrl({ id });
      window.open(url, "_blank", "noopener,noreferrer");
      return url;
    },
  });
}
