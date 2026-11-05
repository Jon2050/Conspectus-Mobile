import { describe, expect, it, vi } from 'vitest';
import {
  clearFieldHighlights,
  highlightAndFocusInvalidFields,
  scrollFieldIntoView,
  triggerFieldBlink,
} from './fieldHighlight';

const createMockElement = () => {
  const classListSet = new Set<string>();
  const attributes = new Map<string, string>();
  const listeners: Record<string, ((event?: unknown) => void)[]> = {};

  const element = {
    classList: {
      add: (cls: string) => classListSet.add(cls),
      remove: (cls: string) => classListSet.delete(cls),
      contains: (cls: string) => classListSet.has(cls),
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    addEventListener: (event: string, listener: (event?: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(listener);
    },
    dispatchAnimationEnd: () => {
      listeners['animationend']?.forEach((fn) => fn());
    },
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
    offsetWidth: 100,
  } as unknown as HTMLElement & {
    dispatchAnimationEnd: () => void;
  };

  return { element, classListSet, attributes };
};

describe('fieldHighlight', () => {
  describe('triggerFieldBlink', () => {
    it('handles null gracefully without throwing', () => {
      expect(() => triggerFieldBlink(null)).not.toThrow();
    });

    it('adds blink class and sets aria-invalid to true', () => {
      const { element, classListSet, attributes } = createMockElement();
      triggerFieldBlink(element);

      expect(classListSet.has('app-input--blink')).toBe(true);
      expect(attributes.get('aria-invalid')).toBe('true');
    });

    it('removes blink class on animationend event', () => {
      const { element, classListSet } = createMockElement();
      triggerFieldBlink(element);
      expect(classListSet.has('app-input--blink')).toBe(true);

      element.dispatchAnimationEnd();
      expect(classListSet.has('app-input--blink')).toBe(false);
    });
  });

  describe('scrollFieldIntoView', () => {
    it('handles null gracefully', () => {
      expect(() => scrollFieldIntoView(null)).not.toThrow();
    });

    it('invokes scrollIntoView and focus with preventScroll', () => {
      const { element } = createMockElement();
      scrollFieldIntoView(element);

      expect(element.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'center' }),
      );
      expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
    });
  });

  describe('highlightAndFocusInvalidFields', () => {
    it('handles empty list or list with nulls', () => {
      expect(() => highlightAndFocusInvalidFields([])).not.toThrow();
      expect(() => highlightAndFocusInvalidFields([null, null])).not.toThrow();
    });

    it('triggers blink on all elements and scrolls first into view', () => {
      const el1 = createMockElement();
      const el2 = createMockElement();

      highlightAndFocusInvalidFields([el1.element, null, el2.element]);

      expect(el1.classListSet.has('app-input--blink')).toBe(true);
      expect(el2.classListSet.has('app-input--blink')).toBe(true);
      expect(el1.element.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(el2.element.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('clearFieldHighlights', () => {
    it('handles null container gracefully', () => {
      expect(() => clearFieldHighlights(null)).not.toThrow();
    });

    it('clears blink class and aria-invalid attribute from matched elements', () => {
      const el1 = createMockElement();
      const el2 = createMockElement();

      el1.classListSet.add('app-input--blink');
      el1.attributes.set('aria-invalid', 'true');
      el2.attributes.set('aria-invalid', 'true');

      const container = {
        querySelectorAll: () => [el1.element, el2.element],
      } as unknown as HTMLElement;

      clearFieldHighlights(container);

      expect(el1.classListSet.has('app-input--blink')).toBe(false);
      expect(el1.attributes.has('aria-invalid')).toBe(false);
      expect(el2.attributes.has('aria-invalid')).toBe(false);
    });
  });
});
