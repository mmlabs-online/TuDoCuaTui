import { afterEach, describe, expect, it, vi } from "vitest";

import { starter } from "@/data/demo";
import { toCsv } from "@/features/import-export/csv/serialize";
import { download, exportFile } from "@/features/import-export/download";

describe("exportFile", () => {
  it("json", () => {
    expect(exportFile(starter, "json")).toEqual({
      content: JSON.stringify(starter, null, 2),
      mime: "application/json",
      filename: "tu-do-cua-toi.json",
    });
    expect(exportFile([], "json").content).toBe("[]");
  });

  it("csv", () => {
    const out = exportFile(starter, "csv");
    expect(out.content).toBe(toCsv(starter));
    expect(out.content).toContain(starter[0].name);
    expect(out.mime).toBe("text/csv;charset=utf-8");
    expect(out.filename).toBe("tu-do-cua-toi.csv");
  });
});

describe("download", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates, clicks and revokes an object URL", () => {
    const createObjectURL = vi.fn((_: Blob) => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
    });

    download(starter, "csv");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0].type).toBe("text/csv;charset=utf-8");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("tu-do-cua-toi.csv");
    expect(anchors[0].href).toBe("blob:x");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
