import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, X, Plus, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Capacitor } from '@capacitor/core';
import ShortcutPlugin from '@/plugins/ShortcutPlugin';
import { MAX_SLIDESHOW_IMAGES } from '@/types/shortcut';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

interface SlideshowImage {
  id: string;
  uri: string;
  thumbnail?: string;
}

interface SlideshowPhotosEditorProps {
  images: SlideshowImage[];
  onChange: (images: SlideshowImage[]) => void;
  maxImages?: number;
}

interface SortableImageProps {
  id: string;
  index: number;
  thumbnail?: string;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function SortableImage({ id, index, thumbnail, onRemove, canRemove }: SortableImageProps) {
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
      <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail.startsWith('data:') || thumbnail.startsWith('blob:') ? thumbnail : `data:image/jpeg;base64,${thumbnail}`}
            alt={`Image ${index + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Image className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      
      {/* Index badge */}
      <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded">
        {index + 1}
      </div>
      
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute bottom-0.5 left-0.5 p-0.5 bg-black/60 rounded cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-2.5 w-2.5 text-white" />
      </div>
      
      {/* Remove button - only show if more than 2 images */}
      {canRemove && (
        <button
          onClick={() => onRemove(id)}
          className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full"
        >
          <X className="h-2.5 w-2.5 text-white" />
        </button>
      )}
    </div>
  );
}

export function SlideshowPhotosEditor({ 
  images, 
  onChange,
  maxImages = MAX_SLIDESHOW_IMAGES 
}: SlideshowPhotosEditorProps) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex(i => i.id === active.id);
      const newIndex = images.findIndex(i => i.id === over.id);
      onChange(arrayMove(images, oldIndex, newIndex));
    }
  }, [images, onChange]);

  const handleRemoveImage = useCallback((id: string) => {
    onChange(images.filter(img => img.id !== id));
  }, [images, onChange]);

  const handleAddPhotos = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    setIsAdding(true);
    try {
      const remainingSlots = maxImages - images.length;
      if (remainingSlots <= 0) return;

      const result = await ShortcutPlugin.pickMultipleFiles({
        mimeTypes: ['image/*'],
        maxCount: remainingSlots,
      });

      if (result.success && result.files && result.files.length > 0) {
        const newImages: SlideshowImage[] = result.files.map((file, i) => ({
          id: `new-${Date.now()}-${i}`,
          uri: file.uri,
          thumbnail: file.thumbnail,
        }));
        onChange([...images, ...newImages]);
      }
    } catch (error) {
      console.error('[SlideshowPhotosEditor] Error adding photos:', error);
    } finally {
      setIsAdding(false);
    }
  }, [images, onChange, maxImages]);

  const canRemove = images.length > 2;
  const canAdd = images.length < maxImages;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">
          {t('slideshow.photos', 'Photos')} ({images.length}/{maxImages})
        </label>
        {canAdd && Capacitor.isNativePlatform() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddPhotos}
            disabled={isAdding}
            className="h-7 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('slideshow.addMore', 'Add')}
          </Button>
        )}
      </div>
      
      <ScrollArea className="w-full whitespace-nowrap">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={images.map(img => img.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 pb-2">
              {images.map((image, index) => (
                <SortableImage
                  key={image.id}
                  id={image.id}
                  index={index}
                  thumbnail={image.thumbnail}
                  onRemove={handleRemoveImage}
                  canRemove={canRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      
      {images.length < 2 && (
        <p className="text-xs text-destructive">
          {t('slideshow.minPhotos', 'Need at least 2 photos')}
        </p>
      )}
    </div>
  );
}
