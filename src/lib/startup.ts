import type { ProbeResult } from "@/data/serverProbe";

export type View =
  | { kind: "unavailable"; dev: boolean; retry: () => Promise<void> }
  | { kind: "devApp" }
  | { kind: "auth" };

/**
 * Decides what to show once the server probe answers (D44). Unreachable never falls back to anything:
 * the view carries a `retry` that probes again. `dev` is `import.meta.env.DEV`, a build-time constant, so
 * the dev branch is dead code in production builds.
 */
export async function startup(o: {
  probe: () => Promise<ProbeResult>;
  dev: boolean;
  show: (v: View) => void | Promise<void>;
}): Promise<void> {
  if ((await o.probe()) === "unreachable") {
    await o.show({ kind: "unavailable", dev: o.dev, retry: () => startup(o) });
    return;
  }
  await o.show(o.dev ? { kind: "devApp" } : { kind: "auth" });
}
