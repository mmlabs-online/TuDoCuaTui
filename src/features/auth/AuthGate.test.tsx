import type { Session } from "@supabase/supabase-js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { COPY } from "./authMessages";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return h.client;
  },
}));

type SignInResult = { error: { status?: number; code?: string } | null };

const setup = (opts: { session?: Session | null; signIn?: () => Promise<SignInResult> } = {}) => {
  let listener: (event: string, session: Session | null) => void = () => {};
  const signInWithPassword = vi.fn(opts.signIn ?? (async () => ({ error: null })));
  h.client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: opts.session ?? null } })),
      onAuthStateChange: vi.fn((cb: typeof listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword,
    },
  };
  render(
    <AuthGate>
      <p>app content</p>
    </AuthGate>,
  );
  return { signInWithPassword, emit: (s: Session | null) => listener("SIGNED_IN", s) };
};

const fakeSession = { access_token: "t" } as Session;
const emailInput = () => screen.getByLabelText(COPY.emailLabel) as HTMLInputElement;
const passwordInput = () => screen.getByLabelText(COPY.passwordLabel) as HTMLInputElement;
const button = () => screen.getByRole("button") as HTMLButtonElement;
const fill = (email: string, password: string) => {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.change(passwordInput(), { target: { value: password } });
};
const submit = () => fireEvent.click(button());
const waitForForm = () => screen.findByLabelText(COPY.emailLabel);

afterEach(() => {
  cleanup();
  h.client = null;
});

describe("AuthGate", () => {
  test("local mode renders children without a login form", () => {
    h.client = null;
    render(
      <AuthGate>
        <p>app content</p>
      </AuthGate>,
    );
    expect(screen.getByText("app content")).toBeTruthy();
    expect(screen.queryByLabelText(COPY.passwordLabel)).toBeNull();
  });

  test("renders nothing while the session is loading, children once getSession returns a session", async () => {
    setup({ session: fakeSession });
    expect(screen.queryByText("app content")).toBeNull();
    expect(screen.queryByLabelText(COPY.emailLabel)).toBeNull();
    expect(await screen.findByText("app content")).toBeTruthy();
  });

  test("renders email and password fields when signed out", async () => {
    setup();
    await waitForForm();
    expect(passwordInput()).toBeTruthy();
    expect(button().textContent).toBe(COPY.submit);
  });

  test("inputs have password-manager attributes", async () => {
    setup();
    await waitForForm();
    expect(emailInput().getAttribute("type")).toBe("email");
    expect(emailInput().getAttribute("autocomplete")).toBe("email");
    expect(emailInput().getAttribute("name")).toBe("email");
    expect(passwordInput().getAttribute("type")).toBe("password");
    expect(passwordInput().getAttribute("autocomplete")).toBe("current-password");
    expect(passwordInput().getAttribute("name")).toBe("password");
  });

  test("submits trimmed email and the raw password to signInWithPassword", async () => {
    const { signInWithPassword } = setup();
    await waitForForm();
    fill(" a@b.co ", " pw ");
    submit();
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: " pw " });
  });

  test("invalid email shows errInvalidEmail and makes no call", async () => {
    const { signInWithPassword } = setup();
    await waitForForm();
    fill("abc", "pw");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.errInvalidEmail);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test("empty password shows errEmptyPassword and makes no call", async () => {
    const { signInWithPassword } = setup();
    await waitForForm();
    fill("a@b.co", "");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.errEmptyPassword);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test("invalid_credentials shows errWrongCredentials; button re-enabled", async () => {
    setup({ signIn: async () => ({ error: { status: 400, code: "invalid_credentials" } }) });
    await waitForForm();
    fill("a@b.co", "bad");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.errWrongCredentials);
    await waitFor(() => expect(button().disabled).toBe(false));
  });

  test("429 shows errRateLimit", async () => {
    setup({ signIn: async () => ({ error: { status: 429 } }) });
    await waitForForm();
    fill("a@b.co", "pw");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.errRateLimit);
  });

  test("button is disabled and shows the busy label while the request is pending", async () => {
    let resolve: (r: SignInResult) => void = () => {};
    setup({ signIn: () => new Promise<SignInResult>((r) => (resolve = r)) });
    await waitForForm();
    fill("a@b.co", "pw");
    submit();
    await waitFor(() => expect(button().disabled).toBe(true));
    expect(button().textContent).toBe(COPY.signingIn);
    await act(async () => resolve({ error: null }));
    await waitFor(() => expect(button().disabled).toBe(false));
  });

  test("a thrown error shows errGeneric and re-enables the button", async () => {
    setup({
      signIn: async () => {
        throw new Error("boom");
      },
    });
    await waitForForm();
    fill("a@b.co", "pw");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.errGeneric);
    await waitFor(() => expect(button().disabled).toBe(false));
  });

  test("renders children once onAuthStateChange delivers a session", async () => {
    const { emit } = setup();
    await waitForForm();
    act(() => emit(fakeSession));
    expect(await screen.findByText("app content")).toBeTruthy();
  });

  test("never shows a resend button after a successful submit", async () => {
    const { signInWithPassword } = setup();
    await waitForForm();
    fill("a@b.co", "pw");
    submit();
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(screen.queryByText(/Gửi lại/)).toBeNull();
  });
});
