import { useId } from 'react';

/** The app's logo: the same speech bubble as public/favicon.svg. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const gradient = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1fb6a4" />
          <stop offset="1" stopColor="#006670" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <path
        fill="#fff"
        d="M21 15h22a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8H32l-10 8v-8h-1a8 8 0 0 1-8-8V23a8 8 0 0 1 8-8z"
      />
      <g fill="#007475">
        <circle cx="24" cy="29.5" r="3" />
        <circle cx="32" cy="29.5" r="3" />
        <circle cx="40" cy="29.5" r="3" />
      </g>
    </svg>
  );
}
