import type { ReactElement, SVGProps } from "react";
import type { SectionId } from "@/sections";

const ICON_PROPS: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const SECTION_ICONS: Record<SectionId, () => ReactElement> = {
  subjects: () => (
    <svg {...ICON_PROPS}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  ),
  "add-knowledge": () => (
    <svg {...ICON_PROPS}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  review: () => (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  triage: () => (
    <svg {...ICON_PROPS}>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  ),
  settings: () => (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  ),
};
