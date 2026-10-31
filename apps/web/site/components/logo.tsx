// The Henglos IO mark (apps/web/app/public/logo.svg) in the text color, so it
// follows the theme.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 38" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.9622 8.14286C20.6678 3.64568 27.112 0 32.3558 0H34.858L11.997 38H0L17.9622 8.14286Z" />
      <path d="M35.9037 0.678571C36.1292 0.303806 36.6662 0 37.1032 0H47.5177C47.9547 0 48.1262 0.303807 47.9007 0.678572L30.3467 29.8571C27.6412 34.3543 21.197 38 15.9532 38H14.2422C13.8052 38 13.6337 37.6962 13.8592 37.3214L35.9037 0.678571Z" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark className="h-4 w-auto" />
      Henglos IO
    </span>
  );
}
