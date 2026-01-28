// Scheduled Action Types
// A Scheduled Action is a time-based trigger that delivers one exact destination

export type ScheduledActionDestinationType = 'file' | 'url' | 'contact';

export interface FileDestination {
  type: 'file';
  uri: string;
  mimeType?: string;
  name: string;
}

export interface UrlDestination {
  type: 'url';
  uri: string;
  name: string;
}

export interface ContactDestination {
  type: 'contact';
  phoneNumber: string;
  contactName: string;
  photoUri?: string;
}

export type ScheduledActionDestination = 
  | FileDestination 
  | UrlDestination 
  | ContactDestination;

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'yearly';

export interface RecurrenceAnchor {
  hour: number;       // 0-23
  minute: number;     // 0-59
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  month?: number;     // 0-11 for yearly
  dayOfMonth?: number; // 1-31 for yearly
}

export interface ScheduledAction {
  id: string;
  name: string;                              // Short, intent-based name
  description?: string;                      // Optional description/intent
  destination: ScheduledActionDestination;
  triggerTime: number;                       // Unix timestamp (ms) for next trigger
  recurrence: RecurrenceType;
  enabled: boolean;
  createdAt: number;
  recurrenceAnchor?: RecurrenceAnchor;       // For computing next trigger of recurring actions
  // Notification tracking
  lastNotificationTime?: number;             // When the notification was shown
  notificationClicked?: boolean;             // Whether user clicked it
}

// Utility type for creating new scheduled actions
export interface CreateScheduledActionInput {
  name: string;
  description?: string;                      // Optional description/intent
  destination: ScheduledActionDestination;
  triggerTime: number;
  recurrence: RecurrenceType;
  recurrenceAnchor?: RecurrenceAnchor;
}
