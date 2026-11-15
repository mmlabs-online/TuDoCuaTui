import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/features/layout/Header";
import { LAYOUT_COPY } from "@/features/layout/copy";
import { AuthGate, type AppAuthProps } from "./AuthGate";
import { AUTH_COPY } from "./copy";
import type { IdentityClient } from "./identityClient";
import { createTokenStore, type AccountIdStorage } from "./tokenStore";
import type { AuthError } from "./types";

const tsApi = vi.hoisted(() => ({
  render: vi.fn((_el: HTMLElement, _o: unknown) => "w"),
  reset: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./turnstile", () => ({ loadTurnstile: () => Promise.resolve(tsApi) }));

const ID = "11111111-1111-4111-8111-111111111111";
const err = (code: AuthError["code"]): AuthError => ({ code });
const PASSWORD = "correct horse battery";

let events: string[];
let seenProps: AppAuthProps[];
let mounts: number;

function FakeApp(p: AppAuthProps) {
  useEffect(() => {
    seenProps.push(p);
    mounts++;
    events.push("app-mounted");
    return () => void events.push("app-unmounted");
  }, [p]);
  return (
    <div>
      <p>app-ready</p>
      <button onClick={p.onSignOut}>out</button>
      <button onClick={p.onAuthLost}>lost</button>
    </div>
  );
}

function setup(opts: { id?: string | null; notice?: "verified" | null } = {}) {
  let stored = opts.id === undefined ? null : opts.id;
  const storage: AccountIdStorage = {
    read: () => stored,
    write: (v) => {
      stored = v;
      events.push("id-written");
    },
    clear: () => {
      stored = null;
      events.push("id-cleared");
    },
  };
  const client = {
    login: vi.fn(async (_v: unknown) => ({ accountId: ID, email: "a@b.co" })),
    token: vi.fn(async (_id: string) => ({ accessToken: "tok", expiresIn: 900 })),
    logout: vi.fn(async (_id: string) => {
      events.push("logout");
    }),
    signup: vi.fn(async (v: { email: string }) => ({ email: v.email })),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(async (_id: string) => {}),
  };
  const store = createTokenStore({ client: client as unknown as IdentityClient, storage });
  const view = render(
    <AuthGate
      store={store}
      client={client as unknown as IdentityClient}
      renderApp={(p) => <FakeApp {...p} />}
      notice={opts.notice}
    />,
  );
  return { client, store, stored: () => stored, view };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const signInWith = async () => {
  type(AUTH_COPY.fields.email, "a@b.co");
  type(AUTH_COPY.fields.password, PASSWORD);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
  });
};
const alertText = () => screen.getByRole("alert").textContent;

beforeEach(() => {
  events = [];
  seenProps = [];
  mounts = 0;
  tsApi.render.mockClear();
  tsApi.reset.mockClear();
  tsApi.remove.mockClear();
});
afterEach(cleanup);

describe("restore", () => {
  it("no id -> sign-in with zero network and the App not rendered", () => {
    const { client } = setup();
    expect(screen.getByRole("button", { name: AUTH_COPY.signIn.submit })).toBeTruthy();
    expect(screen.queryByText("app-ready")).toBeNull();
    expect(client.token).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
  });

  it("notice verified is shown on the sign-in screen", () => {
    setup({ notice: "verified" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.signIn.verified);
  });

  it("id present -> checking -> ready with no sign-in form", async () => {
    const { client } = setup({ id: ID });
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(await screen.findByText("app-ready")).toBeTruthy();
    expect(screen.queryByLabelText(AUTH_COPY.fields.password)).toBeNull();
    expect(client.token).toHaveBeenCalledWith(ID);
  });
});

describe("restore outcomes", () => {
  const withFailure = async (code: AuthError["code"]) => {
    let stored: string | null = ID;
    const client = {
      token: vi.fn(async () => {
        throw err(code);
      }),
    } as unknown as IdentityClient;
    const store = createTokenStore({
      client,
      storage: { read: () => stored, write: () => {}, clear: () => (stored = null) },
    });
    render(<AuthGate store={store} client={client} renderApp={(p) => <FakeApp {...p} />} />);
    await waitFor(() => expect(screen.queryByText(AUTH_COPY.gate.checking)).toBeNull());
    return { store, stored: () => stored };
  };

  it("session_invalid -> sign-in, id removed", async () => {
    const r = await withFailure("session_invalid");
    expect(alertText()).toContain(AUTH_COPY.errors.session_invalid);
    expect(screen.getByLabelText(AUTH_COPY.fields.email)).toBeTruthy();
    expect(r.stored()).toBeNull();
  });

  it.each(["network", "rate_limited"] as const)("%s -> retry screen, id kept", async (code) => {
    const r = await withFailure(code);
    expect(screen.getByRole("button", { name: AUTH_COPY.actions.retry })).toBeTruthy();
    expect(screen.queryByLabelText(AUTH_COPY.fields.password)).toBeNull();
    expect(r.stored()).toBe(ID);
  });

  it.each([
    ["not_member", AUTH_COPY.errors.not_member],
    ["email_unverified", AUTH_COPY.errors.email_unverified],
  ] as const)("%s -> sign-in with that error, id kept", async (code, text) => {
    const r = await withFailure(code);
    expect(alertText()).toContain(text);
    expect(screen.getByLabelText(AUTH_COPY.fields.email)).toBeTruthy();
    expect(r.stored()).toBe(ID);
  });

  it("retry runs the restore again", async () => {
    let n = 0;
    const client = {
      token: vi.fn(async () => {
        if (++n === 1) throw err("network");
        return { accessToken: "t", expiresIn: 900 };
      }),
    } as unknown as IdentityClient;
    const store = createTokenStore({
      client,
      storage: { read: () => ID, write: () => {}, clear: () => {} },
    });
    render(<AuthGate store={store} client={client} renderApp={(p) => <FakeApp {...p} />} />);
    fireEvent.click(await screen.findByRole("button", { name: AUTH_COPY.actions.retry }));
    expect(await screen.findByText("app-ready")).toBeTruthy();
  });
});

describe("sign-in", () => {
  it("login -> token -> App rendered with a stable getToken", async () => {
    const { client } = setup();
    await signInWith();
    expect(await screen.findByText("app-ready")).toBeTruthy();
    expect(client.login).toHaveBeenCalledWith({
      email: "a@b.co",
      password: PASSWORD,
      turnstileToken: undefined,
    });
    expect(new Set(seenProps.map((p) => p.getToken)).size).toBe(1); // stable within one App instance
    expect(await seenProps[0].getToken()).toBe("tok");
  });

  it("invalid_credentials is shown", async () => {
    const { client } = setup();
    client.login.mockRejectedValueOnce(err("invalid_credentials"));
    await signInWith();
    expect(alertText()).toContain(AUTH_COPY.errors.invalid_credentials);
  });

  it("turnstile_required shows the slot; the next login includes turnstile_token", async () => {
    const { client } = setup();
    client.login.mockRejectedValueOnce(err("turnstile_required"));
    await signInWith();
    await waitFor(() => expect(tsApi.render).toHaveBeenCalled());
    // no Turnstile token yet: no login call
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    });
    expect(client.login).toHaveBeenCalledTimes(1);
    const opts = tsApi.render.mock.calls[0][1] as { callback: (t: string) => void };
    act(() => opts.callback("ts-token"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    });
    expect(client.login).toHaveBeenCalledTimes(2);
    expect(client.login.mock.calls[1][0]).toMatchObject({ turnstileToken: "ts-token" });
    expect(await screen.findByText("app-ready")).toBeTruthy();
  });

  it("the Turnstile token is single-use; a wrong password is reported as such and the widget stays", async () => {
    const { client } = setup();
    const widgetCallback = () =>
      (tsApi.render.mock.calls.at(-1)![1] as { callback: (t: string) => void }).callback;
    client.login.mockRejectedValueOnce(err("turnstile_required"));
    await signInWith();
    await waitFor(() => expect(tsApi.render).toHaveBeenCalled());
    act(() => widgetCallback()("ts"));
    client.login.mockRejectedValueOnce(err("invalid_credentials"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    });
    expect(tsApi.reset).toHaveBeenCalled();
    expect(alertText()).toContain(AUTH_COPY.errors.invalid_credentials);
    expect(tsApi.render).toHaveBeenCalled();
    expect(tsApi.remove).not.toHaveBeenCalled(); // the widget slot is still mounted
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    });
    expect(client.login).toHaveBeenCalledTimes(2); // spent token: no third call without a new one
    expect(alertText()).toContain(AUTH_COPY.errors.turnstile_required);
    act(() => widgetCallback()("ts2"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.submit }));
    });
    expect(client.login).toHaveBeenCalledTimes(3);
    expect(client.login.mock.calls[2][0]).toMatchObject({ turnstileToken: "ts2" });
  });

  it("email_unverified -> resend -> sent", async () => {
    const { client } = setup();
    client.token.mockRejectedValueOnce(err("email_unverified"));
    await signInWith();
    expect(alertText()).toContain(AUTH_COPY.errors.email_unverified);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.resend }));
    });
    expect(client.resendVerification).toHaveBeenCalledWith(ID);
    expect(screen.getByText(AUTH_COPY.actions.resendSent)).toBeTruthy();
  });

  it("a new sign-in remounts the App", async () => {
    const { client } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    await act(async () => {
      fireEvent.click(screen.getByText("out"));
    });
    await screen.findByText(AUTH_COPY.signIn.signedOut);
    await signInWith();
    await screen.findByText("app-ready");
    expect(mounts).toBe(2);
    expect(client.login).toHaveBeenCalledTimes(2);
  });

  it("a getToken from an old App generation resolves null after sign-out -> sign-in", async () => {
    setup();
    await signInWith();
    await screen.findByText("app-ready");
    const old = seenProps[0];
    expect(await old.getToken()).toBe("tok");
    await act(async () => {
      fireEvent.click(screen.getByText("out"));
    });
    await screen.findByText(AUTH_COPY.signIn.signedOut);
    await signInWith();
    await screen.findByText("app-ready");
    expect(await old.getToken()).toBeNull();
    expect(await seenProps[1].getToken()).toBe("tok");
    act(() => old.onAuthLost());
    expect(screen.getByText("app-ready")).toBeTruthy(); // old callbacks cannot end the new session
  });
});

