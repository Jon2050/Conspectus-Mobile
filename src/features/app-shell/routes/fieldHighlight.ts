// Provides visual blinking highlight and scroll-into-view behavior for invalid form fields.

export const triggerFieldBlink = (element: HTMLElement | null): void => {
  if (!element) return;
  element.classList.remove('app-input--blink');
  // Reading offsetWidth forces reflow so re-adding the class restarts the CSS animation
  if (typeof element.offsetWidth === 'number') {
    void element.offsetWidth;
  }
  element.classList.add('app-input--blink');
  element.setAttribute('aria-invalid', 'true');
  element.addEventListener(
    'animationend',
    () => {
      element.classList.remove('app-input--blink');
    },
    { once: true },
  );
};

export const scrollFieldIntoView = (element: HTMLElement | null): void => {
  if (!element) return;
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  element.scrollIntoView?.({
    behavior: prefersReduced ? 'auto' : 'smooth',
    block: 'center',
  });
  element.focus?.({ preventScroll: true });
};

export const highlightAndFocusInvalidFields = (elements: readonly (HTMLElement | null)[]): void => {
  const validElements = elements.filter((el): el is HTMLElement => el !== null);
  if (validElements.length === 0) return;

  for (const el of validElements) {
    triggerFieldBlink(el);
  }

  const first = validElements[0];
  if (first) {
    scrollFieldIntoView(first);
  }
};

export const clearFieldHighlights = (container: HTMLElement | null): void => {
  if (!container) return;
  const elements = container.querySelectorAll?.('.app-input--blink, [aria-invalid="true"]') ?? [];
  elements.forEach((el) => {
    el.classList.remove('app-input--blink');
    el.removeAttribute('aria-invalid');
  });
};
