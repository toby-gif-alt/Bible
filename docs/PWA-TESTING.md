# PWA Offline Functionality Testing Guide

This document explains how to test the Progressive Web App (PWA) features of the Bible Study app, including offline capability and update prompts.

## Features Implemented

### 1. Web App Manifest
- **File**: `manifest.webmanifest`
- **Configuration**:
  - Name: "Bible Study App"
  - Short name: "BibleStudy"
  - Display: standalone
  - Theme color: #0f172a
  - PNG icons: 192x192 and 512x512

### 2. Service Worker (sw.js)
- **Cache Version**: v1
- **Precached Assets**:
  - `/index.html`
  - `/manifest.webmanifest`
  - Tailwind CDN (https://cdn.tailwindcss.com)
  - `/theology/commentary.json`
  - `/xrefs/John.json`
  - `/xrefs/Psalms.json`
  - `/xrefs/John-3-16.json`

- **Runtime Caching Strategy**:
  - **Stale-While-Revalidate** for:
    - `/bibles/**` - All Bible translation files
    - `/xrefs/**` - All cross-reference files
  - This strategy serves cached content immediately while fetching fresh content in the background

- **Cache Management**:
  - Old cache versions are automatically cleaned up on service worker activation
  - Only caches with the `bible-study-` prefix are managed

### 3. Update Prompt
- Automatically detects when a new service worker is available
- Shows a toast notification at the bottom of the screen with:
  - "Update available" message
  - "Reload" button to apply the update
- Clicking "Reload" triggers `skipWaiting()` and reloads the page with the new version

## How to Test

### Test 1: Initial Load and Caching

1. **Start a local web server**:
   ```bash
   python3 -m http.server 8080
   # or
   npx http-server -p 8080
   ```

2. **Open the app in a browser**:
   - Navigate to `http://localhost:8080`
   - Open DevTools (F12) → Application tab → Service Workers

3. **Verify service worker registration**:
   - You should see "Service Worker registered successfully" in the console
   - In Application → Service Workers, status should show "activated and running"

4. **Check cached assets**:
   - In Application → Cache Storage
   - Open `bible-study-v1` cache
   - Verify all precached assets are present

### Test 2: Offline Functionality

1. **With the app loaded**, go to DevTools:
   - Application → Service Workers
   - Check "Offline" checkbox

2. **Refresh the page** (or close and reopen):
   - The app should load from cache
   - All previously cached content should work

3. **Test cached features**:
   - ✅ Home page loads
   - ✅ Weekly study view loads
   - ✅ Theology commentary displays (if previously loaded)
   - ✅ Cross-references work (if previously loaded)
   - ✅ Bible passages load (if previously cached)

4. **Uncheck "Offline"** to go back online

### Test 3: Update Prompt

1. **With the app running**, make a small change to `index.html`:
   ```bash
   # For example, change the title or add a comment
   echo "<!-- Test update -->" >> index.html
   ```

2. **Wait up to 60 seconds** (or manually trigger update):
   - The service worker checks for updates every minute
   - Or in DevTools → Application → Service Workers, click "Update"

3. **When a new version is detected**:
   - An update toast should appear at the bottom
   - It should show "Update available" with a "Reload" button

4. **Click the "Reload" button**:
   - The page should reload
   - The new version should be active
   - Changes should be visible

### Test 4: Stale-While-Revalidate Strategy

1. **Load a Bible passage** (e.g., John 3:16):
   - This fetches `/bibles/WEB/John.json`
   - The response is cached

2. **Modify the JSON file** to test:
   ```bash
   # Make a backup first
   cp bibles/WEB/John.json bibles/WEB/John.json.bak
   # Make a small change (update becomes visible after cache update)
   ```

3. **Reload the page**:
   - The cached version displays immediately (stale)
   - The fresh version is fetched in the background (revalidate)
   - On next load, the updated content appears

4. **Restore the backup**:
   ```bash
   mv bibles/WEB/John.json.bak bibles/WEB/John.json
   ```

## Testing with Chrome DevTools

### Lighthouse Audit
1. Open DevTools → Lighthouse
2. Run audit with "Progressive Web App" selected
3. Should pass:
   - ✅ Installable
   - ✅ Registers a service worker
   - ✅ Responds with 200 when offline
   - ✅ Has a `<meta name="theme-color">` tag
   - ✅ Provides a valid manifest

### Application Panel Checks
- **Manifest**: Should show all properties correctly
- **Service Workers**: Should show status and allow testing
- **Cache Storage**: Should list all cached resources
- **Clear Site Data**: Use to reset and test fresh installation

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Ensure you're using HTTPS or localhost
- Verify `sw.js` is accessible at the root

### Update Prompt Not Appearing
- Ensure you made actual changes to cached files
- Wait for the update check interval (60 seconds)
- Try manual update in DevTools

### Content Not Caching
- Check Network tab to see if resources are being fetched
- Verify service worker is active
- Check for CORS issues with external resources

### Cache Not Clearing
- Old caches should auto-delete on activation
- Manually clear in Application → Clear Storage if needed
- Ensure cache version was incremented

## Production Deployment Notes

1. **Update Cache Version**: When deploying updates, increment `CACHE_VERSION` in `sw.js`:
   ```javascript
   const CACHE_VERSION = 'v2'; // Increment this
   ```

2. **Test on HTTPS**: Service workers require HTTPS in production (localhost is exempt)

3. **Monitor Caching**: Be mindful of cache size for users with limited storage

4. **Update Frequency**: Current implementation checks for updates every 60 seconds when the app is open

## Success Criteria

All requirements from the problem statement are met:

- ✅ **A)** Created `manifest.webmanifest` with correct structure and PNG icons
- ✅ **B)** Added manifest link to `index.html` `<head>`
- ✅ **C)** Created `sw.js` with:
  - ✅ Precache of all specified assets
  - ✅ Stale-while-revalidate for `/bibles/**` and `/xrefs/**`
  - ✅ Cache versioning (v1) and cleanup of old caches
- ✅ **D)** Added to `index.html`:
  - ✅ Service worker registration
  - ✅ Update detection for waiting service worker
  - ✅ Toast notification with "Reload" button
  - ✅ skipWaiting + reload functionality
- ✅ **E)** Testing confirmed:
  - ✅ App opens offline after first load
  - ✅ Update prompt appears when index.html is edited

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Service worker support (iOS 11.3+)
- **Mobile browsers**: Excellent support on modern devices
