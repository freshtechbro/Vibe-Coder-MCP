# Visual Testing Checklist ✅

Use this checklist to systematically test the redesigned Chrome extension UI.

## 🚀 Initial Setup

- [ ] Extension built successfully (`npm run build`)
- [ ] Test setup script passed (`npm run test:setup`)
- [ ] Chrome Developer mode enabled
- [ ] Extension loaded from `dist` folder
- [ ] Extension appears in Chrome toolbar

## 🎨 Popup Interface Testing

### Header Layout
- [ ] **Logo**: Repotools logo with blue gradient background
- [ ] **Title**: "Repotools" text appears next to logo
- [ ] **Navigation Icons**: Four icons in top-right corner
  - [ ] Plus (+) icon - opens side panel
  - [ ] Clock icon - placeholder for future feature
  - [ ] Gamepad icon - placeholder for future feature  
  - [ ] Settings (gear) icon - opens options page

### Tools Dropdown
- [ ] **Dropdown Trigger**: Shows "Select a tool..." placeholder
- [ ] **Dropdown Opens**: Clicking shows all 14 tools
- [ ] **Tool Icons**: Each tool has appropriate icon
- [ ] **Tool Selection**: Clicking a tool updates the dropdown
- [ ] **All 14 Tools Present**:
  - [ ] Research (🔍)
  - [ ] Generate Rules (🛡️)
  - [ ] Generate PRD (📄)
  - [ ] Generate User Stories (👥)
  - [ ] Generate Task List (☑️)
  - [ ] Generate Fullstack Starter Kit (📦)
  - [ ] Run Workflow (▶️)
  - [ ] Get Job Result (⬇️)
  - [ ] Map Codebase (🗺️)
  - [ ] Vibe Task Manager (🧠)
  - [ ] Curate Context (📝)
  - [ ] Register Agent (👤➕)
  - [ ] Get Agent Tasks (📋)
  - [ ] Submit Task Response (📤)

### File Attachment
- [ ] **Paperclip Icon**: Visible next to dropdown
- [ ] **File Picker**: Clicking opens file selection dialog
- [ ] **File Display**: Selected files appear below dropdown
- [ ] **File Names**: Show correct file names
- [ ] **Remove Files**: X button removes individual files
- [ ] **Multiple Files**: Can attach multiple files

### Input/Output Interface
- [ ] **Query Input**: Text input with "What can I help you with?" placeholder
- [ ] **Send Button**: Appears below input, enabled when tool + query selected
- [ ] **Output Area**: Appears below when tool executes
- [ ] **Loading State**: Shows "Executing..." during tool execution
- [ ] **Error Handling**: Shows errors appropriately

### Connection Status
- [ ] **Status Indicator**: Dot and text at bottom of popup
- [ ] **Connected State**: Green dot + "Connected" text
- [ ] **Disconnected State**: Red dot + "Disconnected" text
- [ ] **Version Info**: "v1.0.0" shown on right

## ⚙️ Settings Page Testing

### Page Access
- [ ] **Settings Icon**: Clicking opens options page in new tab
- [ ] **Page Load**: Settings page loads without errors
- [ ] **Header**: "Repotools Settings" with gear icon

### Tab Navigation
- [ ] **Four Tabs**: General, Tools, Appearance, Advanced
- [ ] **Tab Icons**: Each tab has appropriate icon
- [ ] **Tab Switching**: Clicking tabs changes content
- [ ] **Active State**: Current tab is highlighted

### General Tab
- [ ] **Server Configuration Card**: Blue server icon
- [ ] **Server URL Input**: Text input for server URL
- [ ] **Test Connection Button**: Clickable button
- [ ] **Auto-connect Toggle**: Enable/disable button

### Tools Tab
- [ ] **Tool Grid**: 2-column layout on desktop
- [ ] **14 Tool Cards**: One card per tool
- [ ] **Tool Icons**: Each card shows tool icon
- [ ] **Enable/Disable Toggle**: Switch for each tool
- [ ] **Configuration Fields**:
  - [ ] Max Tokens (number input)
  - [ ] Temperature (number input with decimals)
  - [ ] Output Format (dropdown: JSON, Markdown, Text)
  - [ ] Custom Prompt (textarea)

### Appearance Tab
- [ ] **Theme Selection**: Light, Dark, Auto buttons
- [ ] **Active Theme**: Current selection highlighted
- [ ] **Theme Icons**: Palette icon in header

