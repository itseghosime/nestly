import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  useDialogA11y,
  acquireScrollLock,
  releaseScrollLock,
  getActiveScrollLocks,
  resetScrollLocks,
  getActiveDialogStack,
  resetDialogStack,
} from '@/hooks/use-dialog-a11y';

// --- Lightweight DOM Environment for React 19 Client Component Testing ---

class DOMElement extends EventTarget {
  tagName: string;
  nodeName: string;
  nodeType: number;
  childNodes: DOMElement[];
  parentNode: DOMElement | null;
  style: Record<string, string>;
  attributes: Record<string, string>;
  tabIndex: number;
  offsetWidth: number;
  offsetHeight: number;
  clientWidth: number;
  textContent: string;
  ownerDocument: DOMDocument | null;

  get id(): string {
    return this.attributes['id'] || '';
  }
  set id(val: string) {
    this.attributes['id'] = val;
  }

  constructor(tagName = 'div', nodeType = 1) {
    super();
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.tabIndex = -1;
    this.offsetWidth = 100;
    this.offsetHeight = 100;
    this.clientWidth = 100;
    this.textContent = '';
    this.ownerDocument = null;
  }

  appendChild<T extends DOMElement>(child: T): T {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild<T extends DOMElement>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore<T extends DOMElement>(newNode: T, refNode: DOMElement | null): T {
    const idx = refNode ? this.childNodes.indexOf(refNode) : -1;
    if (idx !== -1) {
      newNode.parentNode = this;
      this.childNodes.splice(idx, 0, newNode);
    } else {
      this.appendChild(newNode);
    }
    return newNode;
  }

  setAttribute(k: string, v: string | number) {
    this.attributes[k] = String(v);
  }

  getAttribute(k: string): string | null {
    return this.attributes[k] ?? null;
  }

  removeAttribute(k: string) {
    delete this.attributes[k];
  }

  focus() {
    if (global.document) {
      (global.document as unknown as DOMDocument).activeElement = this;
    }
  }

  getClientRects() {
    return [{ width: 100, height: 100 }];
  }

  querySelectorAll<T extends HTMLElement = HTMLElement>(sel: string): NodeListOf<T> {
    const results: DOMElement[] = [];
    const traverse = (node: DOMElement) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (sel.startsWith('#')) {
            const targetId = sel.slice(1);
            if (child.getAttribute('id') === targetId) {
              results.push(child);
            }
          } else {
            results.push(child);
          }
          traverse(child);
        }
      }
    };
    traverse(this);
    return results as unknown as NodeListOf<T>;
  }
}

class DOMDocument extends DOMElement {
  activeElement: DOMElement | null;
  documentElement: DOMElement;
  body: DOMElement;
  defaultView: DOMWindow | null;

  constructor() {
    super('#document', 9);
    this.activeElement = null;
    this.documentElement = new DOMElement('html');
    this.documentElement.clientWidth = 1008; // 1024 - 1008 = 16px scrollbar
    this.body = new DOMElement('body');
    this.body.style = { overflow: '', paddingRight: '12px' };
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
    this.defaultView = null;
  }

  createElement(tag: string): DOMElement {
    const el = new DOMElement(tag);
    el.ownerDocument = this;
    return el;
  }

  createTextNode(text: string): DOMElement {
    const el = new DOMElement('#text', 3);
    el.textContent = text;
    el.ownerDocument = this;
    return el;
  }
}

class DOMWindow extends EventTarget {
  document: DOMDocument;
  innerWidth: number;
  HTMLIFrameElement: typeof DOMElement;
  rafQueue: Array<() => void>;

  constructor(doc: DOMDocument) {
    super();
    this.document = doc;
    this.innerWidth = 1024;
    this.HTMLIFrameElement = class extends DOMElement {};
    this.rafQueue = [];
  }

  getComputedStyle(el: DOMElement) {
    return {
      paddingRight: el.style.paddingRight || '0px',
    };
  }

  requestAnimationFrame(cb: () => void): number {
    this.rafQueue.push(cb);
    return this.rafQueue.length;
  }

  cancelAnimationFrame() {
    this.rafQueue = [];
  }

  flushRaf() {
    while (this.rafQueue.length > 0) {
      const cb = this.rafQueue.shift();
      cb?.();
    }
  }
}

