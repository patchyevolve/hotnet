import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { apiMock, installApiMock } from "./api-mock";

// jsdom does not implement Element.prototype.scrollTo, which the AI
// Investigator chat pane calls to keep the transcript pinned to the bottom.
// Polyfill it so the real component can mount under jsdom.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom does not implement pointer capture, which the network graph canvas
// calls on pointer-down to begin a pan gesture. Polyfill it so the real
// component can mount and respond to pointer events under jsdom.
if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// jsdom does not implement ResizeObserver, which GraphCanvas uses to track
// the container dimensions. Provide a no-op stub.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement HTMLCanvasElement.getContext. Provide a minimal
// 2D context stub so GraphCanvas mounts without throwing.
if (
  typeof HTMLCanvasElement !== "undefined" &&
  !HTMLCanvasElement.prototype.getContext
) {
  HTMLCanvasElement.prototype.getContext = () => null;
}

// Every test runs against the fixture-backed API server rather than the
// mock-data module, which no longer exists.
beforeEach(() => {
  localStorage.clear();
  apiMock.reset();
  installApiMock();
});

afterEach(() => {
  cleanup();
});
