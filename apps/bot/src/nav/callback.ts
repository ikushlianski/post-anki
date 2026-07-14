export type CallbackKind =
  | "home"
  | "continue"
  | "subject"
  | "curriculum"
  | "module"
  | "topic"
  | "start_topic"
  | "start_module"
  | "regenerate_topic"
  | "regenerate_module"
  | "answer"
  | "next"
  | "noop";

export interface ParsedCallback {
  kind: CallbackKind;
  arg: string;
}

const PREFIX_TO_KIND: Record<string, CallbackKind> = {
  home: "home",
  cont: "continue",
  sub: "subject",
  cur: "curriculum",
  mod: "module",
  top: "topic",
  st: "start_topic",
  sm: "start_module",
  rt: "regenerate_topic",
  rm: "regenerate_module",
  qa: "answer",
  qnext: "next",
};

export function parseCallback(data: string): ParsedCallback {
  const sep = data.indexOf(":");
  const prefix = sep === -1 ? data : data.slice(0, sep);
  const arg = sep === -1 ? "" : data.slice(sep + 1);
  const kind = PREFIX_TO_KIND[prefix];

  if (!kind) {
    return { kind: "noop", arg: "" };
  }

  return { kind, arg };
}

export function buildCallback(kind: CallbackKind, arg = ""): string {
  const prefix = Object.keys(PREFIX_TO_KIND).find(
    (key) => PREFIX_TO_KIND[key] === kind,
  );

  if (!prefix) {
    return "noop";
  }

  return arg === "" ? prefix : `${prefix}:${arg}`;
}
