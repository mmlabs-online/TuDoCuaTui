import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { PhotoLoader } from "./photoUrls";
import { PhotoLoaderContext, usePhotoUrl } from "./usePhotoUrl";

afterEach(cleanup);

const API = "/api/photos/11111111-1111-4111-8111-111111111111";

function setup() {
  const acquire = vi.fn((_s: string, _v?: string) => ({
    promise: Promise.resolve("blob:x/1"),
    release: vi.fn(),
  }));
  const loader: PhotoLoader = {
    handles: (s) => s.startsWith("/api/photos/"),
    acquire,
    clear: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PhotoLoaderContext.Provider value={loader}>{children}</PhotoLoaderContext.Provider>
  );
  return { acquire, wrapper };
}

test("default variant is full (editor path)", async () => {
  const { acquire, wrapper } = setup();
  const { result } = renderHook(() => usePhotoUrl(API, { lazy: false }), { wrapper });
  await waitFor(() => expect(result.current.src).toBe("blob:x/1"));
  expect(acquire).toHaveBeenCalledWith(API, "full");
});

test('variant "thumb" is passed to acquire', async () => {
  const { acquire, wrapper } = setup();
  const { result } = renderHook(() => usePhotoUrl(API, { lazy: false, variant: "thumb" }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.src).toBe("blob:x/1"));
  expect(acquire).toHaveBeenCalledWith(API, "thumb");
});
