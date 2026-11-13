import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

/**
 * Local development without bucket credentials: files live on disk and are
 * served through `/api/local-files/*` (see api/index.ts). Never used when
 * `S3_ENDPOINT` is set.
 */
export const LOCAL_STORAGE = !process.env.S3_ENDPOINT;
const LOCAL_DIR = path.resolve(process.cwd(), ".local-uploads");
const LOCAL_ROUTE = "/api/local-files/";

/** Resolves a storage key to a path inside the local upload dir, or null if it escapes it. */
export function localPath(key: string) {
  const resolved = path.resolve(LOCAL_DIR, key);
  return resolved.startsWith(LOCAL_DIR + path.sep) ? resolved : null;
}

export async function writeLocalObject(key: string, bytes: Uint8Array) {
  const file = localPath(key);
  if (!file) throw new Error("Invalid storage key.");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

/** URL the browser PUTs the file to. */
export async function uploadUrl(key: string, contentType: string) {
  if (LOCAL_STORAGE) return `${LOCAL_ROUTE}${key}`;
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
}

/** Short-lived URL the browser can download the file from. */
export async function downloadUrl(key: string) {
  if (LOCAL_STORAGE) return `${LOCAL_ROUTE}${key}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), {
    expiresIn: 3600,
  });
}

export async function readObject(key: string) {
  if (LOCAL_STORAGE) {
    const file = localPath(key);
    if (!file) throw new Error("Invalid storage key.");
    return new Uint8Array(await readFile(file));
  }
  const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  return object.Body!.transformToByteArray();
}
