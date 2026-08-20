import { Link } from '@tanstack/react-router'

const navLinkClass =
  'block rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 [&.active]:bg-neutral-900 [&.active]:text-white'

export function Sidebar() {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
        Dashboard
      </Link>
    </nav>
  )
}
