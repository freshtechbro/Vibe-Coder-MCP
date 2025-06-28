# Chrome Extension Loading Issues - Troubleshooting Guide

## 🚨 Common Loading Errors and Solutions

### Error: "Could not load background script 'background/service-worker.js'"

**Symptoms:**
- Extension fails to load in Chrome
- Error message about missing background script
- Chrome shows "Could not load manifest" error

**Root Cause:**
The manifest.json file references file paths that don't match the actual build output structure.

**Solution Steps:**

#### 1. Check Current File Structure
```bash
cd chrome-extension
ls -la dist/background/
ls -la dist/content/
```

#### 2. Verify Manifest Paths
Check `dist/manifest.json` for these sections:
```json
{
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "js": ["content/github-integration.js"]
    }
  ]
}
```

#### 3. Fix Build Configuration
If files are in nested directories (e.g., `background/background/service-worker.js`), update `vite.config.ts`:

```typescript
// In rollupOptions.input, change from:
'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
'content/github-integration': resolve(__dirname, 'src/content/github-integration.ts'),

// To:
'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
'github-integration': resolve(__dirname, 'src/content/github-integration.ts'),
```

And update the `entryFileNames` function:
```typescript
entryFileNames: (chunkInfo) => {
  const facadeModuleId = chunkInfo.facadeModuleId;
  if (facadeModuleId?.includes('service-worker')) {
    return 'background/service-worker.js';
  }
  if (facadeModuleId?.includes('github-integration')) {
    return 'content/github-integration.js';
  }
  return 'assets/[name]-[hash].js';
},
```

#### 4. Rebuild Extension
```bash
npm run clean
npm run build
```

#### 5. Verify Fix
```bash
node scripts/dev-helper.js check
```

### Error: "Could not load manifest"

**Symptoms:**
- Extension won't load at all
- Chrome shows manifest parsing errors

**Common Causes & Solutions:**

#### Invalid JSON Syntax
- Check for trailing commas
- Verify all quotes are properly closed
- Use a JSON validator

#### Missing Required Fields
Ensure manifest.json has:
```json
{
  "manifest_version": 3,
  "name": "Extension Name",
  "version": "1.0.0",
  "action": {
    "default_popup": "popup/index.html"
  }
}
```

#### Incorrect File Paths
- All referenced files must exist in dist folder
- Paths are relative to the extension root
- No leading slashes in paths

## 🔧 Quick Fix Commands

### Complete Reset and Rebuild
```bash
cd chrome-extension
npm run clean
npm run build
node scripts/dev-helper.js check
```

### Check Extension Structure
```bash
node scripts/dev-helper.js check
```

### Show Extension Info
```bash
node scripts/dev-helper.js info
```

## 📋 Loading Checklist

Before loading in Chrome, verify:

- [ ] `dist/` folder exists
- [ ] `dist/manifest.json` exists and is valid JSON
- [ ] `dist/background/service-worker.js` exists
- [ ] `dist/content/github-integration.js` exists
- [ ] `dist/popup/index.html` exists
- [ ] All icon files exist in `dist/assets/icons/`
- [ ] No build errors in terminal
- [ ] All file paths in manifest match actual files

## 🚀 Loading in Chrome

1. **Open Extensions Page**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle switch in top-right corner

3. **Load Extension**
   - Click "Load unpacked"
   - Select `chrome-extension/dist` folder
   - Click "Select Folder"

4. **Verify Success**
   - Extension appears in list without errors
   - Extension icon appears in toolbar
   - No red error text in extension details

## 🐛 Debug Console Errors

### Background Script Errors
1. Go to `chrome://extensions/`
2. Find your extension
3. Click "Inspect views: background page"
4. Check console for JavaScript errors

### Popup Errors
1. Right-click extension icon
2. Select "Inspect popup"
3. Check console for errors

### Content Script Errors
1. Open any GitHub page
2. Open DevTools (F12)
3. Check console for content script errors

## 📞 Getting Help

If issues persist:

1. **Check Build Output**
   ```bash
   npm run build
   ```
   Look for any error messages

2. **Verify Dependencies**
   ```bash
   npm install
   npm audit
   ```

3. **Check File Permissions**
   Ensure all files in `dist/` are readable

4. **Try Different Chrome Profile**
   Test with a fresh Chrome profile

5. **Check Chrome Version**
   Ensure you're using Chrome 88+ for Manifest V3

## 🔄 Development Workflow

For ongoing development:

1. **Use Watch Mode**
   ```bash
   npm run dev
   ```

2. **After Changes**
   - Save your files (watch mode rebuilds automatically)
   - Go to `chrome://extensions/`
   - Click refresh icon on your extension
   - Test your changes

3. **Before Committing**
   ```bash
   npm run validate
   npm run build
   node scripts/dev-helper.js check
   ```

## ✅ Success Indicators

Extension is working correctly when:
- ✅ Loads without errors in Chrome
- ✅ Extension icon appears in toolbar
- ✅ Popup opens when clicking icon
- ✅ No console errors in any context
- ✅ All features function as expected
