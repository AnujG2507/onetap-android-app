import { useState, useEffect } from 'react';

/**
 * Hook to detect and react to device orientation changes.
 * Returns whether the device is in landscape or portrait mode.
 */
export function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' 
      ? window.innerWidth > window.innerHeight 
      : false
  );

  useEffect(() => {
    const handleOrientationChange = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Initial check
    handleOrientationChange();
    
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return { isLandscape, isPortrait: !isLandscape };
}
