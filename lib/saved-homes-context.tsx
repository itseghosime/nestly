'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { PROPERTIES } from './fixtures/properties';
import { Property } from './types';

interface SavedHomesContextType {
  savedIds: string[];
  savedProperties: Property[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  removeSave: (id: string) => void;
  clearAll: () => void;
  savedCount: number;
}

const SavedHomesContext = createContext<SavedHomesContextType | undefined>(undefined);

const STORAGE_KEY = 'nestly_saved_homes_v2';

export function SavedHomesProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render both start empty; storage is loaded after hydration.
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let ids: string[] = [];
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) ids = [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    } catch {
      // Missing, invalid or unavailable storage starts with no saved homes.
    }
    queueMicrotask(() => {
      if (!active) return;
      setSavedIds(ids);
      setStorageLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageLoaded) return; // Never overwrite an existing list before reading it.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds));
    } catch {
      // Saving still works in memory when browser storage is unavailable.
    }
  }, [savedIds, storageLoaded]);

  const isSaved = (id: string) => savedIds.includes(id);

  const toggleSave = (id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const removeSave = (id: string) => {
    setSavedIds((prev) => prev.filter((item) => item !== id));
  };

  const clearAll = () => {
    setSavedIds([]);
  };

  const savedProperties = PROPERTIES.filter((p) => savedIds.includes(p.id));

  return (
    <SavedHomesContext.Provider
      value={{
        savedIds,
        savedProperties,
        isSaved,
        toggleSave,
        removeSave,
        clearAll,
        savedCount: savedIds.length,
      }}
    >
      {children}
    </SavedHomesContext.Provider>
  );
}

export function useSavedHomes() {
  const context = useContext(SavedHomesContext);
  if (!context) {
    throw new Error('useSavedHomes must be used within a SavedHomesProvider');
  }
  return context;
}
