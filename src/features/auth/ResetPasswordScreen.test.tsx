import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { AuthError, ResetPasswordScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<ResetPasswordScreenProps> = {}) {
  const onReset = vi.fn();
  const onContinue = vi.fn();
  render(
    <ResetPasswordScreen state="ready" onReset={onReset} onContinue={onContinue} {...props} />,
  );
  return { onReset, onContinue };
}
const f = AUTH_COPY.fields;
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.submit }));
const noPasswordInputs = () => expect(document.querySelector("input[type=password]")).toBeNull();

describe("ResetPasswordScreen ready", () => {
  it("has new password + confirm, both password / new-password", () => {
    setup();
    for (const label of [f.newPassword, f.confirm]) {
      const el = screen.getByLabelText(label);
      expect(el.getAttribute("type")).toBe("password");
      expect(el.getAttribute("autocomplete")).toBe("new-password");
    }
    expect(document.querySelector("form")?.getAttribute("method")).toBe("post");
  });

  it("5 chars and mismatch focus the first invalid field and do not call onReset", () => {
    const { onReset } = setup();
    type(f.newPassword, "a".repeat(5));
    type(f.confirm, "a".repeat(5));
    submit();
    expect(document.activeElement).toBe(screen.getByLabelText(f.newPassword));
    type(f.newPassword, "a".repeat(6));
    type(f.confirm, "b".repeat(6));
    submit();
    expect(document.activeElement).toBe(screen.getByLabelText(f.confirm));
    expect(onReset).not.toHaveBeenCalled();
  });

  it("6 chars are accepted", () => {
    const { onReset } = setup();
    type(f.newPassword, "a".repeat(6));
    type(f.confirm, "a".repeat(6));
    submit();
    expect(onReset).toHaveBeenCalledWith("a".repeat(6));
  });

  it("valid submit calls onReset once with the password as typed, nothing else", () => {
    const { onReset } = setup();
    type(f.newPassword, " pass word 123 ");
    type(f.confirm, " pass word 123 ");
    submit();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onReset.mock.calls[0]).toEqual([" pass word 123 "]);
  });
});

describe("ResetPasswordScreen submitting and errors", () => {
  it("submitting disables the button with the busy label", () => {
    const { onReset } = setup({ state: "submitting" });
    const btn = screen.getByRole("button", { name: AUTH_COPY.reset.submitting });
    expect(btn as HTMLButtonElement).toHaveProperty("disabled", true);
    fireEvent.submit(btn.closest("form")!);
    expect(onReset).not.toHaveBeenCalled();
  });

  it.each<AuthError>([
    { code: "weak_password", reasons: ["too_common"] },
    { code: "rate_limited", retryAfterSeconds: 45 },
    { code: "network" },
    { code: "unknown" },
  ])("shows $code in role=alert above the form", (error) => {
    setup({ error });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(authErrorMessage(error));
    if (error.code === "rate_limited") expect(alert.textContent).toContain("45 giây");
    expect(alert.compareDocumentPosition(document.querySelector("form")!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe("ResetPasswordScreen done and invalid", () => {
  it("done: status, no password inputs, Tiếp tục calls onContinue", () => {
    const { onContinue } = setup({ state: "done" });
    expect(screen.getByRole("status").textContent).toContain(AUTH_COPY.reset.done);
    noPasswordInputs();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.continue }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("invalid with onRequestNew: Gửi link mới calls it", () => {
    const onRequestNew = vi.fn();
    const { onContinue } = setup({ state: "invalid", onRequestNew });
    expect(screen.getByRole("alert").textContent).toContain(AUTH_COPY.reset.invalid);
    noPasswordInputs();
    expect(screen.queryByRole("button", { name: AUTH_COPY.reset.continue })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.requestNew }));
    expect(onRequestNew).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("invalid without onRequestNew: Tiếp tục calls onContinue", () => {
    const { onContinue } = setup({ state: "invalid" });
    expect(screen.queryByRole("button", { name: AUTH_COPY.reset.requestNew })).toBeNull();
    noPasswordInputs();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.reset.continue }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
