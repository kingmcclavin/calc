import katex from 'katex';
import { memo, useMemo } from 'react';

const cache = new Map<string, string>();

function render(tex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${tex}`;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: 'ignore', output: 'htmlAndMathml' });
    } catch {
      html = tex;
    }
    if (cache.size > 2000) cache.clear();
    cache.set(key, html);
  }
  return html;
}

interface Props {
  tex: string;
  display?: boolean;
  className?: string;
  /** Accessible plain-text alternative */
  label?: string;
}

/** Renders a TeX string with KaTeX (output is generated locally, never from user HTML). */
export const Tex = memo(function Tex({ tex, display = false, className, label }: Props) {
  const html = useMemo(() => render(tex, display), [tex, display]);
  return <span className={className} aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />;
});
