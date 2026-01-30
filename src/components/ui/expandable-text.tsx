import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandableTextProps {
  text: string;
  charLimit?: number;
  className?: string;
  textClassName?: string;
  expandedClassName?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function ExpandableText({
  text,
  charLimit = 30,
  className,
  textClassName,
  expandedClassName = "break-all whitespace-normal",
  disabled = false,
  onClick,
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = text.length > charLimit;

  const handleToggle = (e: React.MouseEvent) => {
    if (disabled || !shouldTruncate) return;
    e.stopPropagation();
    setIsExpanded(!isExpanded);
    onClick?.();
  };

  // Short text - no chevron needed
  if (!shouldTruncate) {
    return (
      <span className={cn("truncate block", textClassName, className)}>
        {text}
      </span>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-start gap-1 min-w-0 overflow-hidden",
        !disabled && "cursor-pointer",
        className
      )}
      onClick={handleToggle}
    >
      <span className={cn(
        "flex-1 min-w-0",
        textClassName,
        isExpanded ? expandedClassName : "truncate"
      )}>
        {text}
      </span>
      <motion.div
        animate={{ rotate: isExpanded ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="shrink-0"
      >
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
      </motion.div>
    </div>
  );
}
