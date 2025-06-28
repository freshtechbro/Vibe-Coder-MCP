/**
 * Extension utilities for Chrome extension functionality
 */

export interface ExtensionMessage {
  type: string;
  [key: string]: any;
}

export class ExtensionUtils {
  /**
   * Open the side panel
   */
  async openSidePanel(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      try {
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow.id) {
          await chrome.sidePanel.open({ windowId: currentWindow.id });
        } else {
          throw new Error('Could not get current window ID');
        }
      } catch (error) {
        console.error('Failed to open side panel:', error);
        throw error;
      }
    } else {
      throw new Error('Side panel API not available');
    }
  }

  /**
   * Send a message to other parts of the extension
   */
  async sendMessage(message: ExtensionMessage): Promise<any> {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        return await chrome.runtime.sendMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    } else {
      throw new Error('Chrome runtime API not available');
    }
  }

  /**
   * Get data from extension storage
   */
  async getStorage(keys: string[]): Promise<Record<string, any>> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        return await chrome.storage.local.get(keys);
      } catch (error) {
        console.error('Failed to get storage:', error);
        throw error;
      }
    } else {
      throw new Error('Chrome storage API not available');
    }
  }

  /**
   * Set data in extension storage
   */
  async setStorage(data: Record<string, any>): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.local.set(data);
      } catch (error) {
        console.error('Failed to set storage:', error);
        throw error;
      }
    } else {
      throw new Error('Chrome storage API not available');
    }
  }

  /**
   * Get current tab information
   */
  async getCurrentTab(): Promise<chrome.tabs.Tab | null> {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab || null;
      } catch (error) {
        console.error('Failed to get current tab:', error);
        return null;
      }
    } else {
      return null;
    }
  }

  /**
   * Create a notification
   */
  async createNotification(options: {
    title: string;
    message: string;
    type?: 'basic' | 'image' | 'list' | 'progress';
  }): Promise<boolean> {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      try {
        await chrome.notifications.create({
          type: options.type || 'basic',
          iconUrl: '/assets/icons/icon-48.png',
          title: options.title,
          message: options.message,
        });
        return true;
      } catch (error) {
        console.error('Failed to create notification:', error);
        return false;
      }
    } else {
      return false;
    }
  }
}

// Export a singleton instance
export const extensionUtils = new ExtensionUtils();
