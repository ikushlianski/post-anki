export function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      data-testid="knowledge-bit-focus-spinner"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  )
}
