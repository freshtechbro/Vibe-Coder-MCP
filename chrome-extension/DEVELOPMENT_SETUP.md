# Chrome Extension Development Setup

This guide will help you set up the Repotools Chrome extension for local development and testing.

## Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Chrome Browser** - Latest version recommended
- **Git** - For version control

## Quick Start

### 1. Install Dependencies

```bash
cd chrome-extension
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This creates a `dist` folder with all the extension files ready for Chrome.

### 3. Load Extension in Chrome

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or go to Chrome menu → More tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Navigate to and select the `chrome-extension/dist` folder
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "Repotools" in your extensions list
   - The extension icon should appear in your Chrome toolbar

## Development Workflow

### Development Build (with watch mode)

For active development, use the watch mode to automatically rebuild on changes:

```bash
npm run dev
```

This will:
- Build the extension in development mode
- Watch for file changes
- Automatically rebuild when you save files

### After Making Changes

1. **Save your changes** - The watch mode will automatically rebuild
2. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Find "Repotools" extension
   - Click the refresh/reload icon
3. **Test your changes** - The extension will now use your updated code

### Production Build

For final testing or deployment:

```bash
npm run build:prod
```

## Extension Features

### Popup Interface
- Click the Repotools icon in the Chrome toolbar
- Access quick tools and connection status
- Navigate to different extension features

### Side Panel
- Click "Open Side Panel" in the popup
- Or use Chrome's side panel feature
- Full interface for running tools and monitoring progress

### Options Page
- Right-click the extension icon → Options
- Or go to `chrome://extensions/` → Repotools → Details → Extension options
- Configure server connection, themes, and features

### GitHub Integration
- Automatically activates on GitHub repository pages
- Adds Repotools buttons and context menus
- Provides repository analysis features

## Troubleshooting

### Extension Not Loading

1. **Check the dist folder exists**
   ```bash
   ls -la chrome-extension/dist
   ```

2. **Verify manifest.json is present**
   ```bash
   cat chrome-extension/dist/manifest.json
   ```

3. **Check for build errors**
   ```bash
   npm run build
   ```

### Extension Not Working

1. **Check Chrome Developer Console**
   - Right-click extension icon → Inspect popup
   - Look for JavaScript errors

2. **Check Background Script**
   - Go to `chrome://extensions/`
   - Click "Inspect views: background page" under Repotools

3. **Verify Permissions**
   - Ensure all required permissions are granted
   - Check `chrome://extensions/` → Repotools → Details

### Build Issues

1. **Clear node_modules and reinstall**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check TypeScript errors**
   ```bash
   npm run type-check
   ```

3. **Verify all dependencies**
   ```bash
   npm audit
   ```

## File Structure

```
chrome-extension/
├── dist/                     # Built extension (load this in Chrome)
│   ├── manifest.json        # Extension manifest
│   ├── popup/               # Popup interface
│   ├── sidepanel/           # Side panel interface
│   ├── options/             # Options page
│   ├── background/          # Background service worker
│   ├── content/             # Content scripts
│   └── assets/              # Icons and static files
├── src/                     # Source code
├── popup/                   # Popup React components
├── sidepanel/              # Side panel React components
├── options/                # Options React components
└── assets/                 # Source assets
```

## Development Tips

1. **Use Chrome DevTools**
   - Inspect popup: Right-click extension icon → Inspect popup
   - Debug background: Extensions page → Inspect views
   - Debug content scripts: Regular page DevTools

2. **Hot Reload**
   - Use `npm run dev` for automatic rebuilds
   - Install Chrome extension hot reload tools for faster development

3. **Testing**
   - Test on different websites (especially GitHub)
   - Test all extension features (popup, side panel, options)
   - Verify permissions work correctly

4. **Debugging**
   - Check console logs in all contexts (popup, background, content)
   - Use Chrome's extension debugging tools
   - Test with different Chrome profiles

## Next Steps

1. **Start the lightweight server** (if needed for full functionality)
2. **Test GitHub integration** by visiting a GitHub repository
3. **Configure server connection** in the options page
4. **Explore all extension features** through the popup and side panel

## Support

- Check the main README.md for general project information
- Review the extension source code for implementation details
- Open issues on the project repository for bugs or feature requests
