# Chrome Extension UI Testing Guide

This guide will help you test the redesigned Chrome extension interface that now opens in a persistent side panel instead of a popup.

## Prerequisites

- Chrome browser (latest version recommended)
- Node.js 18+ installed
- Extension successfully built (dist folder exists)

## Step 1: Load Extension in Chrome

1. **Open Chrome Extensions Page**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Navigate to and select the `chrome-extension/dist` folder
   - The extension should appear in your extensions list

4. **Verify Installation**
   - Look for "Repotools" extension in the list
   - Check that there are no error messages
   - Pin the extension to your toolbar for easy access

## Step 2: Test Side Panel Interface

### Side Panel Opening
- [ ] Click the extension icon in the toolbar
- [ ] Verify that a side panel opens on the right side of the browser (NOT a popup)
- [ ] Check that the side panel is approximately 320-400px wide and full browser height

### New Header Layout
- [ ] Verify the compact header with Repotools logo and navigation icons
- [ ] Check that the header contains: Plus (+), Clock, Gamepad, and Settings icons

### Tools Dropdown
- [ ] Locate the tools dropdown (should show "Select a tool...")
- [ ] Click to open the dropdown
- [ ] Verify all 14 tools are present:
  - Research (Search icon)
  - Generate Rules (Shield icon)
  - Generate PRD (FileCode icon)
  - Generate User Stories (Users icon)
  - Generate Task List (CheckSquare icon)
  - Generate Fullstack Starter Kit (Package icon)
  - Run Workflow (Play icon)
  - Get Job Result (Download icon)
  - Map Codebase (Map icon)
  - Vibe Task Manager (Brain icon)
  - Curate Context (FileText icon)
  - Register Agent (UserPlus icon)
  - Get Agent Tasks (ListTodo icon)
  - Submit Task Response (Send icon)
- [ ] Select a tool and verify it appears in the dropdown

### File Attachment
- [ ] Locate the paperclip icon next to the tools dropdown
- [ ] Click the paperclip to open file picker
- [ ] Select one or more files
- [ ] Verify attached files appear below the dropdown with file names
- [ ] Test removing attached files using the "×" button

### Input/Output Interface
- [ ] Verify the query input box with placeholder "What can I help you with?"
- [ ] Type a test query in the input box
- [ ] Verify the "Send" button appears and is enabled when both tool and query are selected
- [ ] Test the output area appears below when executing a tool

### Side Panel Persistence
- [ ] Navigate to different websites while side panel is open
- [ ] Switch between browser tabs
- [ ] Open new tabs (Ctrl+T)
- [ ] Verify side panel remains open and persistent across all navigation

### Connection Status
- [ ] Check the connection status indicator at the bottom
- [ ] Verify it shows "Connected" or "Disconnected" with appropriate colored dot

## Step 3: Test Settings Page

### Access Settings
- [ ] Click the Settings (gear) icon in the side panel header
- [ ] Verify it opens the options page in a new tab
- [ ] Check that the side panel remains open while settings tab is active
- [ ] Check that the page loads without errors

### Tabbed Interface
- [ ] Verify 4 tabs are present: General, Tools, Appearance, Advanced
- [ ] Click each tab to ensure they switch properly
- [ ] Check that tab content loads correctly

### General Tab
- [ ] Test server URL configuration
- [ ] Try the "Test Connection" button
- [ ] Toggle auto-connect setting

### Tools Tab
- [ ] Verify all 14 tools have configuration cards
- [ ] Test enabling/disabling tools with the toggle switches
- [ ] Modify tool settings:
  - [ ] Change Max Tokens value
  - [ ] Adjust Temperature slider
  - [ ] Change Output Format dropdown
  - [ ] Add custom prompt text
- [ ] Verify changes are reflected in the UI

### Appearance Tab
- [ ] Test theme selection (Light, Dark, Auto)
- [ ] Verify theme buttons respond to clicks

### Advanced Tab
- [ ] Test GitHub Integration toggle
- [ ] Test Notifications toggle
- [ ] Test Cache toggle
- [ ] Adjust Max Concurrent Tasks slider
- [ ] Test Debug Mode toggle

### Settings Persistence
- [ ] Make changes to various settings
- [ ] Click "Save Settings" button
- [ ] Verify "Saved!" confirmation appears
- [ ] Reload the page and check settings are preserved
- [ ] Test "Reset to Defaults" button

## Step 4: Test Functionality

### Tool Execution Flow
- [ ] Open the side panel
- [ ] Select a tool from the dropdown
- [ ] Attach a test file (optional)
- [ ] Enter a query
- [ ] Click "Send" button
- [ ] Verify "Executing..." state appears
- [ ] Check that output appears in the output area

### Error Handling
- [ ] Try executing without selecting a tool
- [ ] Try executing without entering a query
- [ ] Verify appropriate validation

### Side Panel Persistence Testing
- [ ] Open multiple browser tabs with the side panel open
- [ ] Navigate to different websites in each tab
- [ ] Verify side panel remains consistently open
- [ ] Test opening new windows and verify side panel behavior

## Step 5: Visual and UX Testing

### Design Consistency
- [ ] Verify glass morphism design is maintained
- [ ] Check that all components use consistent styling
- [ ] Verify proper spacing and typography
- [ ] Test responsive behavior within popup constraints

### Accessibility
- [ ] Test keyboard navigation through the interface
- [ ] Verify all interactive elements are accessible
- [ ] Check that icons have proper labels

### Performance
- [ ] Test side panel opening speed
- [ ] Verify smooth animations and transitions
- [ ] Check that settings page loads quickly
- [ ] Test side panel responsiveness during tab switching

## Troubleshooting

### Common Issues
1. **Extension not loading**: Check that dist folder contains all required files
2. **Side panel not opening**: Verify manifest.json has correct side_panel configuration
3. **Settings not saving**: Check browser console for storage errors
4. **Tools not executing**: Verify MCP server connection
5. **Side panel closes unexpectedly**: This shouldn't happen - report as bug

### Debug Steps
1. Open Chrome DevTools (F12)
2. Check Console tab for errors
3. Inspect Network tab for failed requests
4. Use Sources tab to debug extension code

## Expected Results

After completing all tests, you should have:
- ✅ A fully functional side panel with tools dropdown and file attachment
- ✅ Persistent side panel that remains open across tabs and navigation
- ✅ A comprehensive settings page with tool-specific configurations
- ✅ Proper error handling and validation
- ✅ Consistent glass design aesthetic optimized for side panel
- ✅ All 14 AI development tools accessible and configurable

## Next Steps

Once testing is complete:
1. Document any issues found
2. Test with actual MCP server connection
3. Validate tool execution with real workflows
4. Consider user feedback and iterate on design
