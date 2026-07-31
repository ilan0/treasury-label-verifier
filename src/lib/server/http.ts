import "server-only";

import { ZodError } from "zod";

import {
  ConcurrentModificationError,
  InvalidRecordStateError,
  RecordNotFoundError,
} from "@/lib/server/dal";
import {
  InvalidMutationOriginError,
  SessionRequiredError,
} from "@/lib/server/session";
import {
  ArtifactStorageError,
  InvalidStoragePathError,
  StorageConfigurationError,
} from "@/lib/server/storage";

export function dataResponse(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function acceptedResponse(data: unknown) {
  return dataResponse(data, { status: 202 });
}

export function requestId(request: Request): string {
  return (
    request.headers.get("x-vercel-id")?.slice(0, 120) || crypto.randomUUID()
  );
}

export function errorResponse(reason: unknown, request?: Request) {
  const correlationId = request ? requestId(request) : crypto.randomUUID();
  if (reason instanceof ZodError)
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        message: "Check the highlighted information and try again.",
        issues: reason.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
        correlationId,
      },
      { status: 400 },
    );
  if (reason instanceof InvalidMutationOriginError)
    return Response.json(
      {
        error: "ORIGIN_NOT_ALLOWED",
        message: "The request origin is not allowed.",
        correlationId,
      },
      { status: 403 },
    );
  if (reason instanceof SessionRequiredError)
    return Response.json(
      {
        error: "SESSION_REQUIRED",
        message: "Start from the ProofCheck workspace to continue.",
        correlationId,
      },
      { status: 401 },
    );
  if (reason instanceof RecordNotFoundError)
    return Response.json(
      {
        error: "NOT_FOUND",
        message: "This item is unavailable or has expired.",
        correlationId,
      },
      { status: 404 },
    );
  if (reason instanceof ConcurrentModificationError)
    return Response.json(
      {
        error: "CONCURRENT_UPDATE",
        message: "This review changed in another tab. Reload and try again.",
        correlationId,
      },
      { status: 409 },
    );
  if (reason instanceof InvalidRecordStateError)
    return Response.json(
      {
        error: "INVALID_STATE",
        message:
          "This action is no longer available for the item’s current status.",
        correlationId,
      },
      { status: 409 },
    );
  if (
    reason instanceof ArtifactStorageError ||
    reason instanceof InvalidStoragePathError ||
    reason instanceof StorageConfigurationError
  )
    return Response.json(
      {
        error: "ARTIFACT_ERROR",
        message: "The private file operation could not be completed.",
        correlationId,
      },
      { status: 400 },
    );
  if (reason instanceof RangeError)
    return Response.json(
      { error: "LIMIT_ERROR", message: reason.message, correlationId },
      { status: 400 },
    );

  const code = reason instanceof Error ? reason.message : "UNKNOWN_ERROR";
  const known: Record<string, [number, string]> = {
    INVALID_ABV: [
      400,
      "Enter alcohol content as a percentage between 0 and 100.",
    ],
    INVALID_PERCENTAGE: [
      400,
      "Enter each percentage as a number between 0 and 100.",
    ],
    INVALID_NET_CONTENTS: [
      400,
      "Enter net contents with a supported unit, such as 750 mL.",
    ],
    BATCH_TOO_LARGE: [
      400,
      "A batch can contain no more than 300 applications.",
    ],
    QUOTA_EXCEEDED: [
      429,
      "The live-analysis allowance is currently exhausted. Built-in examples remain available.",
    ],
    ARTWORK_REQUIRED: [
      400,
      "Add label artwork for every application before submitting.",
    ],
  };
  const match = known[code];
  return Response.json(
    {
      error: match ? code : "INTERNAL_ERROR",
      message:
        match?.[1] ??
        "ProofCheck could not complete the request. Try again shortly.",
      correlationId,
    },
    { status: match?.[0] ?? 500 },
  );
}

export async function jsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json"))
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Content-Type must be application/json.",
        input: undefined,
      },
    ]);
  return request.json();
}
