import { cancelBatchForSession } from "@/lib/server/dal";
import { dataResponse, errorResponse } from "@/lib/server/http";
import {
  assertSameOriginMutation,
  requireUserSession,
} from "@/lib/server/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireUserSession();
    const { batchId } = await context.params;
    const result = await cancelBatchForSession(batchId, session.recordId);
    return dataResponse(result);
  } catch (reason) {
    return errorResponse(reason, request);
  }
}
