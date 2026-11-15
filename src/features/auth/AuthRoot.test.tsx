import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthRoot from "./AuthRoot";
import { AUTH_COPY } from "./copy";

const HASH = `#token=${"A".repeat(43)}`;
const ID = "11111111-1111-4111-8111-111111111111";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const renderApp = vi.fn((p?: unknown) => <p>{p ? "app-with-auth" : "app-plain"}</p>);
const verifyThenContinue = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.verify.submit }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.verify.continue }));
  });
};

describe("AuthRoot", () => {
  it("verify hash + identity -> verify page, Tiếp tục -> replaceState(/) then the gate with the verified notice", async () => {
    const fetchFn = vi.fn(
      async (_u: string, _i?: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const replace = vi.spyOn(history, "replaceState");
    render(<AuthRoot renderApp={renderApp} verifyHash={HASH} identity />);
    await verifyThenContinue();
    expect(replace).toHaveBeenCalledWith(null, "", "/");
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.verified);
    expect(screen.getByLabelText(AUTH_COPY.fields.password)).toBeTruthy();
    expect(renderApp).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.mmlabs.online/api/v1/auth/verify-email");
  });

  it("verify hash + identity with a stored account id -> silent restore after continue", async () => {
    localStorage.setItem("mm_account_id", ID);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) =>
        u.endsWith("/auth/verify-email")
          ? new Response(null, { status: 204 })
          : json({
              access_token: "t",
              token_type: "Bearer",
              expires_in: 900,
              audience: "tudocuatui",
            }),
      ),
    );
    render(<AuthRoot renderApp={renderApp} verifyHash={HASH} identity />);
    await verifyThenContinue();
    expect(await screen.findByText("app-with-auth")).toBeTruthy();
  });

  it("verify hash + access -> verify page, then renderApp() with no props", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    render(<AuthRoot renderApp={renderApp} verifyHash={HASH} identity={false} />);
    await verifyThenContinue();
    expect(screen.getByText("app-plain")).toBeTruthy();
    expect(renderApp).toHaveBeenLastCalledWith();
  });

  it("no hash + identity -> the gate (sign-in, no network)", () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    render(<AuthRoot renderApp={renderApp} verifyHash={null} identity />);
    expect(screen.getByLabelText(AUTH_COPY.fields.password)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