### Advanced Tab
- [ ] **Features Card**: Shield icon
- [ ] **GitHub Integration**: Toggle button
- [ ] **Notifications**: Toggle button
- [ ] **Cache**: Toggle button
- [ ] **Performance Card**: Bell icon
- [ ] **Max Concurrent Tasks**: Slider (1-10)
- [ ] **Debug Mode**: Toggle button

### Settings Actions
- [ ] **Save Button**: Bottom right, shows save states
- [ ] **Reset Button**: Bottom left, resets to defaults
- [ ] **Documentation Link**: Opens GitHub in new tab
- [ ] **Save Feedback**: Shows "Saved!" or "Error!" states

## 🎯 Functionality Testing

### Tool Execution Flow
- [ ] **Complete Flow**: Select tool → attach file → enter query → execute
- [ ] **Validation**: Cannot execute without tool and query
- [ ] **Loading State**: Shows executing state
- [ ] **Output Display**: Results appear in output area
- [ ] **Error Handling**: Shows meaningful error messages

### File Attachment Flow
- [ ] **File Selection**: Can browse and select files
- [ ] **File Preview**: Shows selected file names
- [ ] **File Removal**: Can remove individual files
- [ ] **Multiple Files**: Supports multiple file selection

### Settings Persistence
- [ ] **Save Settings**: Changes persist after save
- [ ] **Page Reload**: Settings maintained after reload
- [ ] **Reset Function**: Reset button restores defaults

## 🎨 Visual Design Testing

### Glass Morphism Design
- [ ] **Backdrop Blur**: Elements have proper blur effects
- [ ] **Transparency**: Cards have semi-transparent backgrounds
- [ ] **Shadows**: Proper glass shadows on cards
- [ ] **Borders**: Subtle white borders on glass elements

### Typography & Spacing
- [ ] **Font Consistency**: Consistent font family throughout
- [ ] **Text Hierarchy**: Clear heading and body text distinction
- [ ] **Spacing**: Generous spacing between elements
- [ ] **Alignment**: Proper alignment of text and elements

### Colors & Gradients
- [ ] **Primary Gradient**: Blue to purple gradient on buttons
- [ ] **Icon Colors**: Consistent icon coloring
- [ ] **Status Colors**: Green for success, red for errors
- [ ] **Text Colors**: Proper contrast for readability

### Responsive Behavior
- [ ] **Popup Constraints**: Works within 480x700px popup
- [ ] **Settings Page**: Responsive on different screen sizes
- [ ] **Text Wrapping**: Long text wraps appropriately
- [ ] **Scroll Behavior**: Smooth scrolling where needed

## 🔧 Technical Testing

### Performance
- [ ] **Popup Load Time**: Opens quickly (<500ms)
- [ ] **Settings Load Time**: Page loads quickly
- [ ] **Smooth Animations**: No janky transitions
- [ ] **Memory Usage**: No obvious memory leaks

### Browser Compatibility
- [ ] **Chrome Latest**: Works in latest Chrome
- [ ] **Developer Tools**: No console errors
- [ ] **Extension APIs**: All Chrome APIs work correctly

### Error Handling
- [ ] **Network Errors**: Graceful handling of connection issues
- [ ] **Invalid Input**: Proper validation messages
- [ ] **Missing Permissions**: Clear permission requests

## 📱 User Experience Testing

### Accessibility
- [ ] **Keyboard Navigation**: Can navigate with keyboard
- [ ] **Focus Indicators**: Clear focus states
- [ ] **Screen Reader**: Proper labels and descriptions
- [ ] **Color Contrast**: Sufficient contrast ratios

### Usability
- [ ] **Intuitive Flow**: Easy to understand interface
- [ ] **Clear Labels**: All buttons and inputs clearly labeled
- [ ] **Feedback**: Clear feedback for user actions
- [ ] **Error Recovery**: Easy to recover from errors

## ✅ Final Validation

- [ ] **All Core Features Work**: Tools, files, settings function
- [ ] **Visual Design Consistent**: Matches mockup design
- [ ] **No Critical Bugs**: No blocking issues found
- [ ] **Performance Acceptable**: Smooth and responsive
- [ ] **Ready for Production**: Extension is stable and usable

---

## 📝 Notes Section

Use this space to document any issues found during testing:

**Issues Found:**
- [ ] Issue 1: _Description_
- [ ] Issue 2: _Description_
- [ ] Issue 3: _Description_

**Suggestions:**
- [ ] Suggestion 1: _Description_
- [ ] Suggestion 2: _Description_

**Overall Rating:** ⭐⭐⭐⭐⭐ (1-5 stars)
