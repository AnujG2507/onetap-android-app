import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Play, Pause, GripVertical, X, Image, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPicker } from '@/components/IconPicker';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { MultiFileSource } from '@/types/shortcut';
import type { ShortcutIcon } from '@/types/shortcut';
import { generateGridIcon, generateCoverIcon } from '@/lib/slideshowIconGenerator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SlideshowCustomizerProps {
  source: MultiFileSource;
  onConfirm: (
    images: Array<{ uri: string; thumbnail?: string }>,
    name: string,
    icon: ShortcutIcon,
    autoAdvanceInterval?: number
  ) => void;
  onBack: () => void;
}

interface SortableImageProps {
  id: string;
  index: number;
  thumbnail?: string;
  onRemove: (id: string) => void;
}

function SortableImage({ id, index, thumbnail, onRemove }: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex-shrink-0 rounded-lg overflow-hidden ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail.startsWith('data:') || thumbnail.startsWith('blob:') ? thumbnail : `data:image/jpeg;base64,${thumbnail}`}
            alt={`Image ${index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Image className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      
      {/* Index badge */}
      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
        {index + 1}
      </div>
      
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute bottom-1 left-1 p-1 bg-black/60 rounded cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3 text-white" />
      </div>
      
      {/* Remove button */}
      <button
        onClick={() => onRemove(id)}
        className="absolute top-1 right-1 p-1 bg-black/60 rounded-full"
      >
        <X className="h-3 w-3 text-white" />
      </button>
    </div>
  );
}

const AUTO_ADVANCE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5s' },
];

export function SlideshowCustomizer({ source, onConfirm, onBack }: SlideshowCustomizerProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(`${source.files.length} Photos`);
  const [files, setFiles] = useState(source.files.map((f, i) => ({ ...f, id: `img-${i}` })));
  const [autoAdvance, setAutoAdvance] = useState(0);
  const [iconType, setIconType] = useState<'grid' | 'cover' | 'emoji' | 'text'>('grid');
  const [customIcon, setCustomIcon] = useState<ShortcutIcon | null>(null);
  const [generatedGridIcon, setGeneratedGridIcon] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Generate grid icon on mount and when files change
  useEffect(() => {
    async function generateIcon() {
      if (files.length > 0) {
        const thumbnails = files
          .slice(0, 4)
          .map(f => f.thumbnail)
          .filter(Boolean) as string[];
        
        if (thumbnails.length > 0) {
          const gridIcon = await generateGridIcon(thumbnails);
          setGeneratedGridIcon(gridIcon);
        }
      }
    }
    generateIcon();
  }, [files]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleSubmit = async () => {
    if (files.length < 2 || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // Determine final icon
      let finalIcon: ShortcutIcon;
      
      if (iconType === 'grid' && generatedGridIcon) {
        finalIcon = { type: 'thumbnail', value: generatedGridIcon };
      } else if (iconType === 'cover' && files[0]?.thumbnail) {
        const coverIcon = await generateCoverIcon(files[0].thumbnail);
        finalIcon = { type: 'thumbnail', value: coverIcon };
      } else if (customIcon) {
        finalIcon = customIcon;
      } else if (generatedGridIcon) {
        finalIcon = { type: 'thumbnail', value: generatedGridIcon };
      } else {
        finalIcon = { type: 'emoji', value: '🖼️' };
      }

      onConfirm(
        files.map(f => ({ uri: f.uri, thumbnail: f.thumbnail })),
        name.trim() || `${files.length} Photos`,
        finalIcon,
        autoAdvance
      );
    } catch (error) {
      console.error('[SlideshowCustomizer] Error creating slideshow:', error);
      setIsSubmitting(false);
    }
  };

  const iconPreview = useMemo(() => {
    if (iconType === 'grid' && generatedGridIcon) {
      return generatedGridIcon;
    }
    if (iconType === 'cover' && files[0]?.thumbnail) {
      return files[0].thumbnail;
    }
    return null;
  }, [iconType, generatedGridIcon, files]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="ps-5 pe-5 pt-header-safe pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Layers className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              {t('slideshow.customize', 'Customize Slideshow')}
            </h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        {/* Photo count badge */}
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
            {files.length} {files.length === 1 ? 'photo' : 'photos'}
          </div>
          {files.length < 2 && (
            <span className="text-destructive text-sm">
              {t('slideshow.minPhotos', 'Need at least 2 photos')}
            </span>
          )}
        </div>

        {/* Reorderable thumbnail strip */}
        <div>
          <ScrollArea className="w-full whitespace-nowrap">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={files.map(f => f.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-3 pb-4">
                  {files.map((file, index) => (
                    <SortableImage
                      key={file.id}
                      id={file.id}
                      index={index}
                      thumbnail={file.thumbnail}
                      onRemove={handleRemoveImage}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Name input */}
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            {t('slideshow.name', 'Slideshow name')}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${files.length} Photos`}
            className="text-lg"
          />
        </div>

        {/* Icon type selection */}
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            {t('slideshow.iconStyle', 'Icon style')}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setIconType('grid')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                iconType === 'grid' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border bg-background'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {generatedGridIcon ? (
                  <img src={generatedGridIcon} alt="Grid" className="w-12 h-12 rounded" />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded grid grid-cols-2 gap-0.5 p-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="bg-muted-foreground/30 rounded-sm" />
                    ))}
                  </div>
                )}
                <span className="text-xs">{t('slideshow.gridIcon', 'Grid')}</span>
              </div>
            </button>
            <button
              onClick={() => setIconType('cover')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                iconType === 'cover' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border bg-background'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {files[0]?.thumbnail ? (
                  <img 
                    src={files[0].thumbnail.startsWith('data:') || files[0].thumbnail.startsWith('blob:') 
                      ? files[0].thumbnail 
                      : `data:image/jpeg;base64,${files[0].thumbnail}`
                    } 
                    alt="Cover" 
                    className="w-12 h-12 rounded object-cover" 
                  />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <Image className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <span className="text-xs">{t('slideshow.coverIcon', 'Cover')}</span>
              </div>
            </button>
            <button
              onClick={() => setIconType('emoji')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                iconType === 'emoji' 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border bg-background'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">🖼️</span>
                <span className="text-xs">{t('slideshow.emojiIcon', 'Emoji')}</span>
              </div>
            </button>
          </div>
        </div>

        {/* Custom icon picker when emoji/text selected */}
        {(iconType === 'emoji' || iconType === 'text') && (
          <IconPicker
            selectedIcon={customIcon || { type: 'emoji', value: '🖼️' }}
            onSelect={setCustomIcon}
          />
        )}

        {/* Auto-advance setting */}
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            {t('slideshow.autoAdvance', 'Auto-advance')}
          </label>
          <div className="flex gap-2">
            {AUTO_ADVANCE_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => setAutoAdvance(option.value)}
                className={`flex-1 py-2 px-3 rounded-lg border-2 transition-colors ${
                  autoAdvance === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  {option.value === 0 ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-5 pb-safe bg-gradient-to-t from-background via-background to-transparent">
        <Button
          onClick={handleSubmit}
          disabled={files.length < 2 || isSubmitting}
          className="w-full h-12 text-base"
        >
          <Check className="mr-2 h-5 w-5" />
          {t('slideshow.addToHomeScreen', 'Add to Home Screen')}
        </Button>
      </div>
    </div>
  );
}