class CustomKeyboardEvent extends Event {
  key: string;
  shiftKey: boolean;

  constructor(type: string, init: { key?: string; shiftKey?: boolean; bubbles?: boolean; cancelable?: boolean } = {}) {
    super(type, { bubbles: init.bubbles ?? true, cancelable: init.cancelable ?? true });
    this.key = init.key || '';
    this.shiftKey = Boolean(init.shiftKey);
  }
}

// --- Test Suite ---

describe('useDialogA11y Production Corrections', () => {
  let doc: DOMDocument;
  let win: DOMWindow;
  let rootContainer: DOMElement;
  let root: Root | null = null;

  beforeEach(() => {
    resetScrollLocks();
    resetDialogStack();

    doc = new DOMDocument();
    win = new DOMWindow(doc);
    doc.defaultView = win;

    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('Node', DOMElement);
    vi.stubGlobal('Element', DOMElement);
    vi.stubGlobal('HTMLElement', DOMElement);
    vi.stubGlobal('HTMLButtonElement', class extends DOMElement {});
    vi.stubGlobal('HTMLInputElement', class extends DOMElement {});
    vi.stubGlobal('HTMLDivElement', class extends DOMElement {});
    vi.stubGlobal('KeyboardEvent', CustomKeyboardEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => win.requestAnimationFrame(cb));
    vi.stubGlobal('cancelAnimationFrame', () => win.cancelAnimationFrame());

    rootContainer = doc.createElement('div');
    doc.body.appendChild(rootContainer);
    root = createRoot(rootContainer as unknown as HTMLElement);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    resetScrollLocks();
    resetDialogStack();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('1. Scrollbar compensation & exact inline style restoration', () => {
    it('adds scrollbar compensation to existing computed body padding (12px + 16px = 28px) and restores exact original inline style', () => {
      expect(getActiveScrollLocks()).toBe(0);
      expect(doc.body.style.overflow).toBe('');
      expect(doc.body.style.paddingRight).toBe('12px');

      acquireScrollLock();

      expect(getActiveScrollLocks()).toBe(1);
      expect(doc.body.style.overflow).toBe('hidden');
      // 12px computed body padding + 16px scrollbar = 28px
      expect(doc.body.style.paddingRight).toBe('28px');

      releaseScrollLock();

      expect(getActiveScrollLocks()).toBe(0);
      expect(doc.body.style.overflow).toBe('');
      // Restored to exact original inline style '12px'
      expect(doc.body.style.paddingRight).toBe('12px');
    });

    it('does not unlock body scroll when closing one dialog if another dialog is open', () => {
      acquireScrollLock(); // Dialog 1
      acquireScrollLock(); // Dialog 2
      expect(getActiveScrollLocks()).toBe(2);
      expect(doc.body.style.overflow).toBe('hidden');
      expect(doc.body.style.paddingRight).toBe('28px');

      releaseScrollLock(); // Dialog 2 closes
      expect(getActiveScrollLocks()).toBe(1);
      expect(doc.body.style.overflow).toBe('hidden'); // STILL locked
      expect(doc.body.style.paddingRight).toBe('28px');

      releaseScrollLock(); // Dialog 1 closes
      expect(getActiveScrollLocks()).toBe(0);
      expect(doc.body.style.overflow).toBe('');
      expect(doc.body.style.paddingRight).toBe('12px');
    });
  });

  describe('2. Dynamic lockScroll responsiveness (desktop <-> mobile <-> desktop)', () => {
    it('responds to lockScroll transitions while isOpen remains true without restarting initial focus or restoring opener focus', () => {
      const openerButton = doc.createElement('button');
      doc.body.appendChild(openerButton);
      openerButton.focus();
      expect(doc.activeElement).toBe(openerButton);

      interface HarnessProps {
        isOpen: boolean;
        lockScroll: boolean;
        onClose: () => void;
      }

      let capturedInputRef: DOMElement | null = null;

      function DynamicDialogHarness({ isOpen, lockScroll, onClose }: HarnessProps) {
        const containerRef = useRef<HTMLDivElement>(null);
        const openerRef = useRef<HTMLButtonElement>(openerButton as unknown as HTMLButtonElement);
        const input1Ref = useRef<HTMLInputElement>(null);
        const input2Ref = useRef<HTMLInputElement>(null);

        useDialogA11y({
          isOpen,
          lockScroll,
          onClose,
          containerRef: containerRef as unknown as React.RefObject<HTMLElement | null>,
          returnFocusRef: openerRef as unknown as React.RefObject<HTMLElement | null>,
        });

        return React.createElement(
          'div',
          { ref: containerRef },
          React.createElement('input', {
            ref: (el: HTMLInputElement | null) => {
              input1Ref.current = el;
            },
          }),
          React.createElement('input', {
            ref: (el: HTMLInputElement | null) => {
              input2Ref.current = el;
              capturedInputRef = el as unknown as DOMElement;
            },
          })
        );
      }

      // Step 1: Open dialog on desktop (lockScroll = false)
      act(() => {
        root!.render(
          React.createElement(DynamicDialogHarness, {
            isOpen: true,
            lockScroll: false,
            onClose: () => {},
          })
        );
      });
      win.flushRaf();

      expect(getActiveScrollLocks()).toBe(0); // desktop: not locked
      expect(doc.body.style.overflow).toBe('');

      // Step 2: User shifts focus to second input inside the dialog
      expect(capturedInputRef).not.toBeNull();
      capturedInputRef!.focus();
      expect(doc.activeElement).toBe(capturedInputRef);

      // Step 3: Viewport transitions desktop -> mobile (lockScroll becomes true) while dialog remains open
      act(() => {
        root!.render(
          React.createElement(DynamicDialogHarness, {
            isOpen: true,
            lockScroll: true,
            onClose: () => {},
          })
        );
      });
      win.flushRaf();

      // Scroll lock is acquired!
      expect(getActiveScrollLocks()).toBe(1);
      expect(doc.body.style.overflow).toBe('hidden');
      // Focus MUST remain on capturedInputRef (NOT restarted or stolen to opener)
      expect(doc.activeElement).toBe(capturedInputRef);

      // Step 4: Viewport transitions mobile -> desktop (lockScroll becomes false) while dialog remains open
      act(() => {
        root!.render(
          React.createElement(DynamicDialogHarness, {
            isOpen: true,
            lockScroll: false,
            onClose: () => {},
          })
        );
      });
      win.flushRaf();

      // Scroll lock is released!
      expect(getActiveScrollLocks()).toBe(0);
      expect(doc.body.style.overflow).toBe('');
      // Focus STILL remains on capturedInputRef!
      expect(doc.activeElement).toBe(capturedInputRef);

      // Step 5: Dialog finally closes
      act(() => {
        root!.render(
          React.createElement(DynamicDialogHarness, {
            isOpen: false,
            lockScroll: false,
            onClose: () => {},
          })
        );
      });
      win.flushRaf();

      // Focus is restored to opener button
      expect(doc.activeElement).toBe(openerButton);
    });
  });

  describe('3. Topmost modal ownership of Escape and focus trapping across overlapping dialogs', () => {
    it('allows only the topmost modal to receive Escape dismissal and focus trapping', () => {
      let modal1Closed = false;
      let modal2Closed = false;

      function StackedModalsHarness({ modal2Open }: { modal2Open: boolean }) {
        const container1Ref = useRef<HTMLDivElement>(null);
        const container2Ref = useRef<HTMLDivElement>(null);

        // Modal 1 (outer)
        useDialogA11y({
          isOpen: true,
          closeOnEscape: true,
          onClose: () => {
            modal1Closed = true;
          },
          containerRef: container1Ref as unknown as React.RefObject<HTMLElement | null>,
        });

        // Modal 2 (inner, stacked on top of Modal 1)
        useDialogA11y({
          isOpen: modal2Open,
          closeOnEscape: true,
          onClose: () => {
            modal2Closed = true;
          },
          containerRef: container2Ref as unknown as React.RefObject<HTMLElement | null>,
        });

        return React.createElement(
          'div',
          null,
          React.createElement('div', { ref: container1Ref }, 'Modal 1 Content'),
          modal2Open ? React.createElement('div', { ref: container2Ref }, 'Modal 2 Content') : null
        );
      }

      // Mount both modals open
      act(() => {
        root!.render(React.createElement(StackedModalsHarness, { modal2Open: true }));
      });
      win.flushRaf();

      expect(getActiveDialogStack().length).toBe(2);

      // Dispatch real DOM Escape event on window
      win.dispatchEvent(new CustomKeyboardEvent('keydown', { key: 'Escape' }));

      // Only Modal 2 (topmost) should have closed! Modal 1 must NOT have closed!
      expect(modal2Closed).toBe(true);
      expect(modal1Closed).toBe(false);

      // Re-render with Modal 2 closed
      act(() => {
        root!.render(React.createElement(StackedModalsHarness, { modal2Open: false }));
      });
      win.flushRaf();

      expect(getActiveDialogStack().length).toBe(1);

      // Dispatch real DOM Escape event on window again
      win.dispatchEvent(new CustomKeyboardEvent('keydown', { key: 'Escape' }));

      // Now Modal 1 is the topmost modal and receives Escape
      expect(modal1Closed).toBe(true);
    });
  });

  describe('4. Mounted hook regression: stable callbacks prevent focus-stealing on parent rerenders', () => {
    it('mounts the actual hook, verifies focus stability across parent rerenders with new inline callbacks, and dispatches real DOM events', () => {
      const openerButton = doc.createElement('button');
      doc.body.appendChild(openerButton);
      openerButton.focus();
      expect(doc.activeElement).toBe(openerButton);

      let escapeCallValue = '';

      let capturedInput1: DOMElement | null = null;
      let capturedInput2: DOMElement | null = null;

      function TestDialogComponent({ typingText }: { typingText: string }) {
        const containerRef = useRef<HTMLDivElement>(null);
        const openerRef = useRef<HTMLButtonElement>(openerButton as unknown as HTMLButtonElement);
        const input1Ref = useRef<HTMLInputElement>(null);
        const input2Ref = useRef<HTMLInputElement>(null);

        // Caller passes fresh inline callback every single render!
        useDialogA11y({
          isOpen: true,
          onClose: () => {
            escapeCallValue = typingText;
          },
          containerRef: containerRef as unknown as React.RefObject<HTMLElement | null>,
          returnFocusRef: openerRef as unknown as React.RefObject<HTMLElement | null>,
        });

        return React.createElement(
          'div',
          { ref: containerRef },
          React.createElement('input', {
            id: 'input-1',
            ref: (el: HTMLInputElement | null) => {
              input1Ref.current = el;
              capturedInput1 = el as unknown as DOMElement;
            },
          }),
          React.createElement('input', {
            id: 'input-2',
            ref: (el: HTMLInputElement | null) => {
              input2Ref.current = el;
              capturedInput2 = el as unknown as DOMElement;
            },
          })
        );
      }

      // Step 1: Initial mount
      act(() => {
        root!.render(React.createElement(TestDialogComponent, { typingText: 'char-1' }));
      });
      win.flushRaf();

      // Initial focus sets to first interactive control
      expect(doc.activeElement).toBe(capturedInput1);

      // Step 2: User focuses second input to type
      capturedInput2!.focus();
      expect(doc.activeElement).toBe(capturedInput2);

      // Step 3: User types multiple characters, causing multiple parent rerenders with new inline callbacks
      act(() => {
        root!.render(React.createElement(TestDialogComponent, { typingText: 'char-2' }));
      });
      win.flushRaf();
      expect(doc.activeElement).toBe(capturedInput2); // Focus MUST NOT be stolen!

      act(() => {
        root!.render(React.createElement(TestDialogComponent, { typingText: 'char-3-final' }));
      });
      win.flushRaf();
      expect(doc.activeElement).toBe(capturedInput2); // Still on input2!

      // Step 3b: Tab focus trapping: forward Tab on last interactive element cycles back to first
      win.dispatchEvent(new CustomKeyboardEvent('keydown', { key: 'Tab', shiftKey: false }));
      expect(doc.activeElement).toBe(capturedInput1);

      // Shift+Tab backward on first interactive element cycles to last
      win.dispatchEvent(new CustomKeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
      expect(doc.activeElement).toBe(capturedInput2);

      // Step 4: User presses Escape via real DOM event
      win.dispatchEvent(new CustomKeyboardEvent('keydown', { key: 'Escape' }));

      // The latest inline callback value was executed
      expect(escapeCallValue).toBe('char-3-final');

      // Step 5: Unmount restores opener focus
      act(() => {
        root!.unmount();
        root = null;
      });
      win.flushRaf();

      expect(doc.activeElement).toBe(openerButton);
    });
  });
});
