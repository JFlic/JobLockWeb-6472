import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
      const contentType = file.name.toLowerCase().endsWith(".docx") ? DOCX_TYPE : file.type;
      if (contentType !== "application/pdf" && contentType !== DOCX_TYPE) {
        throw new Error("Upload a PDF or Word (.docx) file.");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("That file is over 8MB. Export a smaller PDF and try again.");
      }

      const { url, key } = await client.resume.presign({
        filename: file.name,
        contentType,
      });

      const put = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
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
        void queryClient.invalidateQueries({ queryKey: orpc.resume.tailorHistory.key() });
      },
    }),
  );
}

export function useTailorHistory(enabled = true) {
  return useQuery(orpc.resume.tailorHistory.queryOptions({ enabled, staleTime: 30_000 }));
}

export function useSaveTailor() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.resume.saveTailor.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.resume.tailorHistory.key() });
      },
    }),
  );
}

/** Downloads the tailored resume; resolves with any lines that couldn't be swapped in. */
export function useExportResume() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { file, missed } = await client.resume.exportResume({ id });
      saveFile(file);
      return missed;
    },
  });
}

export function useExportCoverLetter() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { file } = await client.resume.exportCoverLetter({ id });
      saveFile(file);
    },
  });
}

export function useExperienceBank(enabled = true) {
  return useQuery(orpc.resume.bank.queryOptions({ enabled, staleTime: 60_000 }));
}

export function useSaveExperienceBank() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.resume.saveBank.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.resume.bank.key() });
      },
    }),
  );
}

export function useExtractDocument() {
  return useMutation(orpc.resume.extractDocument.mutationOptions());
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
