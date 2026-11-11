/**
 * @jest-environment jsdom
 *
 * The DOM half of leaf motion on plain elements: what a glide writes on the
 * wrapper, the frame layer and the tile root, and that the end of a glide
 * gives the tile root back exactly what it had — except properties someone
 * else wrote while it glided.
 */
import { describe, expect, it } from "@jest/globals";
import type { Rect } from "@n-uf/motion";
import type { LeafMotionFrame } from "../engine/leaf-motion";
import { clearLeafMotion, writeLeafMotionFrame } from "../react/leaf-motion-dom";

function leafDom(): { wrapper: HTMLDivElement; frame: HTMLDivElement; content: HTMLElement } {
  const wrapper: HTMLDivElement = document.createElement("div");
  const frame: HTMLDivElement = document.createElement("div");
  frame.setAttribute("data-hpt-leaf-frame", "");
  frame.style.display = "none";
  const content: HTMLElement = document.createElement("article");
  content.style.transition = "box-shadow 300ms ease";
  content.style.boxShadow = "0 0 4px red";
  wrapper.append(frame, content);
  document.body.appendChild(wrapper);
  return { wrapper, frame, content };
}

const TARGET: Rect = { x: 100, y: 0, width: 300, height: 200 };

function frameAt(drawn: Rect, moving: boolean): LeafMotionFrame {
  return {
    id: "a",
    drawn,
    target: TARGET,
    reveal: {
      dx: drawn.x - TARGET.x,
      dy: drawn.y - TARGET.y,
      width: drawn.width,
      height: drawn.height,
      clipRight: Math.max(0, TARGET.width - drawn.width),
      clipBottom: Math.max(0, TARGET.height - drawn.height),
    },
    pop: null,
    moving,
  };
}

describe("leaf-motion-dom", () => {
  it("draws a glide with translate, a frame layer and a clip, and neutralises the root's chrome", () => {
    const { wrapper, frame, content } = leafDom();
    writeLeafMotionFrame(wrapper, frameAt({ x: 0, y: 0, width: 200, height: 200 }, true));
    expect(wrapper.style.transform).toBe("translate(-100px, 0px)");
    expect(frame.style.display).toBe("block");
    expect(frame.style.width).toBe("200px");
    expect(content.style.boxShadow).toBe("none");
    expect(content.style.clipPath).toContain("inset(0 100px 0px 0");
    // The root's own transition is back once the override is applied.
    expect(content.style.transition).toBe("box-shadow 300ms ease");
  });

  it("at rest restores the root's own inline values and transition, and clears the wrapper", () => {
    const { wrapper, frame, content } = leafDom();
    writeLeafMotionFrame(wrapper, frameAt({ x: 0, y: 0, width: 200, height: 200 }, true));
    writeLeafMotionFrame(wrapper, frameAt(TARGET, false));
    expect(content.style.boxShadow).toBe("0 0 4px red");
    expect(content.style.transition).toBe("box-shadow 300ms ease");
    expect(content.style.clipPath).toBe("");
    expect(content.style.backgroundColor).toBe("");
    expect(wrapper.getAttribute("style") ?? "").toBe("");
    expect(frame.style.display).toBe("none");
  });

  it("a value written on the root while it glided survives the end of the glide", () => {
    const { wrapper, content } = leafDom();
    writeLeafMotionFrame(wrapper, frameAt({ x: 0, y: 0, width: 200, height: 200 }, true));
    // React re-renders the pane mid-glide with a drag-source border colour.
    content.style.borderTopColor = "rgb(240, 171, 252)";
    content.style.boxShadow = "0 0 8px blue";
    writeLeafMotionFrame(wrapper, frameAt(TARGET, false));
    expect(content.style.borderTopColor).toBe("rgb(240, 171, 252)");
    expect(content.style.boxShadow).toBe("0 0 8px blue");
    // Untouched overrides are still restored.
    expect(content.style.borderRightColor).toBe("");
  });

  it("clearLeafMotion (unmount) leaves nothing behind", () => {
    const { wrapper, frame, content } = leafDom();
    writeLeafMotionFrame(wrapper, frameAt({ x: 0, y: 0, width: 200, height: 200 }, true));
    clearLeafMotion(wrapper);
    expect(wrapper.getAttribute("style") ?? "").toBe("");
    expect(frame.style.display).toBe("none");
    expect(content.style.clipPath).toBe("");
    expect(content.style.boxShadow).toBe("0 0 4px red");
  });
});
