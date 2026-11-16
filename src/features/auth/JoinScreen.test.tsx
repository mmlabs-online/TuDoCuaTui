import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinScreen } from "./JoinScreen";
import { AUTH_COPY, authErrorMessage } from "./copy";
import type { JoinScreenProps } from "./types";

afterEach(cleanup);

function setup(props: Partial<JoinScreenProps> = {}) {
  const onJoin = vi.fn();
  const onUseOtherAccount = vi.fn();
  render(
    <JoinScreen
      email="an@example.com"
      status="idle"
      onJoin={onJoin}
      onUseOtherAccount={onUseOtherAccount}
      {...props}
    />,
  );
  return { onJoin, onUseOtherAccount };
}

describe("JoinScreen", () => {
  it("a long email label can wrap (whitespace-normal beats .btn nowrap)", () => {
    setup({ email: "nguyễn.thị.phương.thảo.rất.dài.dài.dài@example.com" });
    const label = screen.getByText(/nguyễn\.thị\.phương/);
    expect(label.className).toContain("whitespace-normal");
    expect(label.className).toContain("break-all");
  });

  it("shows Tiếp tục với <email>; click calls onJoin once", () => {
    const { onJoin } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục với an@example.com" }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("renders title, body, continue and other-account, and no photo privacy notice", () => {
    setup();
    expect(screen.getByText(AUTH_COPY.join.title)).toBeTruthy();
    expect(screen.getByText(AUTH_COPY.join.body)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tiếp tục với an@example.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: AUTH_COPY.join.otherAccount })).toBeTruthy();
    expect(screen.queryByText(/Google Drive/)).toBeNull();
  });

  it("submitting disables the button and shows the joining label", () => {
    setup({ status: "submitting" });
    const button = screen.getByRole("button", {
      name: AUTH_COPY.join.joining,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("error notice uses authErrorMessage; other-account link calls onUseOtherAccount", () => {
    const { onUseOtherAccount } = setup({ error: { code: "join_closed" } });
    expect(screen.getByRole("alert").textContent).toBe(authErrorMessage({ code: "join_closed" }));
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.join.otherAccount }));
    expect(onUseOtherAccount).toHaveBeenCalledTimes(1);
  });

  it("an email with markup is rendered as text", () => {
    setup({ email: "<b>x</b>@a.co" });
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByRole("button", { name: "Tiếp tục với <b>x</b>@a.co" })).toBeTruthy();
  });
});
