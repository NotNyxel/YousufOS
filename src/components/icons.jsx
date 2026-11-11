export function MosqueIcon({ className = "", strokeWidth = 1.7 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2.5 21h19" />
      <path d="M4 21V10h2v11" />
      <path d="M5 10V7.5" />
      <path d="M18 21V10h2v11" />
      <path d="M19 10V7.5" />
      <path d="M8 21v-6.5" />
      <path d="M16 21v-6.5" />
      <path d="M8 14.5c0-2.6 4-3.6 4-6.5 0 2.9 4 3.9 4 6.5" />
      <path d="M12 8V5.5" />
      <path d="M11 21v-2.6a1 1 0 0 1 2 0V21" />
    </svg>
  );
}

export function LogoMark({ className = "" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M38 12a20 20 0 1 0 13.4 34.9A16.5 16.5 0 1 1 38 12z" fill="currentColor" />
      <path d="m46 18 2.1 5.1 5.4.4-4.1 3.5 1.3 5.3L46 29.4l-4.7 2.9 1.3-5.3-4.1-3.5 5.4-.4z" fill="currentColor" />
    </svg>
  );
}
