export function readSelectionMarkdown(): string | null {
  const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "BLOCKQUOTE", "SECTION", "ARTICLE", "TABLE"]);
  const LANG_CLASS = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/i;
  const SOURCE_CLASS = /(?:^|\s)highlight-source-([\w+#.-]+)/i;
  const MARK = "\uE000";
  const NON_LANG = new Set(["hljs", "code", "highlight", "sourcecode", "codeblock", "line-numbers", "nohighlight", "plaintext", "text"]);

  function languageOf(elements: Array<Element | null>): string {
    for (const element of elements) {
      if (!element) {
        continue;
      }

      const dataLang = element.getAttribute("data-lang") ?? element.getAttribute("data-language");
      const className = element.getAttribute("class") ?? "";
      const match = LANG_CLASS.exec(className) ?? SOURCE_CLASS.exec(className);

      if (dataLang && /^[\w+#.-]+$/.test(dataLang)) {
        return dataLang.toLowerCase();
      }

      if (match?.[1]) {
        return match[1].toLowerCase();
      }

      if (/(?:^|\s)hljs(?:\s|$)/.test(className)) {
        const token = className.split(/\s+/).find((name) => name !== "" && !name.startsWith("hljs") && !NON_LANG.has(name.toLowerCase()));

        if (token) {
          return token.toLowerCase();
        }
      }
    }

    return "";
  }

  function codeText(node: Node): string {
    if (node.nodeType === 3) {
      return (node.textContent ?? "").replaceAll(MARK, "");
    }

    if (node.nodeType === 11) {
      return Array.from(node.childNodes).map(codeText).join("");
    }

    if (node.nodeType !== 1) {
      return "";
    }

    const element = node as Element;

    if (element.tagName === "BR") {
      return "\n";
    }

    let out = "";

    let afterLineDiv = false;

    for (const child of Array.from(element.childNodes)) {
      const piece = codeText(child);

      out += afterLineDiv && piece.startsWith("\n") ? piece.slice(1) : piece;
      afterLineDiv = child.nodeType === 1 && (child as Element).tagName === "DIV" && piece.endsWith("\n");
    }

    if (element.tagName === "DIV" && out !== "" && !out.endsWith("\n")) {
      out += "\n";
    }

    return out;
  }

  function fence(code: string, language: string): string {
    const body = code.replace(/\r\n?/g, "\n").replace(/\n+$/, "").replace(/^\n+/, "");
    const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
    const marks = "`".repeat(Math.max(3, longest + 1));

    return `${MARK}${marks}${language}\n${body}\n${marks}${MARK}`;
  }

  function inline(code: string): string {
    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    const marks = "`".repeat(longest + 1);

    return `${marks}${code}${marks}`;
  }

  function convert(node: Node, state: { sawCode: boolean }): string {
    if (node.nodeType === 3) {
      return (node.textContent ?? "").replaceAll(MARK, "").replace(/\s+/g, " ");
    }

    if (node.nodeType === 11) {
      return Array.from(node.childNodes).map((child) => convert(child, state)).join("");
    }

    if (node.nodeType !== 1) {
      return "";
    }

    const element = node as Element;

    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
      return "";
    }

    if (element.tagName === "BR") {
      return "\n";
    }

    if (element.tagName === "PRE") {
      state.sawCode = true;

      return fence(codeText(element), languageOf([element.querySelector("code"), element, element.parentElement]));
    }

    if (element.tagName === "CODE") {
      state.sawCode = true;

      const text = codeText(element);

      return text.includes("\n") ? fence(text, languageOf([element])) : inline(text);
    }

    let out = "";

    for (const child of Array.from(element.childNodes)) {
      out += convert(child, state);
    }

    return BLOCK_TAGS.has(element.tagName) ? `\n${out}\n` : out;
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const state = { sawCode: false };
  const parts: string[] = [];

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const container = range.commonAncestorContainer;
    const host = container.nodeType === 1 ? (container as Element) : container.parentElement;
    const enclosing = host?.closest("pre, code") ?? null;

    if (enclosing) {
      state.sawCode = true;

      const text = codeText(range.cloneContents());
      const language = languageOf([enclosing.querySelector("code"), enclosing.closest("code"), enclosing, enclosing.parentElement]);

      parts.push(enclosing.closest("pre") || text.includes("\n") ? fence(text, language) : inline(text));

      continue;
    }

    parts.push(convert(range.cloneContents(), state));
  }

  if (!state.sawCode) {
    return null;
  }

  const tidy = (prose: string): string =>
    prose
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  return parts
    .join("\n\n")
    .split(MARK)
    .map((segment, index) => (index % 2 === 1 ? segment : tidy(segment)))
    .reduce((out, segment, index) => {
      if (segment === "" && index % 2 === 0) {
        return out;
      }

      return out === "" ? segment : `${out}\n\n${segment}`;
    }, "");
}
