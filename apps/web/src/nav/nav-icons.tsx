import {
  BarChart3,
  BookOpen,
  MessagesSquare,
  GraduationCap,
  Inbox,
  Layers,
  Library,
  LayoutDashboard,
  MessageSquare,
  Settings,
} from 'lucide-react'

const ICON_CLASS = 'mr-2 size-4 shrink-0'

export function OverviewIcon() {
  return <LayoutDashboard aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function KnowledgeBrowserIcon() {
  return <BookOpen aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function SubjectsIcon() {
  return <Layers aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function TriageIcon() {
  return <Inbox aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function InboxDeckIcon() {
  return <MessageSquare aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function ReviewIcon() {
  return <GraduationCap aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function StatisticsIcon() {
  return <BarChart3 aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function AdminSettingsIcon() {
  return <Settings aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function ChatQueueIcon() {
  return <MessagesSquare aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}

export function SourcesIcon() {
  return <Library aria-hidden="true" className={ICON_CLASS} data-nav-icon="" />
}
