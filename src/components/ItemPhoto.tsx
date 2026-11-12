import { useState, type ReactNode } from "react";

/** Lazy `<img>` that shows `fallback` once `src` fails; a new `src` tries again. */
export function ItemPhoto({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <>{fallback}</>;
  return (
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
  );
}
