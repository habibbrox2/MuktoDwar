import { describe, expect, it } from "vitest";
import {
  TRUSTED_PUBLISHER_THUMBPRINTS,
  normalizePublisherThumbprint,
  isTrustedPublisherThumbprint,
} from "../src/update/trusted-publisher.js";

describe("build-time publisher trust anchors", () => {
  it("contains only unique, structurally valid embedded pins", () => {
    expect(new Set(TRUSTED_PUBLISHER_THUMBPRINTS).size).toBe(TRUSTED_PUBLISHER_THUMBPRINTS.length);
    for (const pin of TRUSTED_PUBLISHER_THUMBPRINTS) {
      expect(pin).toMatch(/^[A-F0-9]{40}$/);
      expect(isTrustedPublisherThumbprint(pin)).toBe(true);
    }
  });

  it("normalizes only supported separators and casing", () => {
    const pin = "a".repeat(40);
    expect(normalizePublisherThumbprint(pin.match(/.{1,2}/g)!.join(":"))).toBe("A".repeat(40));
    expect(normalizePublisherThumbprint("Z".repeat(40))).toBe("Z".repeat(40));
    expect(isTrustedPublisherThumbprint("A".repeat(39))).toBe(false);
    expect(isTrustedPublisherThumbprint("Z".repeat(40))).toBe(false);
  });
});
