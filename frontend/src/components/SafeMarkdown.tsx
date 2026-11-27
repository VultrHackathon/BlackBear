/**
 * The only place agent-written markdown is rendered.
 * - No rehype-raw, and skipHtml: raw HTML in the markdown is dropped entirely.
 * - Images are disallowed (no tracking pixels, no remote loads).
 * - Links: absolute http(s) only, new tab, rel="noopener noreferrer". Anything else
 *   (javascript:, data:, relative) becomes plain text.
 */
import Markdown, { type Components } from "react-markdown";
import { safeLinkHref } from "../lib/security";

const components: Components = {
  a({ href, children }) {
    const safe = safeLinkHref(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img() {
    return null;
  },
};

export function SafeMarkdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <Markdown
        skipHtml
        disallowedElements={["img", "iframe", "script", "style", "object", "embed"]}
        urlTransform={(url) => safeLinkHref(url)}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
