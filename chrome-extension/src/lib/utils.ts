import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Glass morphism utility functions
export const glassStyles = {
  card: "bg-white/80 backdrop-blur-lg border border-white/20 shadow-glass rounded-2xl",
  cardHover: "hover:bg-white/90 hover:shadow-glass-hover hover:scale-[1.02]",
  panel: "bg-white/70 backdrop-blur-xl border-r border-white/20 shadow-glass",
  button: "bg-gradient-primary text-white font-medium rounded-xl shadow-lg hover:shadow-xl",
  buttonHover: "hover:scale-105 transition-all duration-300",
  input: "bg-white/60 backdrop-blur-md border border-white/30 rounded-xl",
  inputFocus: "focus:bg-white/80 focus:border-blue-400 focus:ring-2 focus:ring-blue-200",
  transition: "transition-all duration-300 ease-out",
  spacing: "p-8 m-6 space-y-8",
}

// Animation utilities
export const animations = {
  fadeIn: "animate-fade-in",
  scaleIn: "animate-scale-in",
  hoverLift: "hover-lift",
  hoverGlow: "hover-glow",
}

// Chrome extension specific utilities
export const extensionUtils = {
  // Send message to background script
  sendMessage: (message: any) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  },

  // Get storage data
  getStorage: (keys: string | string[] | null = null) => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  },

  // Set storage data
  setStorage: (data: Record<string, any>) => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  },

  // Open side panel
  openSidePanel: async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  },
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))  } ${  sizes[i]}`;
}

// Format duration
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

