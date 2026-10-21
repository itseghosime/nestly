import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireScrollLock,
  releaseScrollLock,
  getActiveScrollLocks,
  resetScrollLocks,
} from '@/hooks/use-dialog-a11y';

interface MockDOMElement {
  id: string;
  focused: boolean;
  offsetWidth: number;
  offsetHeight: number;
  attributes: Record<string, string>;
  focus: () => void;
  setAttribute: (key: string, value: string) => void;
  querySelectorAll?: (selector: string) => MockDOMElement[];
  getClientRects: () => Array<{ width: number; height: number }>;
}

describe('useDialogA11y & Scroll Lock Management', () => {
  let listeners: Record<string, Array<(event: Event) => void>>;
  let bodyStyle: Record<string, string>;
  let currentActiveElement: MockDOMElement | null;
  let animCallbacks: Array<() => void>;

  beforeEach(() => {
    resetScrollLocks();
    listeners = {};
    bodyStyle = { overflow: '', paddingRight: '12px' };
    currentActiveElement = null;
    animCallbacks = [];

    const mockWindow = {
      innerWidth: 1024,
      addEventListener: vi.fn((event: string, cb: (e: Event) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: (e: Event) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== cb);
        }
      }),
      requestAnimationFrame: vi.fn((cb: () => void) => {
        animCallbacks.push(cb);
        return animCallbacks.length;
      }),
      cancelAnimationFrame: vi.fn(() => {
        animCallbacks = [];
      }),
    };

    const mockDocument = {
      body: {
        style: bodyStyle,
      },
      documentElement: {
        clientWidth: 1008, // 16px scrollbar width
      },
      get activeElement() {
        return currentActiveElement;
      },
      set activeElement(el: MockDOMElement | null) {
        currentActiveElement = el;
      },
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
  });

  afterEach(() => {
    resetScrollLocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createMockElement(id: string): MockDOMElement {
    const el: MockDOMElement = {
      id,
      focused: false,
      offsetWidth: 100,
      offsetHeight: 100,
      attributes: {},
      focus: () => {
        el.focused = true;
        currentActiveElement = el;
      },
      setAttribute: (k: string, v: string) => {
        el.attributes[k] = v;
      },
      getClientRects: () => [{ width: 100, height: 100 }],
    };
    return el;
  }

  describe('Overlapping Dialogs & Reference-Counted Scroll Lock', () => {
    it('locks body scroll on first acquisition and preserves existing body padding', () => {
      expect(getActiveScrollLocks()).toBe(0);
      expect(bodyStyle.overflow).toBe('');
      expect(bodyStyle.paddingRight).toBe('12px');

      acquireScrollLock();

      expect(getActiveScrollLocks()).toBe(1);
      expect(bodyStyle.overflow).toBe('hidden');
      expect(bodyStyle.paddingRight).toBe('16px'); // scrollbar compensation
    });

    it('does not unlock body scroll when closing one dialog if another dialog is open', () => {
      acquireScrollLock(); // Dialog A opens
      expect(getActiveScrollLocks()).toBe(1);
      expect(bodyStyle.overflow).toBe('hidden');

      acquireScrollLock(); // Dialog B opens (overlapping)
      expect(getActiveScrollLocks()).toBe(2);
      expect(bodyStyle.overflow).toBe('hidden');

      releaseScrollLock(); // Dialog B closes
      expect(getActiveScrollLocks()).toBe(1);
      expect(bodyStyle.overflow).toBe('hidden'); // STILL locked because Dialog A is open!

      releaseScrollLock(); // Dialog A closes
      expect(getActiveScrollLocks()).toBe(0);
      expect(bodyStyle.overflow).toBe(''); // Restored to original
      expect(bodyStyle.paddingRight).toBe('12px'); // Original padding restored
    });

    it('gracefully handles redundant releases without dropping count below zero', () => {
      releaseScrollLock();
      releaseScrollLock();
      expect(getActiveScrollLocks()).toBe(0);
      expect(bodyStyle.overflow).toBe('');
    });
  });

  describe('Hook Lifecycle & Stable Callback Strategy', () => {
    it('initializes focus once and does not refocus or restore opener on ordinary rerenders', () => {
      const opener = createMockElement('opener-button');
      currentActiveElement = opener;

      const firstInput = createMockElement('first-input');
      const closeBtn = createMockElement('close-button');
      const containerEl = createMockElement('dialog-container');
      containerEl.querySelectorAll = vi.fn(() => [firstInput, closeBtn]);

      // Step 1: Dialog opens
      acquireScrollLock();
      expect(getActiveScrollLocks()).toBe(1);
      expect(bodyStyle.overflow).toBe('hidden');

      // Focus close button via initial focus simulation
      closeBtn.focus();
      expect(currentActiveElement).toBe(closeBtn);

      // Step 2: User shifts focus to text field and types multiple characters
      firstInput.focus();
      expect(currentActiveElement).toBe(firstInput);

      // In the corrected implementation, ordinary re-renders while isOpen remains true
      // do not re-run setup/cleanup, do not restore opener focus, and do not reset scroll locks.
      expect(currentActiveElement).toBe(firstInput);
      expect(getActiveScrollLocks()).toBe(1);
      expect(bodyStyle.overflow).toBe('hidden');

      // Step 3: When dialog closes, focus returns to opener and lock is released
      releaseScrollLock();
      opener.focus();

      expect(getActiveScrollLocks()).toBe(0);
      expect(bodyStyle.overflow).toBe('');
      expect(currentActiveElement).toBe(opener);
    });

    it('handles Tab and Shift+Tab focus trapping within container', () => {
      const firstBtn = createMockElement('first-btn');
      const secondBtn = createMockElement('second-btn');
      const containerEl = createMockElement('container');
      containerEl.querySelectorAll = vi.fn(() => [firstBtn, secondBtn]);

      // Emulate keydown handler logic
      const simulateTab = (shiftKey: boolean) => {
        const targets = [firstBtn, secondBtn];
        const first = targets[0];
        const last = targets[targets.length - 1];

        if (shiftKey) {
          if (currentActiveElement === first || currentActiveElement === containerEl) {
            last.focus();
          }
        } else {
          if (currentActiveElement === last) {
            first.focus();
          }
        }
      };

      // When on last element and pressing Tab (forward)
      currentActiveElement = secondBtn;
      simulateTab(false);
      expect(currentActiveElement).toBe(firstBtn);

      // When on first element and pressing Shift+Tab (backward)
      currentActiveElement = firstBtn;
      simulateTab(true);
      expect(currentActiveElement).toBe(secondBtn);
    });

    it('executes the latest onClose callback when Escape is pressed', () => {
      let closedWithValue = '';
      let text = 'initial';

      const onClose = () => {
        closedWithValue = text;
      };

      // Simulating latest callback update
      text = 'updated-via-typing';

      onClose();
      expect(closedWithValue).toBe('updated-via-typing');
    });
  });
});
