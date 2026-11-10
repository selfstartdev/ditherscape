// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DitherImage, Ditherscape, ditherscapeParentStyle, presets, type DitherscapeProps } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout, ResizeObserver or canvas: stub them so tests control size and see the drawing.
const observers = new Set<() => void>();
class FakeResizeObserver {
  constructor(private readonly cb: () => void) {}
  observe() {
    observers.add(this.cb);
  }
  disconnect() {
    observers.delete(this.cb);
  }
}

const calls: string[] = [];
const fakeContext = new Proxy(
  {},
  {
    get: (_t, name: string) => (name === "canvas" ? undefined : () => void calls.push(name)),
    set: (_t, name: string, value: unknown) => (calls.push(`${name}=${String(value)}`), true),
  },
);

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 1));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: 300, height: 200, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => fakeContext as never);
});

const roots: { unmount(): void }[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  observers.clear();
  calls.length = 0;
  document.body.innerHTML = "";
});

function mount(props: DitherscapeProps, parentStyle: Record<string, string> = ditherscapeParentStyle) {
  const host = document.createElement("div");
  Object.assign(host.style, parentStyle);
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(createElement(Ditherscape, props)));
  return host.querySelector<HTMLDivElement>("[data-ditherscape]")!;
}

describe("<Ditherscape>", () => {
  it("draws on a canvas at the measured size and fades in", () => {
    const layer = mount({ shade: { ...presets.sphere, ink: "#123456" } });
    const canvas = layer.querySelector("canvas")!;
    expect(canvas.style.width).toBe("300px");
    expect(calls).toContain("fillStyle=#123456");
    expect(calls).toContain("fill");
    expect(layer.style.opacity).toBe("1");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.style.zIndex).toBe("-1");
  });

  it("resolves currentColor from the layer", () => {
    const host = document.createElement("div");
    host.style.color = "rgb(1, 2, 3)";
    Object.assign(host.style, ditherscapeParentStyle);
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(createElement(Ditherscape, { shade: { tone: 0.5 } })));
    expect(calls).toContain("fillStyle=rgb(1, 2, 3)");
  });

  it("renders inline SVG, on the server too", () => {
    const html = renderToString(createElement(Ditherscape, { shade: { tone: 0.5 }, renderer: "svg", initialSize: { width: 100, height: 50 } }));
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"');
    expect(html).toContain("opacity:0");
    const layer = mount({ shade: { tone: 0.5 }, renderer: "svg" });
    expect(layer.querySelector("svg")!.getAttribute("width")).toBe("300");
  });

  it("server-renders an empty canvas layer", () => {
    const html = renderToString(createElement(Ditherscape, { shade: { tone: 0.5 } }));
    expect(html).toContain("<canvas");
    expect(html).toContain('data-ditherscape=""');
  });

  it("pins to the viewport with attach=fixed", () => {
    expect(mount({ shade: {}, attach: "fixed" }).style.position).toBe("fixed");
  });

  it("warns about a parent without position or stacking", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount({ shade: {} }, {});
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toMatch(/ditherscapeParentStyle/);
  });

  it("throws on invalid options, for error boundaries", () => {
    expect(() => renderToString(createElement(Ditherscape, { shade: { cell: -1 } }))).toThrow(/cell/);
  });
});

describe("<DitherImage>", () => {
  it("is an image with alt text and a layer inside", () => {
    const html = renderToString(createElement(DitherImage, { src: "/a.png", alt: "A cat" }));
    expect(html).toMatch(/role="img"/);
    expect(html).toMatch(/aria-label="A cat"/);
    expect(html).toContain("data-ditherscape");
  });
});
