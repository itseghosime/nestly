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
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['prop-gra-01', 'prop-ugbor-03'];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : ['prop-gra-01', 'prop-ugbor-03'];
    } catch {
      return ['prop-gra-01', 'prop-ugbor-03'];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds));
    } catch {
      // Fallback
    }
  }, [savedIds]);

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
