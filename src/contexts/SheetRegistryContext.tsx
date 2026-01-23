import React, { createContext, useContext, useRef, useCallback, useMemo } from 'react';

interface SheetEntry {
  id: string;
  closeCallback: () => void;
  priority: number; // Higher priority = closes first
}

interface SheetRegistryContextType {
  registerSheet: (id: string, closeCallback: () => void, priority?: number) => void;
  unregisterSheet: (id: string) => void;
  closeTopSheet: () => boolean;
  hasOpenSheets: () => boolean;
}

const SheetRegistryContext = createContext<SheetRegistryContextType | null>(null);

export function SheetRegistryProvider({ children }: { children: React.ReactNode }) {
  // Use ref to avoid re-renders when sheets register/unregister
  const sheetsRef = useRef<Map<string, SheetEntry>>(new Map());
  const orderRef = useRef<string[]>([]); // Track registration order

  const registerSheet = useCallback((id: string, closeCallback: () => void, priority: number = 0) => {
    // Remove from order if already exists (re-registration)
    const existingIndex = orderRef.current.indexOf(id);
    if (existingIndex !== -1) {
      orderRef.current.splice(existingIndex, 1);
    }
    
    sheetsRef.current.set(id, { id, closeCallback, priority });
    orderRef.current.push(id); // Add to end (most recent)
    
    console.log('[SheetRegistry] Registered:', id, 'Total open:', sheetsRef.current.size);
  }, []);

  const unregisterSheet = useCallback((id: string) => {
    sheetsRef.current.delete(id);
    const index = orderRef.current.indexOf(id);
    if (index !== -1) {
      orderRef.current.splice(index, 1);
    }
    
    console.log('[SheetRegistry] Unregistered:', id, 'Total open:', sheetsRef.current.size);
  }, []);

  const closeTopSheet = useCallback(() => {
    if (sheetsRef.current.size === 0) {
      console.log('[SheetRegistry] No sheets to close');
      return false;
    }

    // Get all entries and sort by priority (highest first), then by order (most recent first)
    const entries = Array.from(sheetsRef.current.values());
    entries.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Same priority, use registration order (most recent first)
      return orderRef.current.indexOf(b.id) - orderRef.current.indexOf(a.id);
    });

    const topSheet = entries[0];
    console.log('[SheetRegistry] Closing top sheet:', topSheet.id);
    
    topSheet.closeCallback();
    return true;
  }, []);

  const hasOpenSheets = useCallback(() => {
    return sheetsRef.current.size > 0;
  }, []);

  const value = useMemo(() => ({
    registerSheet,
    unregisterSheet,
    closeTopSheet,
    hasOpenSheets,
  }), [registerSheet, unregisterSheet, closeTopSheet, hasOpenSheets]);

  return (
    <SheetRegistryContext.Provider value={value}>
      {children}
    </SheetRegistryContext.Provider>
  );
}

export function useSheetRegistry() {
  const context = useContext(SheetRegistryContext);
  if (!context) {
    throw new Error('useSheetRegistry must be used within a SheetRegistryProvider');
  }
  return context;
}
