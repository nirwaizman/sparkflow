"use client";

/**
 * Sandboxed iframe that renders AI-generated HTML.
 *
 * Security:
 * - `sandbox="allow-scripts"` — scripts run (Tailwind CDN needs it) but the
 *   iframe is cross-origin'd into an opaque origin, so it cannot touch the
 *   parent page's cookies, storage, or DOM.
 * - `allow-same-origin` is intentionally NOT set.
 *
 * Behaviour:
 * - We inject a small resize script before `</body>` that posts the content
 *   height back to the parent whenever it changes. The parent resizes the
 *   iframe so the page scrolls naturally inside the preview container.
 * - A `srcDoc` update fully re-renders the iframe contents.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  html: string;
  /** Container width in CSS pixels — controls the device simulation. */
  width: number;
  /** Optional max height cap; scroll inside the iframe past this. */
  maxHeight?: number;
  className?: string;
  title?: string;
};

const RESIZE_SCRIPT = `
<script>
(function(){
  function post(){
    try {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ __sparkflowDesignHeight: h }, "*");
    } catch (_) {}
  }
  window.addEventListener("load", post);
  window.addEventListener("resize", post);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(post).observe(document.documentElement);
  } else {
    setInterval(post, 500);
  }
})();
</script>
`;

function injectResizeScript(html: string): string {
  if (/__sparkflowDesignHeight/.test(html)) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${RESIZE_SCRIPT}</body>`);
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${RESIZE_SCRIPT}</html>`);
  }
  return html + RESIZE_SCRIPT;
}

export function PreviewIframe({
  html,
  width,
  maxHeight = 900,
  className,
  title = "Design preview",
}: Props) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(480);

  const srcDoc = useMemo(() => injectResizeScript(html), [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { __sparkflowDesignHeight?: number } | null;
      if (!data || typeof data !== "object") return;
      const h = data.__sparkflowDesignHeight;
      if (typeof h !== "number" || !Number.isFinite(h)) return;
      // Only accept messages whose source is our own iframe's window.
      if (ref.current && e.source !== ref.current.contentWindow) return;
      const clamped = Math.min(Math.max(h, 200), maxHeight);
      setHeight(clamped);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [maxHeight]);

  // Reset height on srcDoc change so a new, shorter design doesn't keep the
  // old, taller height until the resize script fires.
  useEffect(() => {
    setHeight(480);
  }, [srcDoc]);

  return (
    <div
      className={className}
      style={{
        width,
        maxWidth: "100%",
        marginInline: "auto",
        transition: "width 200ms ease",
      }}
    >
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{
          display: "block",
          width: "100%",
          height,
          border: 0,
          background: "white",
          borderRadius: 8,
        }}
      />
    </div>
  );
}
