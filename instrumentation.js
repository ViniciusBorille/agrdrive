export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const migrator = (await import("@/models/migrator.js")).default;
      const migrations = await migrator.runPendingMigrations();
      console.log(`[instrumentation] ${migrations.length} migration(s) applied.`);
    } catch (error) {
      console.error("[instrumentation] Failed to run migrations:", error);
      throw error;
    }
  } else {
    console.log(
      `[instrumentation] Skipping migrations (NEXT_RUNTIME=${process.env.NEXT_RUNTIME}).`,
    );
  }
}
