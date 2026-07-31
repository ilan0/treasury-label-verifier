import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ARTIFACT_BUCKET = "label-artifacts";
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const STORAGE_ID_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$/;

export const ALLOWED_ARTIFACT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

export class StorageConfigurationError extends Error {
  constructor() {
    super("Private artifact storage is not configured.");
    this.name = "StorageConfigurationError";
  }
}

export class InvalidStoragePathError extends Error {
  constructor() {
    super("The private artifact path is invalid.");
    this.name = "InvalidStoragePathError";
  }
}

export class ArtifactStorageError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("The private artifact operation failed.");
    this.name = "ArtifactStorageError";
    this.code = code;
  }
}

const globalForStorage = globalThis as typeof globalThis & {
  proofcheckSupabaseAdmin?: SupabaseClient;
};

function getSupabaseAdmin(): SupabaseClient {
  if (globalForStorage.proofcheckSupabaseAdmin) {
    return globalForStorage.proofcheckSupabaseAdmin;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new StorageConfigurationError();

  globalForStorage.proofcheckSupabaseAdmin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "proofcheck-server" } },
  });
  return globalForStorage.proofcheckSupabaseAdmin;
}

function safeExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] ?? "";
}

export function buildArtifactStoragePath(input: {
  artifactId: string;
  batchId: string;
  fileName: string;
  sessionRecordId: string;
}): string {
  if (
    !STORAGE_ID_PATTERN.test(input.sessionRecordId) ||
    !UUID_PATTERN.test(input.batchId) ||
    !UUID_PATTERN.test(input.artifactId)
  ) {
    throw new InvalidStoragePathError();
  }
  return `sessions/${input.sessionRecordId}/batches/${input.batchId}/${input.artifactId}${safeExtension(input.fileName)}`;
}

export function assertSessionStoragePath(
  storagePath: string,
  sessionRecordId: string,
): void {
  if (
    !STORAGE_ID_PATTERN.test(sessionRecordId) ||
    !STORAGE_PATH_PATTERN.test(storagePath) ||
    storagePath.includes("..") ||
    storagePath.includes("//") ||
    !storagePath.startsWith(`sessions/${sessionRecordId}/`)
  ) {
    throw new InvalidStoragePathError();
  }
}

export function validateArtifactMetadata(input: {
  mimeType: string;
  sizeBytes: number;
}): void {
  if (
    !ALLOWED_ARTIFACT_MIME_TYPES.has(input.mimeType) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_ARTIFACT_BYTES
  ) {
    throw new ArtifactStorageError("INVALID_ARTIFACT");
  }
}

export async function createSignedArtifactUpload(
  storagePath: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
  if (!STORAGE_PATH_PATTERN.test(storagePath) || storagePath.includes("..")) {
    throw new InvalidStoragePathError();
  }
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ARTIFACT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data) throw new ArtifactStorageError("SIGN_UPLOAD_FAILED");
  return data;
}

export async function createSignedArtifactDownload(
  storagePath: string,
  expiresInSeconds = 60,
): Promise<string> {
  if (
    !STORAGE_PATH_PATTERN.test(storagePath) ||
    storagePath.includes("..") ||
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > 300
  ) {
    throw new InvalidStoragePathError();
  }
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new ArtifactStorageError("SIGN_DOWNLOAD_FAILED");
  return data.signedUrl;
}

export async function downloadArtifact(storagePath: string): Promise<Blob> {
  if (!STORAGE_PATH_PATTERN.test(storagePath) || storagePath.includes("..")) {
    throw new InvalidStoragePathError();
  }
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ARTIFACT_BUCKET)
    .download(storagePath);
  if (error || !data) throw new ArtifactStorageError("DOWNLOAD_FAILED");
  return data;
}

export async function deleteArtifacts(storagePaths: string[]): Promise<void> {
  if (!storagePaths.length) return;
  if (
    storagePaths.length > 100 ||
    storagePaths.some(
      (path) => !STORAGE_PATH_PATTERN.test(path) || path.includes(".."),
    )
  ) {
    throw new InvalidStoragePathError();
  }
  const { error } = await getSupabaseAdmin()
    .storage.from(ARTIFACT_BUCKET)
    .remove(storagePaths);
  if (error) throw new ArtifactStorageError("DELETE_FAILED");
}

export async function artifactExists(storagePath: string): Promise<boolean> {
  if (!STORAGE_PATH_PATTERN.test(storagePath) || storagePath.includes("..")) {
    throw new InvalidStoragePathError();
  }
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ARTIFACT_BUCKET)
    .exists(storagePath);
  if (error) throw new ArtifactStorageError("INFO_FAILED");
  return data;
}
