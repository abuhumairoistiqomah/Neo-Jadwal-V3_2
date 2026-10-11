import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractTaskUrls, removeTaskUrlFromText, syncTaskResourcesWithText } from "../domain/taskResources";

describe("V3.12.3 structured task resources", () => {
  it("keeps plain-text tasks resource-free", () => {
    assert.deepEqual(syncTaskResourcesWithText("Kerjakan halaman 10-12", []), []);
  });

  it("promotes a pasted URL to a first-class LINK resource", () => {
    const resources = syncTaskResourcesWithText("https://classroom.google.com/c/abc", []);
    assert.equal(resources.length, 1);
    assert.equal(resources[0]?.resource_type, "LINK");
    assert.equal(resources[0]?.url, "https://classroom.google.com/c/abc");
  });

  it("supports text plus multiple unique links", () => {
    const resources = syncTaskResourcesWithText(
      "Kerjakan ini https://example.com/a lalu lihat www.example.org/b. Ulang: https://example.com/a",
      [],
    );
    assert.deepEqual(resources.map((resource) => resource.url), [
      "https://example.com/a",
      "https://www.example.org/b",
    ]);
  });

  it("does not duplicate an uploaded Drive file as a LINK", () => {
    const drive = {
      resource_type: "DRIVE_FILE" as const,
      label: "Worksheet.pdf",
      url: "https://drive.google.com/file/d/abc/view",
      drive_file_id: "abc",
      file_name: "Worksheet.pdf",
      mime_type: "application/pdf",
    };
    const resources = syncTaskResourcesWithText(`Kerjakan file ini\n${drive.url}`, [drive]);
    assert.equal(resources.length, 1);
    assert.equal(resources[0]?.resource_type, "DRIVE_FILE");
  });

  it("strips trailing prose punctuation from detected URLs", () => {
    assert.deepEqual(extractTaskUrls("Buka https://example.com/test), lalu kerjakan."), [
      "https://example.com/test",
    ]);
  });

  it("can remove a structured link even when it was pasted inline or as www", () => {
    assert.equal(
      removeTaskUrlFromText("Kerjakan di www.example.com/tugas lalu kumpulkan.", "https://www.example.com/tugas"),
      "Kerjakan di lalu kumpulkan.",
    );
  });
});
