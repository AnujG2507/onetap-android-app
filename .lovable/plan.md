

# Add Optional Description to Scheduled Reminders

## Overview

This feature adds an optional "description" field to scheduled reminders, allowing users to save their intent, notes, or any additional context alongside the reminder. The description will be visible in the reminder list and can optionally appear in the notification when triggered.

---

## What This Changes

### For Users
- A new "Description" text field appears on the confirmation screen when creating or editing a reminder
- The description is shown in the reminder list below the trigger time
- When the notification appears, users can see their saved intent/notes
- The field is completely optional - reminders work exactly as before if left empty

### Technical Summary
- Add `description?: string` to the ScheduledAction type
- Update the creation and editing flows to include a textarea for description
- Modify the reminder list item to display description when present
- Pass description through to native Android notification

---

## Implementation Details

### 1. Type Definitions

**File: `src/types/scheduledAction.ts`**

Add optional description field to both interfaces:

```typescript
export interface ScheduledAction {
  id: string;
  name: string;
  description?: string;  // NEW: Optional description/intent
  destination: ScheduledActionDestination;
  triggerTime: number;
  recurrence: RecurrenceType;
  enabled: boolean;
  createdAt: number;
  recurrenceAnchor?: RecurrenceAnchor;
}

export interface CreateScheduledActionInput {
  name: string;
  description?: string;  // NEW
  destination: ScheduledActionDestination;
  triggerTime: number;
  recurrence: RecurrenceType;
  recurrenceAnchor?: RecurrenceAnchor;
}
```

### 2. Manager Updates

**File: `src/lib/scheduledActionsManager.ts`**

Update `createScheduledAction` to include description:

```typescript
export function createScheduledAction(input: CreateScheduledActionInput): ScheduledAction {
  const action: ScheduledAction = {
    id: generateId(),
    name: input.name,
    description: input.description,  // NEW
    destination: input.destination,
    triggerTime: input.triggerTime,
    recurrence: input.recurrence,
    enabled: true,
    createdAt: Date.now(),
    recurrenceAnchor: input.recurrenceAnchor,
  };
  // ...
}
```

### 3. Creator Component Updates

**File: `src/components/ScheduledActionCreator.tsx`**

Add description state and input field on the confirmation step:

```typescript
// Add state
const [description, setDescription] = useState('');

// In handleCreate, include description
const input: CreateScheduledActionInput = {
  name: name.trim() || getSuggestedName(destination),
  description: description.trim() || undefined,  // NEW
  destination,
  triggerTime: timing.triggerTime,
  recurrence: timing.recurrence,
  recurrenceAnchor: timing.anchor,
};

// Add Textarea below name input in confirmation step
<div>
  <Label htmlFor="action-description" className="text-sm font-medium mb-2 block">
    Description (optional)
  </Label>
  <Textarea
    id="action-description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    placeholder="Add a note about this reminder..."
    className="rounded-xl text-base resize-none"
    rows={2}
  />
  <p className="text-xs text-muted-foreground mt-2">
    Save your intent or any notes for this reminder.
  </p>
</div>
```

### 4. Editor Component Updates

**File: `src/components/ScheduledActionEditor.tsx`**

Add description state and input field:

```typescript
// Add state
const [description, setDescription] = useState(action.description || '');

// Update resetState
const resetState = useCallback(() => {
  // ...existing resets
  setDescription(action.description || '');
}, [action]);

// In handleSave, include description
const newAction = await createScheduledAction({
  name: name.trim(),
  description: description.trim() || undefined,  // NEW
  destination,
  triggerTime,
  recurrence,
  recurrenceAnchor,
});

// Update hasChanges check
const hasChanges = 
  name !== action.name ||
  description !== (action.description || '') ||  // NEW
  JSON.stringify(destination) !== JSON.stringify(action.destination) ||
  triggerTime !== action.triggerTime ||
  recurrence !== action.recurrence;

// Add Textarea in main editor view after name input
```

### 5. List Item Updates

**File: `src/components/ScheduledActionItem.tsx`**