describe("sign-up", () => {
  const goSignUp = () =>
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signIn.toSignUp }));
  const fill = () => {
    type(AUTH_COPY.fields.email, "n@b.co");
    type(AUTH_COPY.fields.password, PASSWORD);
    type(AUTH_COPY.fields.confirm, PASSWORD);
  };

  it("without a Turnstile token no request is made", async () => {
    const { client } = setup();
    goSignUp();
    fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signUp.submit }));
    });
    expect(client.signup).not.toHaveBeenCalled();
    expect(alertText()).toContain(AUTH_COPY.errors.turnstile_required);
  });

  it("201 -> sent, the form is gone and a fresh sign-up has empty fields", async () => {
    const { client } = setup();
    goSignUp();
    await waitFor(() => expect(tsApi.render).toHaveBeenCalled());
    fill();
    act(() => (tsApi.render.mock.calls[0][1] as { callback: (t: string) => void }).callback("ts"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signUp.submit }));
    });
    expect(client.signup).toHaveBeenCalledWith({
      email: "n@b.co",
      password: PASSWORD,
      turnstileToken: "ts",
    });
    expect(tsApi.reset).toHaveBeenCalled();
    expect(screen.getByText(new RegExp(AUTH_COPY.signUp.sentTitle))).toBeTruthy();
    expect(screen.getByText(/n@b\.co/)).toBeTruthy();
    expect(document.querySelector("input[type=password]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.actions.goSignIn }));
    goSignUp();
    expect((screen.getByLabelText(AUTH_COPY.fields.email) as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByLabelText(AUTH_COPY.fields.password, { exact: true }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("email_taken is shown", async () => {
    const { client } = setup();
    client.signup.mockRejectedValueOnce(err("email_taken"));
    goSignUp();
    await waitFor(() => expect(tsApi.render).toHaveBeenCalled());
    fill();
    act(() => (tsApi.render.mock.calls[0][1] as { callback: (t: string) => void }).callback("ts"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.signUp.submit }));
    });
    expect(alertText()).toContain(AUTH_COPY.errors.email_taken);
  });
});

