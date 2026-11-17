import {
  createPhotoWorkerHost,
  probeEnv,
  type WorkerEnv,
  type WorkerReply,
} from "./photoWorkerHost";

// Entry of the photo resize worker (see photoWorkerClient.ts). Only runs inside a real worker.
const scope = self as unknown as WorkerEnv & {
  postMessage(m: WorkerReply): void;
  onmessage: ((e: MessageEvent) => void) | null;
};
const env: WorkerEnv = {
  createImageBitmap: scope.createImageBitmap?.bind(self),
  OffscreenCanvas: scope.OffscreenCanvas,
};
const handle = createPhotoWorkerHost(env, (m) => scope.postMessage(m));
scope.onmessage = (e) => handle(e.data);
scope.postMessage({ type: "ready", ok: probeEnv(env) });
