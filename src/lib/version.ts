const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

export function appVersion(raw: string | undefined): string {
  return raw !== undefined && RELEASE_TAG.test(raw) ? raw : "dev";
}

export const APP_VERSION = appVersion(import.meta.env.VITE_APP_VERSION as string | undefined);
