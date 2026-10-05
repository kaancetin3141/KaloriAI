/**
 * Next.js instrumentation — runs once per server process on startup.
 * Starts the server-side reminder push scheduler in the Node.js runtime
 * (never in edge middleware or during the production build phase).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } catch (err) {
    console.error("[scheduler] failed to start:", err);
  }
}
