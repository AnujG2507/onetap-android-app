import * as React from "react";

import { cn } from "@/lib/utils";

type HorizontalScrollTextProps = {
  className?: string;
  children: React.ReactNode;
  /** Optional accessible label if children isn't plain text */
  ariaLabel?: string;
};

/**
 * Bounded single-line text that can be horizontally scrolled to reveal overflow.
 * This avoids layout overflow while still allowing users to read long titles.
 */
export function HorizontalScrollText({
  className,
  children,
  ariaLabel,
}: HorizontalScrollTextProps) {
  return (
    <span
      aria-label={ariaLabel}
      className={cn(
        "block max-w-full min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[text-overflow:ellipsis]",
        className
      )}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <span className="inline-block pr-2">{children}</span>
    </span>
  );
}
