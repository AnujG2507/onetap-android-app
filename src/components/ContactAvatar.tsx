// ContactAvatar - Displays contact photo with initials fallback
import { cn } from '@/lib/utils';

interface ContactAvatarProps {
  photoUri?: string | null;
  name?: string;
  className?: string;
  iconClassName?: string;
  fallbackIcon?: React.ReactNode;
}

/**
 * Extract initials from a name (max 2 characters)
 * Examples: "John Doe" → "JD", "Alice" → "AL", "María García" → "MG"
 */
export function getInitials(name: string | undefined | null): string {
  if (!name) return '';
  
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  
  if (words.length === 1) {
    // Single word: use first 2 characters
    return words[0].slice(0, 2).toUpperCase();
  }
  
  // Multiple words: first letter of first and last word
  const first = words[0][0] || '';
  const last = words[words.length - 1][0] || '';
  return (first + last).toUpperCase();
}

/**
 * Generate a consistent background color from a name
 * Returns HSL color string
 */
function getColorFromName(name: string | undefined | null): string {
  if (!name) return 'hsl(220, 45%, 88%)';
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate hue from hash (0-360)
  const hue = Math.abs(hash) % 360;
  
  // Use HSL with fixed saturation/lightness for consistent look
  return `hsl(${hue}, 45%, 88%)`;
}

function getTextColorFromName(name: string | undefined | null): string {
  if (!name) return 'hsl(220, 55%, 35%)';
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 35%)`;
}

export function ContactAvatar({ 
  photoUri, 
  name, 
  className,
  iconClassName,
  fallbackIcon 
}: ContactAvatarProps) {
  const initials = getInitials(name);
  
  // If photo available, show it with solid background to hide parent bg
  if (photoUri) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center overflow-hidden bg-muted",
          className
        )}
      >
        <img 
          src={photoUri} 
          alt="" 
          className="h-full w-full object-cover"
          onError={(e) => {
            // If image fails to load, hide it so fallback shows
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }
  
  // If we have initials, show them with colored background
  if (initials) {
    const bgColor = getColorFromName(name);
    const textColor = getTextColorFromName(name);
    
    return (
      <div 
        className={cn(
          "flex items-center justify-center font-semibold select-none",
          className
        )}
        style={{ 
          backgroundColor: bgColor,
          color: textColor,
        }}
      >
        <span className={iconClassName}>{initials}</span>
      </div>
    );
  }
  
  // Fallback to provided icon or nothing
  if (fallbackIcon) {
    return (
      <div className={cn(
        "flex items-center justify-center bg-primary/10 text-primary",
        className
      )}>
        {fallbackIcon}
      </div>
    );
  }
  
  return null;
}
