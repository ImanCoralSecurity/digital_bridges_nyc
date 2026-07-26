// Start/reconcile the persistent queue when the long-lived Node server boots.
// Production builds must never consume jobs while compiling.

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.DBRIDGES_DISABLE_JOB_WORKER === "1"
  ) {
    return;
  }
  const { startJobWorker } = await import("./lib/jobQueue");
  void startJobWorker();
}
