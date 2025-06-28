# Side Panel Testing Guide 🎯

This guide helps you test the Chrome extension's new side panel interface that replaces the traditional popup.

## 🚀 Quick Setup

1. **Reload Extension** (if already loaded):
   - Go to `chrome://extensions/`
   - Click the refresh icon on the Repotools extension
   - Or remove and re-add the extension

2. **Load Extension** (if not loaded):
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## 🎯 Side Panel Testing

### **Test 1: Extension Icon Click**
- [ ] Click the Repotools extension icon in the Chrome toolbar
- [ ] **Expected**: Side panel opens on the right side of the browser
- [ ] **Expected**: No popup window appears
- [ ] **Expected**: Side panel shows the redesigned interface

### **Test 2: Side Panel Interface**
- [ ] **Header**: Verify compact header with logo and navigation icons
- [ ] **Tools Dropdown**: All 14 AI tools available in dropdown
- [ ] **File Attachment**: Paperclip icon for file uploads
- [ ] **Input Field**: Query input with placeholder text
- [ ] **Send Button**: Enabled when tool and query are selected
- [ ] **Quick Start Guide**: Helpful 4-step instructions
- [ ] **Connection Status**: Shows at bottom with colored indicator

### **Test 3: Side Panel Dimensions**
- [ ] **Width**: Side panel is approximately 320-400px wide
- [ ] **Height**: Full browser height
- [ ] **Responsive**: Interface adapts to side panel constraints
- [ ] **Scrolling**: Content scrolls smoothly if needed
- [ ] **Text Wrapping**: Long text wraps appropriately

### **Test 4: Persistence Testing**
- [ ] **Tab Navigation**: 
  - Open side panel
  - Switch to different browser tabs
  - **Expected**: Side panel remains open
- [ ] **Website Navigation**:
  - Open side panel
  - Navigate to different websites
  - **Expected**: Side panel stays persistent
- [ ] **New Tab**:
  - Open side panel
  - Open new tab (Ctrl+T)
  - **Expected**: Side panel visible in new tab
- [ ] **Window Focus**:
  - Open side panel
  - Click outside Chrome window
  - Return to Chrome
  - **Expected**: Side panel still open

### **Test 5: Functionality Testing**
- [ ] **Tool Selection**: Select different tools from dropdown
- [ ] **File Attachment**: 
  - Click paperclip icon
  - Select test files
  - Verify files appear below dropdown
  - Remove files using X button
- [ ] **Query Input**: Type queries and test Enter key
- [ ] **Tool Execution**: Test Send button (may show connection errors - expected)
- [ ] **Output Display**: Verify output area appears when tool executes

### **Test 6: Settings Access**
- [ ] Click Settings (gear) icon in side panel header
- [ ] **Expected**: Options page opens in new tab
- [ ] **Expected**: Side panel remains open while settings tab is active
- [ ] Test settings functionality in new tab
- [ ] Return to original tab with side panel

### **Test 7: Glass Design**
- [ ] **Backdrop Blur**: Cards have glass morphism effect
- [ ] **Transparency**: Semi-transparent backgrounds
- [ ] **Borders**: Subtle white borders on glass elements
- [ ] **Shadows**: Proper depth with shadows
- [ ] **Consistency**: Design matches original popup aesthetic

## 🔧 Advanced Testing

### **Multi-Window Testing**
- [ ] Open multiple Chrome windows
- [ ] Test side panel in each window
- [ ] Verify independent side panel states

### **Incognito Mode**
- [ ] Open incognito window
- [ ] Test extension availability (if enabled for incognito)
- [ ] Test side panel functionality

### **Performance Testing**
- [ ] **Opening Speed**: Side panel opens quickly (<500ms)
- [ ] **Smooth Animations**: No janky transitions
- [ ] **Memory Usage**: No obvious memory leaks
- [ ] **CPU Usage**: Reasonable resource consumption

## 🐛 Common Issues & Solutions

### **Side Panel Not Opening**
- **Issue**: Clicking extension icon does nothing
- **Solution**: Check manifest.json has side_panel configuration
- **Solution**: Verify service worker is running
- **Solution**: Reload extension

### **Interface Looks Broken**
- **Issue**: Layout appears incorrect
- **Solution**: Check CSS is loading properly
- **Solution**: Verify all components imported correctly
- **Solution**: Check browser console for errors

### **Side Panel Closes Unexpectedly**
- **Issue**: Side panel disappears when navigating
- **Solution**: This shouldn't happen - report as bug
- **Solution**: Check Chrome version compatibility
- **Solution**: Verify side panel API usage

### **Tools Not Working**
- **Issue**: Tool execution fails
- **Expected**: This is normal without MCP server connection
- **Solution**: Check connection status indicator
- **Solution**: Verify error handling shows appropriate messages

## 📊 Testing Checklist Summary

### ✅ **Core Functionality**
- [ ] Extension icon opens side panel (not popup)
- [ ] Side panel shows redesigned interface
- [ ] All 14 tools available in dropdown
- [ ] File attachment works
- [ ] Input/output interface functional
- [ ] Settings accessible from side panel

### ✅ **Persistence**
- [ ] Side panel remains open across tabs
- [ ] Side panel persists during website navigation
- [ ] Side panel available in new tabs
- [ ] Side panel survives window focus changes

### ✅ **Design & UX**
- [ ] Glass morphism design maintained
- [ ] Responsive layout for side panel width
- [ ] Smooth animations and transitions
- [ ] Consistent typography and spacing
- [ ] Proper error handling and feedback

### ✅ **Performance**
- [ ] Fast opening and closing
- [ ] Smooth scrolling and interactions
- [ ] No memory leaks or performance issues
- [ ] Reasonable resource usage

## 🎉 Success Criteria

**The side panel implementation is successful if:**

1. ✅ **No Popup**: Extension icon opens side panel, not popup
2. ✅ **Full Functionality**: All features from popup work in side panel
3. ✅ **Persistence**: Side panel remains open during browsing
4. ✅ **Design Consistency**: Glass aesthetic maintained
5. ✅ **Responsive**: Interface works well in side panel constraints
6. ✅ **Performance**: Fast and smooth user experience

## 📝 Bug Report Template

**If you find issues, use this template:**

**Issue**: Brief description
**Steps to Reproduce**: 
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**: What should happen
**Actual Behavior**: What actually happens
**Browser**: Chrome version
**Extension Version**: v1.0.0
**Console Errors**: Any errors in browser console

## 🚀 Next Steps

After successful testing:
1. Document any issues found
2. Test with actual MCP server connection
3. Gather user feedback on side panel experience
4. Consider additional side panel optimizations

---

**Happy Testing! The side panel should provide a much more persistent and accessible interface for your AI development tools.** 🎯
