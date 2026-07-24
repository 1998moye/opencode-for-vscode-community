import type { Session } from "@opencode-ai/sdk/v2";
import type { SessionSummary } from "../../runtime/contracts.js";

export function mapSession(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title || "未命名会话",
    directory: session.directory,
    updatedAt: session.time.updated,
    ...(session.share?.url ? { shareUrl: session.share.url } : {}),
    ...(session.model
      ? {
          model: {
            providerID: session.model.providerID,
            modelID: session.model.id,
            ...(session.model.variant ? { variant: session.model.variant } : {})
          }
        }
      : {}),
    ...(session.agent ? { agent: session.agent } : {})
  };
}
