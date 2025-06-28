# Chrome Extension Testing Checklist

Use this checklist to verify that the Repotools Chrome extension is working correctly in your development environment.

## Pre-Testing Setup

- [ ] Node.js 18+ installed
- [ ] Chrome browser (latest version)
- [ ] Extension dependencies installed (`npm install`)
- [ ] Extension built successfully (`npm run build`)
- [ ] All required files present in `dist/` folder

## Extension Loading

### Initial Load
- [ ] Open `chrome://extensions/`
- [ ] Enable "Developer mode" toggle
- [ ] Click "Load unpacked" button
- [ ] Select `chrome-extension/dist` folder
- [ ] Extension appears in extensions list
- [ ] No error messages in Chrome console
- [ ] Extension icon appears in Chrome toolbar

### Extension Information
- [ ] Extension name shows as "Repotools"
- [ ] Version shows as "1.0.0"
- [ ] Description is displayed correctly
- [ ] All permissions are listed (storage, activeTab, scripting, tabs)
- [ ] Host permissions include GitHub and localhost

## Popup Interface Testing

### Basic Functionality
- [ ] Click extension icon in toolbar
- [ ] Popup opens without errors
- [ ] Popup displays correctly (480x700px)
- [ ] Header shows "Repotools" with icon
- [ ] Connection status section is visible
- [ ] Quick actions section is visible
- [ ] All tool cards are displayed

### Connection Status
- [ ] Connection indicator shows red (disconnected) initially
- [ ] "Connect" button is visible
- [ ] Clicking "Connect" attempts connection
- [ ] Connection status updates appropriately

### Tool Cards
- [ ] All 14 tool cards are displayed
- [ ] Each card has an icon, title, and description
- [ ] Cards are clickable
- [ ] Hover effects work correctly
- [ ] "Open Side Panel" button works

## Side Panel Testing

### Opening Side Panel
- [ ] Click "Open Side Panel" from popup
- [ ] Side panel opens in Chrome
- [ ] Side panel displays correctly
- [ ] Header shows Repotools branding
- [ ] Connection status is visible
- [ ] Repository path input is present

### Interface Elements
- [ ] Connection status indicator works
- [ ] Repository path input accepts text
- [ ] Folder icon button is present
- [ ] Quick actions section displays
- [ ] Active tasks section shows "No active tasks"
- [ ] Recent results section shows placeholder

### Quick Actions
- [ ] "Generate Code Map" button is present
- [ ] "Curate Context" button is present
- [ ] "Research Manager" button is present
- [ ] Buttons are disabled when no repo path or connection
- [ ] Buttons show proper hover effects

## Options Page Testing

### Accessing Options
- [ ] Right-click extension icon → Options
- [ ] Options page opens in new tab
- [ ] Page displays correctly with proper styling
- [ ] Header shows "Repotools Settings"

### Settings Sections
- [ ] Server Configuration section is present
- [ ] Appearance section is present
- [ ] Features section is present
- [ ] Performance section is present

### Server Configuration
- [ ] Server URL input field works
- [ ] Default URL is "http://localhost:3001"
- [ ] "Test Connection" button is present
- [ ] Auto-connect toggle works

### Other Settings
- [ ] Theme selection (light/dark/auto) works
- [ ] GitHub Integration toggle works
- [ ] Notifications toggle works
- [ ] Cache toggle works
- [ ] Max concurrent tasks slider works
- [ ] Debug mode toggle works

### Actions
- [ ] "Reset to Defaults" button works
- [ ] "Documentation" button opens external link
- [ ] "Save Settings" button works
- [ ] Settings persist after page reload

## Background Script Testing

### Service Worker
- [ ] Go to `chrome://extensions/`
- [ ] Click "Inspect views: background page" under Repotools
- [ ] Background script console opens
- [ ] No JavaScript errors in console
- [ ] Service worker initializes correctly

### Message Handling
- [ ] Background script responds to popup messages
- [ ] Task management functions work
- [ ] Storage operations work correctly
- [ ] Tab update listeners work

## Content Script Testing (GitHub Integration)

### GitHub Page Load
- [ ] Navigate to any GitHub repository
- [ ] Page loads normally
- [ ] No JavaScript errors in console
- [ ] Content script injects successfully

### GitHub Integration Features
- [ ] Repotools elements appear on GitHub pages (if implemented)
- [ ] GitHub-specific styling loads correctly
- [ ] No conflicts with GitHub's existing functionality

## Error Handling

### Console Errors
- [ ] No errors in popup console
- [ ] No errors in side panel console
- [ ] No errors in options page console
- [ ] No errors in background script console
- [ ] No errors in content script console

### Network Issues
- [ ] Extension handles server connection failures gracefully
- [ ] Appropriate error messages are displayed
- [ ] Extension doesn't crash on network errors

## Performance Testing

### Load Times
- [ ] Popup opens quickly (< 500ms)
- [ ] Side panel loads quickly
- [ ] Options page loads quickly
- [ ] No noticeable lag in interactions

### Memory Usage
- [ ] Extension doesn't consume excessive memory
- [ ] No memory leaks during normal usage
- [ ] Background script stays within reasonable limits

## Cross-Browser Testing (Optional)

### Chrome Versions
- [ ] Works on Chrome stable
- [ ] Works on Chrome beta (if available)
- [ ] Works on Chromium

## Final Verification

### Complete Workflow
- [ ] Install extension from scratch
- [ ] Configure basic settings
- [ ] Test all major features
- [ ] Verify data persistence
- [ ] Test extension reload/update

### Documentation
- [ ] README instructions are accurate
- [ ] Development setup guide works
- [ ] All file paths in documentation are correct

## Known Issues / Notes

Document any issues found during testing:

- Issue 1: [Description and workaround]
- Issue 2: [Description and workaround]

## Sign-off

- [ ] All critical functionality tested
- [ ] No blocking issues found
- [ ] Extension ready for development use
- [ ] Documentation is complete and accurate

**Tested by:** [Your name]  
**Date:** [Test date]  
**Chrome Version:** [Chrome version]  
**OS:** [Operating system]
