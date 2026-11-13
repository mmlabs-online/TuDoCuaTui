import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AiSettingsError, type AiSettingsClient } from "@/data/aiSettings";
import type { AiSettingsView } from "@/shared/ai/catalog";
import { AiSettingsModal } from "./AiSettingsModal";
import { AI_ERRORS, SETTINGS_COPY as COPY } from "./copy";

afterEach(cleanup);

const KEY = "sk-ant-" + "q".repeat(24) + "wxyz";
const view = (o: Partial<AiSettingsView> = {}): AiSettingsView => ({
  provider: "claude",
  model: "claude-sonnet-5-5",
  keyHint: "••••wxyz",
  hasKey: true,
  modelSupported: true,
  updatedAt: "x",
  ...o,
});
const fake = (o: Partial<AiSettingsClient> = {}): AiSettingsClient => ({
  get: vi.fn(async () => null),
  save: vi.fn(async () => view()),
  deleteKey: vi.fn(async () => view({ hasKey: false, keyHint: null })),
  test: vi.fn(async () => {}),
  ...o,
});
async function open(client: AiSettingsClient) {
  const r = render(<AiSettingsModal client={client} onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText(COPY.loading)).toBeNull());
  return r;
}
const keyInput = () => document.querySelector<HTMLInputElement>("input[type=password]")!;
const btn = (name: string) => screen.getByRole("button", { name });
const type = (v: string) => fireEvent.change(keyInput(), { target: { value: v } });

describe("AiSettingsModal", () => {
  it("shows loading, then the empty state with Claude and its default model", async () => {
    render(<AiSettingsModal client={fake()} onClose={() => {}} />);
    expect(screen.getByText(COPY.loading)).toBeTruthy();
    await waitFor(() => expect(keyInput()).toBeTruthy());
    const [provider, model] = Array.from(document.querySelectorAll("select"));
    expect(provider.value).toBe("claude");
    expect(model.value).toBe("claude-haiku-5-5");
    expect(screen.getByText(COPY.noKey)).toBeTruthy();
  });

  it("save shows the masked hint and empties the key field", async () => {
    await open(fake());
    type(KEY);
    fireEvent.click(btn(COPY.save));
    await waitFor(() => expect(screen.getByText(COPY.saved)).toBeTruthy());
    expect(screen.getByText(COPY.keySaved("••••wxyz"))).toBeTruthy();
    expect(keyInput().value).toBe("");
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it("a fresh mount shows only the hint", async () => {
    await open(fake({ get: vi.fn(async () => view()) }));
    expect(screen.getByText(COPY.keySaved("••••wxyz"))).toBeTruthy();
    expect(keyInput().value).toBe("");
    expect(document.body.innerHTML).not.toContain("sk-ant");
  });

  it("lists Gemini as disabled and disables Save for an invalid combination", async () => {
    await open(fake());
    const gemini = screen.getByRole("option", { name: COPY.providerOptions.gemini });
    expect((gemini as HTMLOptionElement).disabled).toBe(true);
    expect((btn(COPY.save) as HTMLButtonElement).disabled).toBe(true);
    type("short");
    expect((btn(COPY.save) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(AI_ERRORS.invalid_key_format)).toBeTruthy();
  });

  it("test success, and disabled while the form is dirty", async () => {
    await open(fake({ get: vi.fn(async () => view()) }));
    fireEvent.click(btn(COPY.test));
    await waitFor(() => expect(screen.getByText(COPY.testOk)).toBeTruthy());
    type(KEY);
    expect((btn(COPY.test) as HTMLButtonElement).disabled).toBe(true);
  });

  it("test failure shows the prefix and the message", async () => {
    const test = vi.fn(async () => {
      throw new AiSettingsError(422, "invalid_key");
    });
    await open(fake({ get: vi.fn(async () => view()), test }));
    fireEvent.click(btn(COPY.test));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(COPY.testFailed + AI_ERRORS.invalid_key),
    );
  });

  it("network error on load shows the message and Thử lại calls get again", async () => {
    const get = vi
      .fn<AiSettingsClient["get"]>()
      .mockRejectedValueOnce(new AiSettingsError(0, "network"))
      .mockResolvedValue(null);
    await open(fake({ get }));
    expect(screen.getByText(AI_ERRORS.network)).toBeTruthy();
    fireEvent.click(btn(COPY.retry));
    await waitFor(() => expect(keyInput()).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("invalid_key_format from the server keeps the typed key", async () => {
    const save = vi.fn(async () => {
      throw new AiSettingsError(400, "invalid_key_format");
    });
    await open(fake({ save }));
    type(KEY);
    fireEvent.click(btn(COPY.save));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(AI_ERRORS.invalid_key_format)).toBeTruthy();
    expect(keyInput().value).toBe(KEY);
  });

  it("delete key asks for confirmation, then removes the hint", async () => {
    const client = fake({ get: vi.fn(async () => view()) });
    await open(client);
    fireEvent.click(btn(COPY.deleteKey));
    expect(client.deleteKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: COPY.confirmDelete.confirm }).at(-1)!);
    await waitFor(() => expect(screen.getByText(COPY.deleted)).toBeTruthy());
    expect(client.deleteKey).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.keySaved("••••wxyz"))).toBeNull();
  });

  it("server_misconfigured hides the form", async () => {
    const get = vi.fn(async () => {
      throw new AiSettingsError(503, "server_misconfigured");
    });
    await open(fake({ get }));
    expect(screen.getByText(AI_ERRORS.server_misconfigured)).toBeTruthy();
    expect(keyInput()).toBeNull();
  });

  it("notes an unsupported model", async () => {
    await open(fake({ get: vi.fn(async () => view({ modelSupported: false })) }));
    expect(screen.getByText(COPY.unsupportedModel)).toBeTruthy();
  });
});
