import { cn } from '@/lib/utils';

interface TruncatedTextProps {
  text: string;
  className?: string;
}

export function TruncatedText({ text, className }: TruncatedTextProps) {
  return (
    <span className={cn("truncate block min-w-0", className)}>
      {text}
    </span>
  );
}
