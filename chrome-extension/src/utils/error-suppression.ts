/**
 * Error Suppression Utilities
 * Handles common browser warnings and errors that are harmless but noisy
 */

/**
 * Suppresses the ResizeObserver loop completed with undelivered notifications warning
 * This is a common, harmless warning that occurs when UI components observe size changes
 * and the browser can't deliver all notifications in a single frame
 */
export function suppressResizeObserverWarnings(): void {
  // Suppress ResizeObserver errors
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('ResizeObserver loop completed with undelivered notifications')) {
      e.stopImmediatePropagation();
      return false;
    }
  });

  // Also suppress unhandled promise rejections related to ResizeObserver
  window.addEventListener('unhandledrejection', function(e) {
    if (e.reason && e.reason.message && e.reason.message.includes('ResizeObserver')) {
      e.preventDefault();
      return false;
    }
  });
}

/**
 * Suppresses common Chrome extension warnings
 */
export function suppressExtensionWarnings(): void {
  // Suppress ResizeObserver warnings
  suppressResizeObserverWarnings();

  // Suppress other common extension warnings
  const originalConsoleWarn = console.warn;
  console.warn = function(...args) {
    const message = args.join(' ');
    
    // Filter out known harmless warnings
    const harmlessWarnings = [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'Non-passive event listener',
      'Violation: Added non-passive event listener'
    ];

    const isHarmless = harmlessWarnings.some(warning => 
      message.includes(warning)
    );

    if (!isHarmless) {
      originalConsoleWarn.apply(console, args);
    }
  };
}

/**
 * Initialize error suppression for Chrome extension
 * Call this early in your application lifecycle
 */
export function initializeErrorSuppression(): void {
  suppressExtensionWarnings();
  
  // Log that error suppression is active (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔇 Error suppression initialized for Chrome extension');
  }
}
