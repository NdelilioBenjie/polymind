/** Three overlapping minds. The overlaps blend, which is the whole idea. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="pm-logo" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Polymind">
      <circle cx="11.5" cy="12" r="8.5" fill="var(--rose)" />
      <circle cx="20.5" cy="12" r="8.5" fill="var(--azure)" />
      <circle cx="16" cy="20" r="8.5" fill="var(--amber)" />
    </svg>
  );
}
