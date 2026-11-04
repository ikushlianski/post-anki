import { SECTION_ICONS } from "@/section-icons";
import { SECTIONS, type SectionId } from "@/sections";

type SidebarProps = {
  active: SectionId;
  onSelect: (id: SectionId) => void;
};

const ITEM_CLASS =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border-0 bg-transparent px-3 text-body font-medium text-text shadow-none hover:bg-hover hover:filter-none aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text";

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <nav
      className="flex min-h-0 flex-col gap-1 border-r border-border bg-sidebar px-3 pt-4 pb-3"
      aria-label="Sections"
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const current = section.id === active;

          return (
            <li key={section.id}>
              <button
                type="button"
                className={ITEM_CLASS}
                aria-current={current ? "page" : undefined}
                onClick={() => onSelect(section.id)}
              >
                <span className="flex min-w-0 items-center gap-2.5 [&_svg]:shrink-0">
                  <Icon />
                  {section.title}
                </span>
                <kbd className="text-caption font-normal text-muted opacity-100">⌘{section.shortcutKey}</kbd>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
