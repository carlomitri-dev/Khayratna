import { useEffect, useCallback, useRef } from 'react';

// Check if an input/textarea/select is focused
const isInputFocused = () => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
};

export const useKeyboardShortcuts = (shortcuts) => {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e) => {
    for (const shortcut of shortcutsRef.current) {
      const { key, ctrl, shift, alt, action, allowInInput, preventDefault = true } = shortcut;

      // Skip if input focused and not explicitly allowed
      if (!allowInInput && isInputFocused()) {
        // Exception: Escape always works, Ctrl combos work in inputs
        if (key !== 'Escape' && !ctrl) continue;
      }

      const keyMatch = e.key.toLowerCase() === key.toLowerCase() || e.code === key;
      const ctrlMatch = ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shift ? e.shiftKey : !e.shiftKey;
      const altMatch = alt ? e.altKey : !e.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        if (preventDefault) e.preventDefault();
        action(e);
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

// Sequence shortcuts like "g then d" for navigation
export const useSequenceShortcut = (onSequence) => {
  const bufferRef = useRef('');
  const timerRef = useRef(null);
  const callbackRef = useRef(onSequence);
  callbackRef.current = onSequence;

  useEffect(() => {
    const handler = (e) => {
      if (isInputFocused()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      clearTimeout(timerRef.current);
      bufferRef.current += e.key.toLowerCase();

      // Reset buffer after 800ms of no input
      timerRef.current = setTimeout(() => { bufferRef.current = ''; }, 800);

      callbackRef.current(bufferRef.current, () => { bufferRef.current = ''; });
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      clearTimeout(timerRef.current);
    };
  }, []);
};
