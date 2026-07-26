import { handle } from "@/lib/apiHelpers";
import { listJobs } from "@/lib/db";
import { startJobWorker } from "@/lib/jobQueue";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    // Also acts as a recovery kick if a development/runtime host skipped the
    // process startup hook.
    void startJobWorker();
    return { jobs: listJobs() };
  });
}
