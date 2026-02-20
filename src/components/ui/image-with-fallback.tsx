import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { isValidImageSource, normalizeBase64 } from '@/lib/imageUtils';

interface ImageWithFallbackProps {
  /** Priority-ordered list of image sources to try */
  sources: (string | undefined | null)[];
  /** What to render when all sources fail */
  fallback: ReactNode;
  /** Alt text for the image */
  alt?: string;
  /** Additional CSS classes */
  className?: string;
  /** CSS classes for the container */
  containerClassName?: string;
  /** Callback when an image loads successfully */
  onLoadSuccess?: (src: string) => void;
  /** Callback when all sources have failed */
  onAllFailed?: () => void;
  /** Whether to show a loading skeleton */
  showSkeleton?: boolean;
  /** Referrer policy for the image */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

/**
 * A bulletproof image component that:
 * - Tries multiple sources in priority order
 * - Validates sources before attempting to load
 * - Shows a loading skeleton during validation
 * - Provides graceful fallback when all sources fail
 * - Resets state when sources change
 */
export function ImageWithFallback({
  sources,
  fallback,
  alt = '',
  className,
  containerClassName,
  onLoadSuccess,
  onAllFailed,
  showSkeleton = true,
  referrerPolicy,
}: ImageWithFallbackProps) {
  // Filter and normalize sources
  const validSources = useMemo(() => {
    return sources
      .map(src => {
        if (!src) return null;
        // Normalize base64 if needed
        if (!src.startsWith('data:') && !src.startsWith('http') && 
            !src.startsWith('blob:') && !src.startsWith('content://') && 
            !src.startsWith('file://')) {
          return normalizeBase64(src);
        }
        return src;
      })
      .filter((src): src is string => isValidImageSource(src));
  }, [sources]);

  // Track current source index and loading state
  // base64 data: URLs are already in memory and load synchronously — skip the loading state
  const firstSourceIsBase64 = validSources[0]?.startsWith('data:') ?? false;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(!firstSourceIsBase64);
  const [hasSucceeded, setHasSucceeded] = useState(firstSourceIsBase64);

  // Create a stable key from sources to detect changes
  const sourcesKey = validSources.join('|');

  // Reset state when sources change
  useEffect(() => {
    const isBase64 = validSources[0]?.startsWith('data:') ?? false;
    setCurrentIndex(0);
    setIsLoading(!isBase64);
    setHasSucceeded(isBase64);
  }, [sourcesKey]);

  // Current source to try
  const currentSource = validSources[currentIndex];

  // Handle successful load
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasSucceeded(true);
    if (currentSource) {
      onLoadSuccess?.(currentSource);
    }
  }, [currentSource, onLoadSuccess]);

  // Handle load error - try next source
  const handleError = useCallback(() => {
    if (currentIndex < validSources.length - 1) {
      // Try next source
      setCurrentIndex(prev => prev + 1);
    } else {
      // All sources exhausted
      setIsLoading(false);
      setHasSucceeded(false);
      onAllFailed?.();
    }
  }, [currentIndex, validSources.length, onAllFailed]);

  // If no valid sources, show fallback immediately
  if (validSources.length === 0) {
    return <>{fallback}</>;
  }

  // If all sources failed, show fallback
  if (!isLoading && !hasSucceeded) {
    return <>{fallback}</>;
  }

  return (
    <div className={cn('relative', containerClassName)}>
      {/* Loading skeleton */}
      {showSkeleton && isLoading && (
        <Skeleton className={cn('absolute inset-0', className)} />
      )}
      
      {/* Image - always rendered but may be invisible while loading */}
      {currentSource && (
        <img
          key={currentSource} // Force re-render on source change
          src={currentSource}
          alt={alt}
          className={cn(
            className,
            isLoading && 'opacity-0'
          )}
          onLoad={handleLoad}
          onError={handleError}
          referrerPolicy={referrerPolicy}
        />
      )}
    </div>
  );
}