describe("sign-out and auth loss", () => {
  it("order: App unmount -> id cleared -> logout, then the signed-out notice", async () => {
    const { client, stored } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    events.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByText("out"));
    });
    expect(events).toEqual(["app-unmounted", "id-cleared", "logout"]);
    expect(client.logout).toHaveBeenCalledWith(ID);
    expect(stored()).toBeNull();
    expect(screen.getByText(AUTH_COPY.signIn.signedOut)).toBeTruthy();
    expect(screen.queryByText("app-ready")).toBeNull();
  });

  it("a hanging logout does not hold the gate", async () => {
    const { client, stored } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    client.logout.mockReturnValueOnce(new Promise<void>(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText("out"));
    });
    expect(screen.getByText(AUTH_COPY.signIn.signedOut)).toBeTruthy();
    expect(stored()).toBeNull();
  });

  it("logout failure still signs out", async () => {
    const { client, stored } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    client.logout.mockRejectedValueOnce(err("network"));
    await act(async () => {
      fireEvent.click(screen.getByText("out"));
    });
    expect(screen.getByText(AUTH_COPY.signIn.signedOut)).toBeTruthy();
    expect(stored()).toBeNull();
  });

  it("onAuthLost -> no_access notice, id removed, logout not called, idempotent", async () => {
    const { client, stored } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    const lost = seenProps[0].onAuthLost;
    act(() => {
      lost();
      lost();
    });
    expect(alertText()).toContain(AUTH_COPY.errors.no_access);
    expect(stored()).toBeNull();
    expect(client.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("app-ready")).toBeNull();
  });

  it("a background refresh failing with session_invalid returns to sign-in", async () => {
    const { client, store } = setup();
    await signInWith();
    await screen.findByText("app-ready");
    client.token.mockRejectedValueOnce(err("session_invalid"));
    await act(async () => {
      await store.getToken("tok").catch(() => {});
    });
    expect(alertText()).toContain(AUTH_COPY.errors.session_invalid);
  });
});

describe("Header sign-out button", () => {
  const header = (onSignOut?: () => void) =>
    render(
      <Header
        count={0}
        dark={false}
        onToggleDark={() => {}}
        onImport={() => {}}
        onExport={() => {}}
        onAdd={() => {}}
        onSignOut={onSignOut}
      />,
    );
  it("is present with the LAYOUT_COPY label when onSignOut is set", () => {
    const fn = vi.fn();
    header(fn);
    fireEvent.click(screen.getByLabelText(LAYOUT_COPY.signOut));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("is absent otherwise", () => {
    header();
    expect(screen.queryByLabelText(LAYOUT_COPY.signOut)).toBeNull();
  });
});
