import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Folder,
  Briefcase,
  Home,
  Heart,
  Star,
  Bookmark,
  ShoppingBag,
  Music,
  Film,
  Gamepad2,
  BookOpen,
  GraduationCap,
  Plane,
  Car,
  Utensils,
  Coffee,
  Gift,
  Camera,
  Palette,
  Code,
  Wrench,
  Lightbulb,
  Newspaper,
  TrendingUp,
  Users,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

export const FOLDER_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'Folder', Icon: Folder },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Home', Icon: Home },
  { name: 'Heart', Icon: Heart },
  { name: 'Star', Icon: Star },
  { name: 'Bookmark', Icon: Bookmark },
  { name: 'ShoppingBag', Icon: ShoppingBag },
  { name: 'Music', Icon: Music },
  { name: 'Film', Icon: Film },
  { name: 'Gamepad2', Icon: Gamepad2 },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'Plane', Icon: Plane },
  { name: 'Car', Icon: Car },
  { name: 'Utensils', Icon: Utensils },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Gift', Icon: Gift },
  { name: 'Camera', Icon: Camera },
  { name: 'Palette', Icon: Palette },
  { name: 'Code', Icon: Code },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Lightbulb', Icon: Lightbulb },
  { name: 'Newspaper', Icon: Newspaper },
  { name: 'TrendingUp', Icon: TrendingUp },
  { name: 'Users', Icon: Users },
  { name: 'MessageCircle', Icon: MessageCircle },
];

export function getIconByName(iconName: string): LucideIcon {
  const found = FOLDER_ICONS.find(i => i.name === iconName);
  return found?.Icon || Folder;
}

interface FolderIconPickerProps {
  selectedIcon: string;
  onSelectIcon: (iconName: string) => void;
}

export function FolderIconPicker({ selectedIcon, onSelectIcon }: FolderIconPickerProps) {
  return (
    <div className="grid grid-cols-6 landscape:grid-cols-9 gap-2 landscape:gap-1.5">
      {FOLDER_ICONS.map(({ name, Icon }) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            onSelectIcon(name);
            triggerHaptic('light');
          }}
          className={cn(
            "flex items-center justify-center p-2.5 landscape:p-2 rounded-lg transition-all",
            "hover:bg-muted",
            selectedIcon === name
              ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "bg-muted/50 text-muted-foreground"
          )}
        >
          <Icon className="h-5 w-5 landscape:h-4 landscape:w-4" />
        </button>
      ))}
    </div>
  );
}