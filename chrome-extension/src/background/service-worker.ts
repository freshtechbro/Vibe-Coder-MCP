// Repotools Chrome Extension Service Worker
// Handles background tasks, communication, and extension lifecycle

interface TaskMessage {
  type: string;
  taskType?: string;
  taskId?: string;
  action?: string;
  repoPath?: string;
  timestamp?: number;
  tool?: string;
}

interface TaskProgress {
  id: string;
  name: string;
  progress: number;
  status: 'running' | 'completed' | 'paused' | 'error';
  startTime: number;
  estimatedTime?: number;
}

class RepotoolsServiceWorker {
  private activeTasks: Map<string, TaskProgress> = new Map();
  private serverConnection: { connected: boolean; url?: string } = { connected: false };

  constructor() {
    this.initializeServiceWorker();
  }

  private initializeServiceWorker(): void {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('Repotools extension installed:', details.reason);
      this.setupInitialState();
    });

    // Handle messages from popup and side panel
    chrome.runtime.onMessage.addListener((message: TaskMessage, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle tab updates for GitHub integration
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url?.includes('github.com')) {
        this.handleGitHubPageLoad(tabId, tab);
      }
    });

    // Handle side panel requests (check if API is available)
    this.initializeSidePanel();
  }

  private initializeSidePanel(): void {
    try {
      // Check if chrome object exists
      if (typeof chrome === 'undefined') {
        console.warn('Chrome APIs not available');
        return;
      }

      // Check if sidePanel API exists
      if (!chrome.sidePanel) {
        console.warn('Side panel API not available in this Chrome version');
        return;
      }

      // Check if setPanelBehavior method exists
      if (typeof chrome.sidePanel.setPanelBehavior !== 'function') {
        console.warn('setPanelBehavior method not available');
        return;
      }

      // Try to set panel behavior
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('Side panel behavior set successfully');
    } catch (error) {
      console.warn('Failed to initialize side panel:', error);
    }
  }

  private async setupInitialState(): Promise<void> {
    try {
      // Initialize storage with default values
      await chrome.storage.local.set({
        tasks: [],
        serverConnection: { connected: false },
        repoPath: '',
        settings: {
          autoConnect: true,
          serverUrl: 'http://localhost:3001',
          theme: 'light',
        },
      });
    } catch (error) {
      console.error('Failed to setup initial state:', error);
    }
  }

  private async handleMessage(
    message: TaskMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'START_TASK':
          await this.startTask(message);
          break;

        case 'TASK_CONTROL':
          await this.controlTask(message);
          break;

        case 'TOOL_ACTION':
          await this.handleToolAction(message);
          break;

        case 'GET_STATUS':
          sendResponse({
            tasks: Array.from(this.activeTasks.values()),
            serverConnection: this.serverConnection,
          });
          break;

        case 'CONNECT_SERVER':
          await this.connectToServer();
          break;

        case 'DISCONNECT_SERVER':
          await this.disconnectFromServer();
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: (error as Error).message });
    }
  }

  private async startTask(message: TaskMessage): Promise<void> {
    if (!message.taskType || !message.taskId) {
      throw new Error('Missing taskType or taskId');
    }

    const task: TaskProgress = {
      id: message.taskId,
      name: message.taskType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      progress: 0,
      status: 'running',
      startTime: Date.now(),
    };

    this.activeTasks.set(task.id, task);
    await this.saveTasksToStorage();

    // Simulate task progress (replace with actual server communication)
    this.simulateTaskProgress(task.id);

    // Notify UI components
    this.broadcastTaskUpdate(task);
  }

  private async controlTask(message: TaskMessage): Promise<void> {
    if (!message.taskId || !message.action) {
      throw new Error('Missing taskId or action');
    }

    const task = this.activeTasks.get(message.taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    switch (message.action) {
      case 'pause':
        task.status = 'paused';
        break;
      case 'resume':
        task.status = 'running';
        this.simulateTaskProgress(task.id);
        break;
      case 'stop':
        this.activeTasks.delete(task.id);
        await this.saveTasksToStorage();
        return;
    }

    this.activeTasks.set(task.id, task);
    await this.saveTasksToStorage();
    this.broadcastTaskUpdate(task);
  }

  private async handleToolAction(message: TaskMessage): Promise<void> {
    // Handle quick tool actions from popup
    console.log('Tool action:', message.tool);

    // This would typically communicate with the lightweight server
    // For now, we'll just log the action
  }

  private simulateTaskProgress(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (!task || task.status !== 'running') return;

    const interval = setInterval(async () => {
      const currentTask = this.activeTasks.get(taskId);
      if (!currentTask || currentTask.status !== 'running') {
        clearInterval(interval);
        return;
      }

      currentTask.progress = Math.min(currentTask.progress + Math.random() * 10, 100);

      if (currentTask.progress >= 100) {
        currentTask.status = 'completed';
        clearInterval(interval);
      }

      this.activeTasks.set(taskId, currentTask);
      await this.saveTasksToStorage();
      this.broadcastTaskUpdate(currentTask);
    }, 1000);
  }

  private async saveTasksToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({
        tasks: Array.from(this.activeTasks.values()),
      });
    } catch (error) {
      console.error('Failed to save tasks to storage:', error);
    }
  }

  private broadcastTaskUpdate(task: TaskProgress): void {
    // Send update to all extension pages
    chrome.runtime.sendMessage({
      type: 'TASK_UPDATE',
      task,
    }).catch(() => {
      // Ignore errors if no listeners
    });
  }

  private async connectToServer(): Promise<void> {
    try {
      // This would typically connect to the lightweight server
      // For now, we'll simulate a connection
      this.serverConnection = { connected: true, url: 'http://localhost:3001' };

      await chrome.storage.local.set({
        serverConnection: this.serverConnection,
      });

      console.log('Connected to server');
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  }

  private async disconnectFromServer(): Promise<void> {
    try {
      this.serverConnection = { connected: false };

      await chrome.storage.local.set({
        serverConnection: this.serverConnection,
      });

      console.log('Disconnected from server');
    } catch (error) {
      console.error('Failed to disconnect from server:', error);
      throw error;
    }
  }

  private async handleGitHubPageLoad(_tabId: number, tab: chrome.tabs.Tab): Promise<void> {
    try {
      // Inject GitHub integration content script if needed
      console.log('GitHub page loaded:', tab.url);

      // This could trigger automatic repository detection
      // and offer to start analysis
    } catch (error) {
      console.error('Failed to handle GitHub page load:', error);
    }
  }
}

// Initialize the service worker
new RepotoolsServiceWorker();

// Export for testing
export { RepotoolsServiceWorker };
