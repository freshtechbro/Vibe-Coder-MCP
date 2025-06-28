# Side Panel Troubleshooting Guide 🔧

This guide helps resolve issues with the Chrome extension side panel not appearing.

## 🐛 Common Issues & Solutions

### **Issue 1: Side Panel Not Opening When Clicking Extension Icon**

**Symptoms:**
- Clicking the extension icon does nothing
- No side panel appears on the right side of the browser
- No errors in console

**Solutions:**

#### ✅ **Solution A: Check Chrome Version**
- **Minimum Required**: Chrome 114+ (Side Panel API introduced)
- **Check Version**: `chrome://version/`
- **Update Chrome**: If below version 114

#### ✅ **Solution B: Reload Extension**
1. Go to `chrome://extensions/`
2. Find "Repotools" extension
3. Click the **refresh/reload** icon
4. Try clicking the extension icon again

#### ✅ **Solution C: Check Permissions**
1. Go to `chrome://extensions/`
2. Click "Details" on Repotools extension
3. Verify permissions include "Side Panel"
4. If missing, reload the extension

#### ✅ **Solution D: Clear Extension Data**
1. Go to `chrome://extensions/`
2. Click "Details" on Repotools extension
3. Click "Extension options" → "Reset to Defaults"
4. Reload the extension

### **Issue 2: Side Panel Opens But Shows Blank/Error**

**Symptoms:**
- Side panel opens but content doesn't load
- White/blank side panel
- Console errors in side panel

**Solutions:**

#### ✅ **Check Console Errors**
1. Right-click in the side panel area
2. Select "Inspect" 
3. Check Console tab for errors
4. Look for specific error messages

#### ✅ **Common Error Fixes**
- **"Failed to load resource"**: Rebuild extension (`npm run build`)
- **"Module not found"**: Check if all dependencies installed
- **"Permission denied"**: Verify manifest permissions

### **Issue 3: Extension Icon Missing/Not Visible**

**Symptoms:**
- Extension installed but icon not in toolbar
- Can't find extension to click

**Solutions:**

#### ✅ **Pin Extension to Toolbar**
1. Click the **puzzle piece icon** (Extensions) in Chrome toolbar
2. Find "Repotools" in the dropdown
3. Click the **pin icon** next to it
4. Extension icon should appear in toolbar

#### ✅ **Check Extension Status**
1. Go to `chrome://extensions/`
2. Verify "Repotools" is **enabled** (toggle switch on)
3. Check for any error messages

## 🔧 Advanced Troubleshooting

### **Check Service Worker Status**
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Details" on Repotools
4. Click "Inspect views: service worker"
5. Check console for errors

### **Verify Manifest Configuration**
The manifest should include:
```json
{
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "sidepanel/index.html"
  }
}
```

### **Test in Incognito Mode**
1. Open incognito window
2. Go to `chrome://extensions/`
3. Enable "Allow in incognito" for Repotools
4. Test side panel functionality

## 🚀 Step-by-Step Reset Process

If nothing else works, try this complete reset:

1. **Remove Extension**
   - Go to `chrome://extensions/`
   - Click "Remove" on Repotools

2. **Clear Chrome Data** (Optional)
   - `chrome://settings/clearBrowserData`
   - Clear "Cookies and other site data"

3. **Rebuild Extension**
   ```bash
   cd chrome-extension
   npm run build
   ```

4. **Reinstall Extension**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

5. **Test Side Panel**
   - Click the extension icon
   - Verify side panel opens

## 🔍 Debugging Commands

### **Check Extension Status**
```javascript
// In browser console
chrome.management.getAll().then(extensions => {
  console.log(extensions.filter(ext => ext.name.includes('Repotools')));
});
```

### **Check Side Panel API**
```javascript
// In extension service worker console
console.log('Side Panel API available:', !!chrome.sidePanel);
console.log('Chrome version:', navigator.userAgent);
```

### **Test Side Panel Opening**
```javascript
// In extension service worker console
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  chrome.sidePanel.open({
    tabId: tabs[0].id,
    windowId: tabs[0].windowId
  });
});
```

## 📋 Verification Checklist

Before reporting issues, verify:

- [ ] **Chrome Version**: 114 or higher
- [ ] **Extension Enabled**: Toggle is ON in chrome://extensions/
- [ ] **Extension Pinned**: Icon visible in toolbar
- [ ] **Permissions Granted**: "Side Panel" permission present
- [ ] **No Console Errors**: Check both page and extension consoles
- [ ] **Fresh Build**: Extension rebuilt with `npm run build`
- [ ] **Service Worker Active**: No errors in service worker console

## 🆘 Still Not Working?

If the side panel still doesn't appear after trying all solutions:

1. **Check Browser Compatibility**
   - Try in a different Chrome profile
   - Test on another computer
   - Verify Chrome version compatibility

2. **Report the Issue**
   - Include Chrome version
   - Include console error messages
   - Include steps you've already tried
   - Include screenshot of chrome://extensions/ page

3. **Temporary Workaround**
   - Use the popup interface instead
   - Access settings via right-click → Options

## ✅ Expected Behavior

When working correctly:
1. Click extension icon in toolbar
2. Side panel opens on right side of browser
3. Shows Repotools interface with tools dropdown
4. Side panel persists across tab navigation
5. Can be closed by clicking the X in side panel header

The side panel should be approximately 320-400px wide and full browser height.
