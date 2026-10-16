class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;
// jsdom has no canvas; pages guard against a null context, so return null quietly.
HTMLCanvasElement.prototype.getContext = (() => null) as any;
