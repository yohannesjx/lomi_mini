# Fix Missing Telegram initData

## Problem
Telegram WebApp is detected but `initData` is empty/missing. This prevents authentication.

## Root Cause
The `initData` is only provided when:
1. App is opened **from Telegram** (not in a browser)
2. App is opened **from the bot menu** (not via direct URL)
3. Mini App URL in BotFather is **correct**

## Solution

### 1. Verify BotFather Configuration

Check your Mini App settings:
```
1. Go to @BotFather
2. Send /myapps
3. Select your bot
4. Check Web App URL
```

**Correct URL format:**
- ✅ `https://lomi.social` (with HTTPS)
- ✅ `http://152.53.87.200` (HTTP for testing, but HTTPS preferred)

**Wrong:**
- ❌ `lomi.social` (missing protocol)
- ❌ `https://lomi.social/` (trailing slash can cause issues)

### 2. How to Open the App Correctly

**✅ Correct way:**
1. Open Telegram
2. Search for your bot
3. Open the bot
4. Click the **menu button** (☰) at bottom
5. Click your **Mini App** from the menu

**❌ Wrong ways:**
- Opening URL directly in browser
- Sharing link and opening in browser
- Opening from external link

### 3. Debug initData

Open browser console (in Telegram: Menu → "Open in Browser") and check:

```javascript
// Check if WebApp exists
window.Telegram?.WebApp

// Check initData
window.Telegram?.WebApp?.initData

// Check URL parameters
window.location.search
window.location.hash
```

### 4. Common Issues

#### Issue: initData is empty string
**Cause:** App opened in browser or wrong URL
**Fix:** Open from Telegram bot menu

#### Issue: WebApp not detected
**Cause:** Script not loaded or wrong domain
**Fix:** 
- Check HTTPS is working
- Verify domain matches BotFather URL
- Check browser console for script errors

#### Issue: "platform: unknown"
**Cause:** Telegram WebApp not fully initialized
**Fix:** Wait a moment and try again, or check if opened from Telegram

### 5. Testing Checklist

- [ ] Bot is configured in BotFather
- [ ] Mini App URL is correct (HTTPS)
- [ ] App is opened from Telegram (not browser)
- [ ] App is opened from bot menu (not direct link)
- [ ] Telegram app is up to date
- [ ] HTTPS certificate is valid

### 6. Temporary Workaround

If initData is still missing, you can test the UI flow by:
1. Opening in browser (won't have auth, but UI works)
2. Using dev mode (auto-navigates to ProfileSetup)

But for production, initData **must** be available from Telegram.

## Next Steps

1. **Verify BotFather settings** - Check Mini App URL
2. **Test opening from Telegram** - Use bot menu, not direct link
3. **Check browser console** - Look for initData in logs
4. **Rebuild and deploy** - Latest fixes are in the code

