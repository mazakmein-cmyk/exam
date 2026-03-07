import { useState, useRef, useEffect } from "react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
}

const OptimizedImage = ({ src, alt, className = "" }: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state when src changes (e.g. navigating between questions)
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);

    // If the image is already cached by the browser, onLoad fires synchronously
    // before React attaches the handler. Check complete flag as a fallback.
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [src]);

  if (hasError) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground bg-muted rounded-md">
        Failed to load image
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Skeleton placeholder – shown while image is loading */}
      {!isLoaded && (
        <div
          className="img-skeleton rounded-md"
          style={{ width: "100%", height: "200px" }}
        />
      )}

      {/* Actual image – hidden visually until loaded, then fades in */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${className} ${isLoaded ? "img-fade-in" : "opacity-0 absolute top-0 left-0"}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        loading="eager"
      />
    </div>
  );
};

export default OptimizedImage;
