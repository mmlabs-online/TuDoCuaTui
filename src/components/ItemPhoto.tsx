import { useState, type ReactNode } from "react";
import { usePhotoUrl } from "@/data/usePhotoUrl";

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
  const photo = usePhotoUrl(src, { lazy: true, variant: "thumb" });
  if (failedSrc === src || photo.failed) return <>{fallback}</>;
  if (photo.src === null) return <span className="photo-pending" aria-hidden ref={photo.ref} />;
  return (
    <img
      src={photo.src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      ref={photo.ref}
    />
  );
}
