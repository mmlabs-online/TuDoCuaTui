import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthRoot from "./AuthRoot";
import { AUTH_COPY } from "./copy";

const HASH = `#token=${"A".repeat(43)}`;
const ID = "11111111-1111-4111-8111-111111111111";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined); // AuthGate starts the store; no live channel handle in tests
});
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
    render(<AuthRoot renderApp={renderApp} verifyHash={HASH} />);
    await verifyThenContinue();
    expect(replace).toHaveBeenCalledWith(null, "", "/");
    expect(await screen.findByLabelText(AUTH_COPY.fields.password)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.verified);
    expect(renderApp).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2); // verify-email, then the sign-in page's accounts list
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
    render(<AuthRoot renderApp={renderApp} verifyHash={HASH} />);
    await verifyThenContinue();
    expect(await screen.findByText("app-with-auth")).toBeTruthy();
  });

  it("no hash + identity -> the gate (sign-in after one accounts call)", async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) => json({ items: [] }));
    vi.stubGlobal("fetch", fetchFn);
    render(<AuthRoot renderApp={renderApp} verifyHash={null} />);
    expect(await screen.findByLabelText(AUTH_COPY.fields.password)).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.mmlabs.online/api/v1/auth/accounts");
  });

  describe("reset", () => {
    const RESET = `#token=${"B".repeat(43)}`;
    const fillAndReset = async () => {
      fireEvent.change(screen.getByLabelText(AUTH_COPY.fields.newPassword), {
        target: { value: "correct horse battery" },
      });
      fireEvent.change(screen.getByLabelText(AUTH_COPY.fields.confirm), {
        target: { value: "correct horse battery" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.submit }));
      });
    };

    it("reset hash + identity -> no request until submit; 204 -> Tiếp tục -> replaceState(/) -> sign-in with the notice", async () => {
      const fetchFn = vi.fn(
        async (_u: string, _i?: RequestInit) => new Response(null, { status: 204 }),
      );
      vi.stubGlobal("fetch", fetchFn);
      const replace = vi.spyOn(history, "replaceState");
      render(<AuthRoot renderApp={renderApp} verifyHash={null} resetHash={RESET} />);
      expect(fetchFn).not.toHaveBeenCalled();
      await fillAndReset();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.continue }));
      });
      expect(replace).toHaveBeenCalledWith(null, "", "/");
      expect(await screen.findByLabelText(AUTH_COPY.fields.password)).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.passwordReset);
      expect(renderApp).not.toHaveBeenCalled();
      expect(fetchFn).toHaveBeenCalledTimes(2); // password/reset, then the sign-in page's accounts list
      expect(fetchFn.mock.calls[0][0]).toBe("https://api.mmlabs.online/api/v1/auth/password/reset");
      expect(fetchFn.mock.calls[0][1]?.credentials).toBe("omit");
    });

    it("token_invalid + identity -> Gửi link mới -> forgot screen", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ error: { code: "token_invalid" } }, 422)),
      );
      render(<AuthRoot renderApp={renderApp} verifyHash={null} resetHash={RESET} />);
      await fillAndReset();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.requestNew }));
      });
      expect(screen.getByRole("heading", { name: AUTH_COPY.forgot.title })).toBeTruthy();
    });
  });
});
