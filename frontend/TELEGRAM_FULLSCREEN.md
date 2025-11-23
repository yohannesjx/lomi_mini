# Telegram Mini App Fullscreen Mode

## ✅ Implementation Complete

Fullscreen mode has been implemented for your Telegram Mini App. The app will automatically enter fullscreen mode when opened from Telegram, providing an immersive experience without Telegram UI bars.

## 🚀 Features

- **Automatic Fullscreen**: App enters fullscreen mode on launch
- **Fullscreen Control**: Functions to request/exit fullscreen programmatically
- **Fullscreen Hook**: React hook to manage fullscreen state
- **State Tracking**: Monitor fullscreen status

## 📖 Usage

### Automatic Fullscreen (Default)

The app automatically requests fullscreen mode when initialized. This happens in:
- `App.tsx` - On app startup
- `initializeTelegramWebApp()` - When explicitly called

### Manual Control

#### Using Functions

```typescript
import { requestFullscreen, exitFullscreen, isFullscreen } from './src/utils/telegram';

// Request fullscreen
requestFullscreen();

// Exit fullscreen
exitFullscreen();

// Check if in fullscreen
const fullscreen = isFullscreen();
```

#### Using React Hook

```typescript
import { useTelegramFullscreen } from './src/utils/telegram';

function MyComponent() {
    const { isFullscreen, requestFullscreen, exitFullscreen, toggleFullscreen } = useTelegramFullscreen();

    return (
        <View>
            <Text>Fullscreen: {isFullscreen ? 'Yes' : 'No'}</Text>
            <Button onPress={toggleFullscreen} title="Toggle Fullscreen" />
        </View>
    );
}
```

### Disable Auto-Fullscreen

If you want to disable automatic fullscreen:

```typescript
// In App.tsx or WelcomeScreen
initializeTelegramWebApp({ enableFullscreen: false });
```

## 🎯 Use Cases

### Games & Media Apps
Fullscreen mode is perfect for:
- **Games**: Immersive gameplay without UI distractions
- **Video Players**: Full-screen video viewing
- **Photo Viewers**: Full-screen image galleries
- **Dating Apps**: Focused swiping experience (like Lomi Social!)

### When to Use Fullscreen

✅ **Use fullscreen for:**
- Main app experience (swiping, browsing)
- Media consumption (photos, videos)
- Games and interactive content
- Immersive experiences

❌ **Don't use fullscreen for:**
- Settings screens (users might need Telegram UI)
- Help/Support screens
- Onboarding (first-time users might be confused)

## 🔧 API Reference

### Functions

#### `requestFullscreen(): boolean`
Requests fullscreen mode. Returns `true` if successful.

#### `exitFullscreen(): boolean`
Exits fullscreen mode. Returns `true` if successful.

#### `isFullscreen(): boolean`
Checks if app is currently in fullscreen mode.

### Hook

#### `useTelegramFullscreen()`
Returns:
- `isFullscreen: boolean` - Current fullscreen state
- `requestFullscreen: () => void` - Request fullscreen
- `exitFullscreen: () => void` - Exit fullscreen
- `toggleFullscreen: () => void` - Toggle fullscreen state

## 📱 Example: Fullscreen Toggle Button

```typescript
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useTelegramFullscreen } from '../utils/telegram';

export const FullscreenToggle = () => {
    const { isFullscreen, toggleFullscreen } = useTelegramFullscreen();

    return (
        <TouchableOpacity onPress={toggleFullscreen} style={styles.button}>
            <Text>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</Text>
        </TouchableOpacity>
    );
};
```

## ⚠️ Notes

1. **Telegram Only**: Fullscreen mode only works when the app is opened from Telegram
2. **User Control**: Users can exit fullscreen by swiping down (on mobile)
3. **Platform Support**: Fullscreen is supported on all Telegram platforms (iOS, Android, Desktop)
4. **Automatic**: The app automatically enters fullscreen on launch for best UX

## 🧪 Testing

1. Open your bot in Telegram
2. Launch the Mini App
3. App should automatically enter fullscreen (no top/bottom bars)
4. Test toggle functionality if implemented

## 🎨 Benefits for Lomi Social

- **Immersive Swiping**: Full-screen card experience
- **Better Photos**: Full-screen profile viewing
- **Focused Experience**: No distractions from Telegram UI
- **Professional Look**: More app-like, less web-like

