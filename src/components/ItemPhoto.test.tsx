import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createPhotoLoader, type PhotoLoader } from "@/data/photoUrls";
import { PhotoLoaderContext } from "@/data/usePhotoUrl";
import { ItemPhoto } from "./ItemPhoto";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const API = "/api/photos/11111111-1111-4111-8111-111111111111";

function fakeLoader(promise: Promise<string>) {
  const release = vi.fn();
  const acquire = vi.fn(() => ({ promise, release }));
  const loader: PhotoLoader = {
    handles: (s) => s.startsWith("/api/photos/"),
    acquire,
    clear: vi.fn(),
  };
  return { loader, acquire, release };
}

const renderWith = (loader: PhotoLoader, src = API) =>
  render(
    <PhotoLoaderContext.Provider value={loader}>
      <ItemPhoto src={src} alt="Áo" fallback={<p>fallback</p>} />
    </PhotoLoaderContext.Provider>,
  );

test('img has loading="lazy" and decoding="async"; error -> fallback; new src -> img again', () => {
  const ui = (src: string) => <ItemPhoto src={src} alt="Áo" fallback={<p>fallback</p>} />;
  const { rerender } = render(ui("/a.jpg"));
  const img = screen.getByAltText("Áo");
  expect(img.getAttribute("loading")).toBe("lazy");
  expect(img.getAttribute("decoding")).toBe("async");
  fireEvent.error(img);
  expect(screen.getByText("fallback")).toBeTruthy();
  expect(screen.queryByAltText("Áo")).toBeNull();
  rerender(ui("/b.jpg"));
  expect(screen.getByAltText("Áo").getAttribute("src")).toBe("/b.jpg");
  expect(screen.queryByText("fallback")).toBeNull();
});

test("with a loader: pending block, then the blob: img", async () => {
  const { loader, release } = fakeLoader(Promise.resolve("blob:x/1"));
  const { container, unmount } = renderWith(loader);
  expect(container.querySelector(".photo-pending")).toBeTruthy();
  expect(container.querySelector("img")).toBeNull();
  const img = await screen.findByAltText("Áo");
  expect(img.getAttribute("src")).toBe("blob:x/1");
  expect(img.getAttribute("loading")).toBe("lazy");
  expect(img.getAttribute("decoding")).toBe("async");
  unmount();
  expect(release).toHaveBeenCalled();
});

test("with a loader: failure shows the fallback", async () => {
  const { loader } = fakeLoader(Promise.reject(new Error("x")));
  renderWith(loader);
  expect(await screen.findByText("fallback")).toBeTruthy();
});

test("with a loader: demo URLs are not handled and render as is", () => {
  const { loader, acquire } = fakeLoader(new Promise(() => {}));
  renderWith(loader, "https://x.test/a.jpg");
  expect(screen.getByAltText("Áo").getAttribute("src")).toBe("https://x.test/a.jpg");
  expect(acquire).not.toHaveBeenCalled();
});

test("with an IntersectionObserver: acquires on entering, releases on leaving", async () => {
  let cb!: (e: { isIntersecting: boolean }[]) => void;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(c: typeof cb) {
        cb = c;
      }
      observe() {}
      disconnect() {}
    },
  );
  const { loader, acquire, release } = fakeLoader(Promise.resolve("blob:x/1"));
  const { container } = renderWith(loader);
  await waitFor(() => expect(cb).toBeTruthy());
  expect(acquire).not.toHaveBeenCalled();
  act(() => cb([{ isIntersecting: true }]));
  expect(acquire).toHaveBeenCalledTimes(1);
  await screen.findByAltText("Áo");
  act(() => cb([{ isIntersecting: false }]));
  expect(release).toHaveBeenCalled();
  expect(container.querySelector(".photo-pending")).toBeTruthy();
});

const idN = (n: number) => `/api/photos/11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;

function realGrid() {
  const observers = new Map<Element, (e: { isIntersecting: boolean }[]) => void>();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      cb: (e: { isIntersecting: boolean }[]) => void;
      constructor(c: typeof this.cb) {
        this.cb = c;
      }
      observe(el: Element) {
        observers.set(el, this.cb);
      }
      disconnect() {
        for (const [el, c] of observers) if (c === this.cb) observers.delete(el);
      }
    },
  );
  const pending: ((r: Response) => void)[] = [];
  const loader = createPhotoLoader({
    maxConcurrent: 1,
    getToken: async () => "tok",
    fetchFn: (() => new Promise<Response>((res) => pending.push(res))) as unknown as typeof fetch,
    createUrl: () => "blob:t/1",
    revokeUrl: () => {},
  });
  const ui = (
    <PhotoLoaderContext.Provider value={loader}>
      {[1, 2].map((n) => (
        <div key={n} data-testid={`c${n}`}>
          <ItemPhoto src={idN(n)} alt={`p${n}`} fallback={<p>no{n}</p>} />
        </div>
      ))}
    </PhotoLoaderContext.Provider>
  );
  const el = (n: number) => screen.getByTestId(`c${n}`).firstElementChild as Element;
  const setIn = (n: number, v: boolean) =>
    act(() => observers.get(el(n))!([{ isIntersecting: v }]));
  const ok = () =>
    new Response(new Blob(["x"]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  return { ui, setIn, pending, ok, observers, el };
}

test("scrolling away while queued behind the cap returns to pending, then loads on return", async () => {
  const g = realGrid();
  const { container } = render(g.ui);
  await waitFor(() => expect(g.observers.size).toBe(2));
  g.setIn(1, true);
  g.setIn(2, true); // queued behind 1
  g.setIn(2, false);
  await act(async () => {});
  expect(screen.queryByText("no2")).toBeNull();
  expect(container.querySelectorAll(".photo-pending").length).toBe(2);
  expect(g.observers.size).toBe(2); // still observed
  g.setIn(2, true);
  await act(async () => g.pending[0](g.ok()));
  await act(async () => g.pending[1]?.(g.ok()));
  await waitFor(() => expect(screen.getByAltText("p2").getAttribute("src")).toBe("blob:t/1"));
});

test("scrolling away while loading: a late response does not flip the card", async () => {
  const g = realGrid();
  const { container } = render(g.ui);
  await waitFor(() => expect(g.observers.size).toBe(2));
  g.setIn(1, true);
  await act(async () => {});
  g.setIn(1, false);
  await act(async () => g.pending[0](g.ok()));
  expect(screen.queryByAltText("p1")).toBeNull();
  expect(screen.queryByText("no1")).toBeNull();
  expect(container.querySelectorAll(".photo-pending").length).toBe(2);
});
