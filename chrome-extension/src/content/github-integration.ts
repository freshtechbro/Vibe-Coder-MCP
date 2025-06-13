// GitHub Integration Content Script
// Enhances GitHub pages with Repotools functionality

interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  isPrivate: boolean;
}

class GitHubIntegration {
  private repoInfo: GitHubRepoInfo | null = null;
  private repotoolsButton: HTMLElement | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }

    // Listen for navigation changes (GitHub is a SPA)
    this.observeNavigation();
  }

  private setup(): void {
    this.detectRepository();
    this.injectRepotoolsButton();
    this.setupMessageListener();
  }

  private detectRepository(): void {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      const branch = this.getCurrentBranch();
      const path = pathParts.slice(2).join('/');
      const isPrivate = this.isPrivateRepository();

      this.repoInfo = {
        owner,
        repo,
        branch,
        path,
        isPrivate,
      };

      console.log('Detected GitHub repository:', this.repoInfo);
    }
  }

  private getCurrentBranch(): string {
    // Try to get branch from various GitHub UI elements
    const branchButton = document.querySelector('[data-testid="anchor-button"]');
    const branchSpan = document.querySelector('.css-truncate-target');
    
    if (branchButton?.textContent) {
      return branchButton.textContent.trim();
    }
    
    if (branchSpan?.textContent) {
      return branchSpan.textContent.trim();
    }
    
    return 'main'; // Default fallback
  }

  private isPrivateRepository(): boolean {
    const privateLabel = document.querySelector('[title="Private repository"]');
    return !!privateLabel;
  }

  private injectRepotoolsButton(): void {
    if (!this.repoInfo || this.repotoolsButton) return;

    // Find the repository header actions area
    const actionsContainer = document.querySelector('.file-navigation .d-flex');
    if (!actionsContainer) return;

    // Create Repotools button
    this.repotoolsButton = this.createRepotoolsButton();
    
    // Insert before the last child (usually the "Code" button)
    const lastChild = actionsContainer.lastElementChild;
    if (lastChild) {
      actionsContainer.insertBefore(this.repotoolsButton, lastChild);
    } else {
      actionsContainer.appendChild(this.repotoolsButton);
    }
  }

  private createRepotoolsButton(): HTMLElement {
    const button = document.createElement('div');
    button.className = 'repotools-github-button';
    button.innerHTML = `
      <button type="button" 
              class="btn btn-sm btn-outline"
              style="margin-right: 8px; display: flex; align-items: center; gap: 6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>Repotools</span>
      </button>
    `;

    const buttonElement = button.querySelector('button');
    if (buttonElement) {
      buttonElement.addEventListener('click', () => this.handleRepotoolsClick());
    }

    return button;
  }

  private async handleRepotoolsClick(): Promise<void> {
    try {
      // Send repository info to extension
      await chrome.runtime.sendMessage({
        type: 'GITHUB_REPO_DETECTED',
        repoInfo: this.repoInfo,
        url: window.location.href,
      });

      // Open side panel
      this.showRepotoolsPanel();
    } catch (error) {
      console.error('Failed to handle Repotools click:', error);
    }
  }

  private showRepotoolsPanel(): void {
    // Create and show a floating panel
    const panel = this.createFloatingPanel();
    document.body.appendChild(panel);
  }

  private createFloatingPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'repotools-floating-panel';
    panel.innerHTML = `
      <div class="repotools-panel-content">
        <div class="repotools-panel-header">
          <h3>Repotools</h3>
          <button class="repotools-close-btn">&times;</button>
        </div>
        <div class="repotools-panel-body">
          <div class="repotools-repo-info">
            <h4>${this.repoInfo?.owner}/${this.repoInfo?.repo}</h4>
            <p>Branch: ${this.repoInfo?.branch}</p>
          </div>
          <div class="repotools-actions">
            <button class="repotools-action-btn" data-action="code-map">
              Generate Code Map
            </button>
            <button class="repotools-action-btn" data-action="context-curator">
              Curate Context
            </button>
            <button class="repotools-action-btn" data-action="research-manager">
              Research Manager
            </button>
          </div>
        </div>
      </div>
    `;

    // Add styles
    this.addPanelStyles();

    // Add event listeners
    const closeBtn = panel.querySelector('.repotools-close-btn');
    closeBtn?.addEventListener('click', () => panel.remove());

    const actionBtns = panel.querySelectorAll('.repotools-action-btn');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        if (action) {
          this.handleAction(action);
          panel.remove();
        }
      });
    });

    return panel;
  }

  private addPanelStyles(): void {
    if (document.getElementById('repotools-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'repotools-styles';
    styles.textContent = `
      .repotools-floating-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .repotools-panel-content {
        padding: 24px;
      }

      .repotools-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .repotools-panel-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
      }

      .repotools-close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .repotools-close-btn:hover {
        color: #374151;
      }

      .repotools-repo-info {
        margin-bottom: 20px;
        padding: 16px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 12px;
      }

      .repotools-repo-info h4 {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
      }

      .repotools-repo-info p {
        margin: 0;
        font-size: 14px;
        color: #6b7280;
      }

      .repotools-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .repotools-action-btn {
        padding: 12px 16px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .repotools-action-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.4);
      }
    `;

    document.head.appendChild(styles);
  }

  private async handleAction(action: string): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'GITHUB_ACTION',
        action,
        repoInfo: this.repoInfo,
      });
    } catch (error) {
      console.error('Failed to handle action:', error);
    }
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'UPDATE_REPO_INFO') {
        this.detectRepository();
        sendResponse({ success: true });
      }
    });
  }

  private observeNavigation(): void {
    // GitHub uses pushState for navigation, so we need to listen for URL changes
    let currentUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => {
          this.setup();
        }, 1000); // Wait for GitHub to update the DOM
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

// Initialize GitHub integration
new GitHubIntegration();

// Export for testing
export { GitHubIntegration };
