import { describe, expect, it } from "vitest";
import {
  TRUSTED_PUBLISHER_THUMBPRINTS,
  normalizePublisherThumbprint,
  isTrustedPublisherThumbprint,
} from "../src/update/trusted-publisher.js";

describe("build-time publisher trust anchors", () => {
  it("ships with no trust anchors unless a release build provisions one", () => {
    expect(TRUSTED_PUBLISHER_THUMBPRINTS).toEqual([]);
    expect(isTrustedPublisherThumbprint("A".repeat(40))).toBe(false);
  });

  it("normalizes separators and casing without weakening length validation", () => {
    const pin = "a".repeat(40);
    expect(normalizePublisherThumbprint(pin.match(/.{1,2}/g)!.join(":"))).toBe("A".repeat(40));
    expect(isTrustedPublisherThumbprint("A".repeat(39))).toBe(false);
    expect(isTrustedPublisherThumbprint("Z".repeat(40))).toBe(false);
  });
});
