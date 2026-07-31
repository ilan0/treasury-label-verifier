import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  failed: vi.fn(),
  send: vi.fn(),
  sent: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: mocks.send },
}));
vi.mock("@/lib/server/dal", () => ({
  claimPendingOutboxEvents: mocks.claim,
  markOutboxEventFailed: mocks.failed,
  markOutboxEventSent: mocks.sent,
}));

import { dispatchPendingOutbox } from "./outbox";

const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const event = {
  attemptCount: 1,
  eventId: `label-verification-${jobId}`,
  eventName: "label/verification.requested",
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jobId,
  payload: { jobId },
};

describe("outbox dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims only the interactive job IDs and marks delivered events sent", async () => {
    mocks.claim.mockResolvedValue([event]);
    mocks.send.mockResolvedValue(undefined);

    await expect(
      dispatchPendingOutbox({ jobIds: [jobId], limit: 1 }),
    ).resolves.toEqual({ delivered: 1, pending: 0 });
    expect(mocks.claim).toHaveBeenCalledWith(1, [jobId], undefined);
    expect(mocks.send).toHaveBeenCalledWith([
      { id: event.eventId, name: event.eventName, data: event.payload },
    ]);
    expect(mocks.sent).toHaveBeenCalledWith(event.eventId);
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it("retains failed delivery with a sanitized code for scheduled recovery", async () => {
    mocks.claim.mockResolvedValue([event]);
    mocks.send.mockRejectedValue(new Error("403 unauthorized: secret details"));

    await expect(dispatchPendingOutbox({ jobIds: [jobId] })).resolves.toEqual({
      delivered: 0,
      pending: 1,
    });
    expect(mocks.failed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.eventId,
        safeErrorCode: "QUEUE_AUTHENTICATION_FAILED",
      }),
    );
  });

  it("returns without contacting Inngest when no event is claimable", async () => {
    mocks.claim.mockResolvedValue([]);
    await expect(dispatchPendingOutbox()).resolves.toEqual({
      delivered: 0,
      pending: 0,
    });
    expect(mocks.claim).toHaveBeenCalledWith(300, undefined, undefined);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not turn an explicitly empty retry selection into a global sweep", async () => {
    await expect(dispatchPendingOutbox({ jobIds: [] })).resolves.toEqual({
      delivered: 0,
      pending: 0,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