Display description when present:

```typescript
{/* Content section - after name */}
<div className="flex-1 min-w-0">
  <h4 className="font-medium text-sm truncate">{action.name}</h4>
  {action.description && (
    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
      {action.description}
    </p>
  )}
  <p className={cn(
    "text-xs mt-0.5",
    isExpired ? "text-destructive" : "text-muted-foreground"
  )}>
    {isExpired ? t('scheduledActionItem.expired') + ' — ' : ''}{formatTriggerTime(action.triggerTime)}
  </p>
  {/* ...recurrence info */}
</div>
```

### 6. Native Bridge Updates

**File: `src/plugins/ShortcutPlugin.ts`**

Add description to scheduleAction interface:

```typescript
scheduleAction(options: {
  id: string;
  name: string;
  description?: string;  // NEW
  destinationType: 'file' | 'url' | 'contact';
  destinationData: string;
  triggerTime: number;
  recurrence: 'once' | 'daily' | 'weekly' | 'yearly';
}): Promise<{ success: boolean; error?: string }>;
```

### 7. Hook Updates

**File: `src/hooks/useScheduledActions.ts`**

Pass description through to native plugin:

```typescript
const result = await ShortcutPlugin.scheduleAction({
  id: action.id,
  name: action.name,
  description: input.description,  // NEW
  destinationType: input.destination.type,
  destinationData,
  triggerTime: input.triggerTime,
  recurrence: input.recurrence,
});
```

### 8. Android Native Updates

**File: `native/android/.../ScheduledActionReceiver.java`**

Add description extra constant and pass to notification:

```java
public static final String EXTRA_DESCRIPTION = "action_description";

// In onReceive:
String description = intent.getStringExtra(EXTRA_DESCRIPTION);
NotificationHelper.showActionNotification(
  context, actionId, actionName, description,
  destinationType, destinationData
);

// Update createActionIntent to include description
intent.putExtra(EXTRA_DESCRIPTION, description);
```

**File: `native/android/.../NotificationHelper.java`**

Update notification to show description:

```java
public static void showActionNotification(
  Context context, String actionId, String actionName, 
  String description,  // NEW
  String destinationType, String destinationData
) {
  // Use description as content text if present
  String contentText = (description != null && !description.isEmpty()) 
    ? description 
    : getContentText(destinationType);
  
  NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
    .setContentTitle(actionName)
    .setContentText(contentText)  // Shows description or default
    // ...
}
```

**File: `native/android/.../ShortcutPlugin.java`**

Pass description from JS to native scheduling:

```java
@PluginMethod
public void scheduleAction(PluginCall call) {
  String description = call.getString("description", "");
  // Include in intent and storage
}
```

### 9. Translation Updates

**File: `src/i18n/locales/en.json`**

Add new translation keys:

```json
{
  "scheduledActions": {
    "descriptionLabel": "Description (optional)",
    "descriptionPlaceholder": "Add a note about this reminder...",
    "descriptionHint": "Save your intent or any notes for this reminder."
  }
}
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/types/scheduledAction.ts` | Add `description?: string` to types |
| `src/lib/scheduledActionsManager.ts` | Include description in create function |
| `src/components/ScheduledActionCreator.tsx` | Add description state and textarea |
| `src/components/ScheduledActionEditor.tsx` | Add description state, textarea, and change detection |
| `src/components/ScheduledActionItem.tsx` | Display description in list item |
| `src/plugins/ShortcutPlugin.ts` | Add description to interface |
| `src/hooks/useScheduledActions.ts` | Pass description to native plugin |
| `native/android/.../ScheduledActionReceiver.java` | Handle description extra |
| `native/android/.../NotificationHelper.java` | Show description in notification |
| `native/android/.../ShortcutPlugin.java` | Accept description from JS |
| `src/i18n/locales/en.json` | Add translation keys |

---

## Backward Compatibility

- Existing reminders without description will continue to work (field is optional)
- localStorage data is automatically compatible since new field is optional
- Notifications fall back to default text if no description is provided

