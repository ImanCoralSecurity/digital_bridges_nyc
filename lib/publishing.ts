// Content review, provenance & ethical publishing (server-only).
// No content reaches a partner channel without human sign-off, and every
// published representation carries the mandatory AI-generated disclosure.

import { AI_DISCLOSURE } from "./content";
import { getAsset, insertPublishLog, listPublishLogs, updateAsset } from "./db";
import { newId } from "./hash";
import type { ContentAsset, PublishLog, ReviewRecord } from "./types";

export async function reviewAsset(
  id: string,
  input: { reviewer: string; action: ReviewRecord["action"]; reason?: string; body?: string },
): Promise<ContentAsset> {
  const asset = getAsset(id);
  if (!asset) throw new Error(`Asset not found: ${id}`);
  if (!input.reviewer.trim()) throw new Error("A reviewer name is required.");

  const record: ReviewRecord = {
    reviewer: input.reviewer.trim(),
    action: input.action,
    reason: (input.reason ?? "").trim(),
    at: new Date().toISOString(),
  };

  if (input.action === "reject") {
    if (!record.reason) throw new Error("A reason is required to reject content.");
    return updateAsset(id, { status: "rejected", reviews: [...asset.reviews, record] });
  }
  if (input.action === "edit") {
    if (!input.body || !input.body.trim()) throw new Error("Edited body is required.");
    // Edits return the asset to draft so the change is re-reviewed before publish.
    return updateAsset(id, {
      status: "draft",
      body: input.body.trim().slice(0, 4000),
      reviews: [...asset.reviews, record],
    });
  }
  // approve
  return updateAsset(id, { status: "approved", reviews: [...asset.reviews, record] });
}

/** The exact text that goes out to a channel — disclosure is always prepended. */
export function publishedRepresentation(asset: ContentAsset): string {
  return `${AI_DISCLOSURE}\n\n${asset.title}\n\n${asset.body}`;
}

export async function publishAsset(
  id: string,
  input: { partner: string; actor: string },
): Promise<{ asset: ContentAsset; log: PublishLog }> {
  const asset = getAsset(id);
  if (!asset) throw new Error(`Asset not found: ${id}`);
  if (asset.status !== "approved") {
    throw new Error("Only approved content can be published. Approve it in review first.");
  }
  if (!input.partner.trim()) throw new Error("A partner channel is required.");
  if (!input.actor.trim()) throw new Error("An actor (who is publishing) is required.");

  const log: PublishLog = {
    id: newId("pub"),
    assetId: id,
    partner: input.partner.trim(),
    action: "publish",
    actor: input.actor.trim(),
    reason: "",
    at: new Date().toISOString(),
  };
  await insertPublishLog(log);
  const updated = await updateAsset(id, { status: "published" });
  return { asset: updated, log };
}

export async function takedownAsset(
  id: string,
  input: { actor: string; reason: string },
): Promise<{ asset: ContentAsset; log: PublishLog }> {
  const asset = getAsset(id);
  if (!asset) throw new Error(`Asset not found: ${id}`);
  if (!input.actor.trim()) throw new Error("An actor is required for takedown.");
  if (!input.reason.trim()) throw new Error("A reason is required for takedown.");

  const log: PublishLog = {
    id: newId("pub"),
    assetId: id,
    partner: "",
    action: "takedown",
    actor: input.actor.trim(),
    reason: input.reason.trim(),
    at: new Date().toISOString(),
  };
  await insertPublishLog(log);
  const updated = await updateAsset(id, { status: "retracted" });
  return { asset: updated, log };
}

export function assetPublishHistory(assetId: string): PublishLog[] {
  return listPublishLogs(assetId);
}
