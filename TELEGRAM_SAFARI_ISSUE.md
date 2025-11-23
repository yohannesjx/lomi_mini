# Telegram Opening Mini App in Safari Instead of In-App Browser

## Problem

Even when opening from Telegram, the Mini App opens in Safari with:
- `platform: "unknown"`
- `userAgent: "Safari"`
- `initData: missing`

## Root Causes

### 1. BotFather Configuration Issue

**Check your Mini App URL in BotFather:**
```
1. Open @BotFather
2. Send /myapps
3. Select your bot
4. Check "Web App URL"
```

**Common Issues:**
- URL is HTTP instead of HTTPS
- URL has wrong domain
- URL format is incorrect

### 2. Telegram Settings

**On iPhone:**
- Settings → Safari → Advanced → Website Data
- Clear Telegram data if corrupted

**On Android:**
- Settings → Apps → Telegram → Clear Cache

### 3. Mini App Not Properly Configured

The Mini App might not be set as the default action. Check:
- Bot menu shows your Mini App
- Mini App opens when clicked (not external browser)

## Solutions

### Solution 1: Reconfigure Mini App in BotFather

```
1. Open @BotFather
2. Send /myapps
3. Select your bot
4. Delete existing Mini App
5. Create new Mini App:
   - Send /newapp
   - Select your bot
   - Title: Lomi Social
   - Short name: lomi
   - Description: Find your Lomi in Ethiopia
   - Photo: Upload icon
   - Web App URL: https://lomi.social/
   - GIF: (optional)
```

### Solution 2: Check Telegram Version

- Update Telegram to latest version
- Old versions might open Mini Apps in external browser

### Solution 3: Test on Different Device

- Try on another phone
- Try on Telegram Desktop
- Try on different Telegram account

### Solution 4: Verify HTTPS

Make sure your site has valid HTTPS:
```bash
curl -I https://lomi.social
# Should return 200 OK
```

## Debugging

Check the actual URL when opening:
1. Open Mini App from Telegram
2. If it opens in Safari, check the URL bar
3. Should see: `https://lomi.social/?tgWebAppData=...`
4. If no `tgWebAppData` parameter, Telegram isn't passing initData

## Expected Behavior

**✅ CORRECT:**
- Opens in Telegram's in-app browser
- `platform: "ios"` or `"android"`
- `initData` is present
- URL has `tgWebAppData` parameter

**❌ WRONG:**
- Opens in Safari
- `platform: "unknown"`
- `initData` is missing
- No Telegram parameters in URL

## If Still Not Working

1. **Delete and recreate Mini App** in BotFather
2. **Update Telegram app**
3. **Try on different device/account**
4. **Check if HTTPS certificate is valid**
5. **Verify domain matches exactly** in BotFather

