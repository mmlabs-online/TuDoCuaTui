import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { starter } from "@/data/demo";
import { COPY } from "@/features/auth/authMessages";
import { Root } from "./Root";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  get supabase() {
    return h.client;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const getSession = vi.fn(async () => ({ data: { session: null } }));
const fakeClient = () => ({
  auth: {
    getSession,
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
  },
});
const cards = () => document.querySelectorAll(".item-card");

describe("Root", () => {
  test("api mode: items load from /api, no login form, no sign-out", async () => {
    h.client = fakeClient();
    getSession.mockClear();
    const apiRow = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Áo từ server",
      category: "top",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(url.endsWith("/locations") ? { locations: [] } : { items: [apiRow] }),
            {
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    render(<Root mode="api" />);
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.getAllByText("Áo từ server").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(COPY.emailLabel)).toBeNull();
    expect(screen.queryByText("Đăng xuất")).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  test("supabase mode: signed-out user sees the login form", async () => {
    h.client = fakeClient();
    render(<Root mode="supabase" />);
    expect(await screen.findByLabelText(COPY.emailLabel)).toBeTruthy();
  });

  test("local mode: demo items, no login form", async () => {
    h.client = null;
    render(<Root mode="local" />);
    await waitFor(() => expect(cards()).toHaveLength(starter.length));
    expect(screen.queryByLabelText(COPY.emailLabel)).toBeNull();
  });
});
