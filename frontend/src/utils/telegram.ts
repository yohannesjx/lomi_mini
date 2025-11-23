// Telegram WebApp SDK integration
// This works in Telegram Mini App environment

import { useState, useEffect } from 'react';

declare global {
    interface Window {
        Telegram?: {
            WebApp: {
                initData: string;
                initDataUnsafe: {
                    user?: {
                        id: number;
                        first_name: string;
                        last_name?: string;
                        username?: string;
                        language_code?: string;
                        is_premium?: boolean;
                    };
                };
                version: string;
                platform: string;
                colorScheme: 'light' | 'dark';
                themeParams: {
                    bg_color?: string;
                    text_color?: string;
                    hint_color?: string;
                    link_color?: string;
                    button_color?: string;
                    button_text_color?: string;
                };
                isExpanded: boolean;
                viewportHeight: number;
                viewportStableHeight: number;
                headerColor: string;
                backgroundColor: string;
                isClosingConfirmationEnabled: boolean;
                BackButton: {
                    isVisible: boolean;
                    onClick: (callback: () => void) => void;
                    offClick: (callback: () => void) => void;
                    show: () => void;
                    hide: () => void;
                };
                MainButton: {
                    text: string;
                    color: string;
                    textColor: string;
                    isVisible: boolean;
                    isActive: boolean;
                    isProgressVisible: boolean;
                    setText: (text: string) => void;
                    onClick: (callback: () => void) => void;
                    offClick: (callback: () => void) => void;
                    show: () => void;
                    hide: () => void;
                    enable: () => void;
                    disable: () => void;
                    showProgress: (leaveActive?: boolean) => void;
                    hideProgress: () => void;
                    setParams: (params: {
                        text?: string;
                        color?: string;
                        text_color?: string;
                        is_active?: boolean;
                        is_visible?: boolean;
                    }) => void;
                };
                HapticFeedback: {
                    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
                    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
                    selectionChanged: () => void;
                };
                CloudStorage: {
                    setItem: (key: string, value: string, callback?: (error: Error | null, success: boolean) => void) => void;
                    getItem: (key: string, callback: (error: Error | null, value: string | null) => void) => void;
                    getItems: (keys: string[], callback: (error: Error | null, values: Record<string, string>) => void) => void;
                    removeItem: (key: string, callback?: (error: Error | null, success: boolean) => void) => void;
                    removeItems: (keys: string[], callback?: (error: Error | null, success: boolean) => void) => void;
                    getKeys: (callback: (error: Error | null, keys: string[]) => void) => void;
                };
                ready: () => void;
                expand: () => void;
                close: () => void;
                enableClosingConfirmation: () => void;
                disableClosingConfirmation: () => void;
                onEvent: (eventType: string, eventHandler: () => void) => void;
                offEvent: (eventType: string, eventHandler: () => void) => void;
                sendData: (data: string) => void;
                openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
                openTelegramLink: (url: string) => void;
                openInvoice: (url: string, callback?: (status: string) => void) => void;
                // Note: showPopup may not be available in all Telegram WebApp versions
                showPopup?: (params: {
                    title?: string;
                    message: string;
                    buttons?: Array<{
                        id?: string;
                        type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
                        text?: string;
                    }>;
                }, callback?: (id: string) => void) => void;
                showAlert?: (message: string, callback?: () => void) => void;
                showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
                showScanQrPopup: (params: {
                    text?: string;
                }, callback?: (data: string) => void) => void;
                closeScanQrPopup: () => void;
                readTextFromClipboard: (callback?: (text: string) => void) => void;
                requestWriteAccess: (callback?: (granted: boolean) => void) => void;
                requestContact: (callback?: (granted: boolean) => void) => void;
                // Fullscreen mode
                requestFullscreen: () => void;
                exitFullscreen: () => void;
                isFullscreen: boolean;
            };
        };
    }
}

export const getTelegramWebApp = () => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        return window.Telegram.WebApp;
    }
    return null;
};

export const getTelegramInitData = (): string | null => {
    const webApp = getTelegramWebApp();
    
    // Check if WebApp exists and has initData
    if (webApp) {
        // initData might be available directly
        if (webApp.initData && webApp.initData.length > 0) {
            console.log('✅ Found initData in webApp.initData');
            return webApp.initData;
        }
        
        // In Telegram WebApp 6.0+, initData might be empty string initially
        // Check if we can get it from the URL or other sources
        console.log('⚠️ webApp.initData is empty, checking other sources...');
    }
    
    // Try to get from window.location (Telegram passes it in URL)
    if (typeof window !== 'undefined' && window.location) {
        // Check query parameters
        const params = new URLSearchParams(window.location.search);
        const tgWebAppData = params.get('tgWebAppData');
        if (tgWebAppData) {
            console.log('✅ Found initData in URL query params');
            return decodeURIComponent(tgWebAppData);
        }
        
        // Check hash
        const hash = window.location.hash;
        if (hash.includes('tgWebAppData=')) {
            const match = hash.match(/tgWebAppData=([^&]+)/);
            if (match) {
                console.log('✅ Found initData in URL hash');
                return decodeURIComponent(match[1]);
            }
        }
        
        // Try to get from window.location.href (full URL)
        const fullUrl = window.location.href;
        const urlMatch = fullUrl.match(/[?&#]tgWebAppData=([^&]+)/);
        if (urlMatch) {
            console.log('✅ Found initData in full URL');
            return decodeURIComponent(urlMatch[1]);
        }
    }
    
    // Last resort: Try to get from Telegram WebApp's internal state
    // Some versions store it differently
    if (webApp && (webApp as any).initDataRaw) {
        console.log('✅ Found initData in initDataRaw');
        return (webApp as any).initDataRaw;
    }
    
    console.warn('❌ initData not found in any source');
    return null;
};

export const getTelegramUser = () => {
    const webApp = getTelegramWebApp();
    return webApp?.initDataUnsafe?.user || null;
};

export const initializeTelegramWebApp = (options?: { enableFullscreen?: boolean }) => {
    const webApp = getTelegramWebApp();
    if (webApp) {
        // Initialize Telegram WebApp
        webApp.ready();
        webApp.expand();
        
        // Enable closing confirmation
        webApp.enableClosingConfirmation();
        
        // Set viewport height
        if (webApp.viewportHeight) {
            document.documentElement.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`);
        }
        
        // Request fullscreen mode if enabled (default: true)
        if (options?.enableFullscreen !== false && typeof webApp.requestFullscreen === 'function') {
            webApp.requestFullscreen();
            console.log('✅ Fullscreen mode enabled');
        }
    }
};

// Normalize URL by removing trailing slash for comparison
const normalizeUrl = (url: string): string => {
    return url.replace(/\/+$/, ''); // Remove trailing slashes
};

// Check if running in Telegram WebApp
export const isTelegramWebApp = (): boolean => {
    if (typeof window === 'undefined') return false;
    
    // Check if Telegram WebApp object exists
    if (window.Telegram?.WebApp) {
        return true;
    }
    
    // Check URL parameters (handle both with and without trailing slash)
    const url = normalizeUrl(window.location.href);
    const search = window.location.search;
    const hash = window.location.hash;
    
    if (search.includes('tgWebApp') || hash.includes('tgWebApp')) {
        return true;
    }
    
    // Check if URL matches Telegram Mini App pattern
    // Telegram may add parameters to the URL
    if (url.includes('tgWebApp') || search.includes('tgWebAppData')) {
        return true;
    }
    
    // Check user agent (Telegram's in-app browser has specific user agent)
    const ua = navigator.userAgent;
    if (ua.includes('Telegram') || 
        ua.includes('TelegramBot') ||
        // Telegram iOS uses WebKit with specific patterns
        (ua.includes('iPhone') && (search.includes('tgWebApp') || hash.includes('tgWebApp')))) {
        return true;
    }
    
    return false;
};

// Get detailed Telegram WebApp info for debugging
export const getTelegramDebugInfo = () => {
    const webApp = getTelegramWebApp();
    const info: any = {
        webAppExists: !!webApp,
        hasInitData: !!(webApp?.initData && webApp.initData.length > 0),
        initDataLength: webApp?.initData?.length || 0,
        platform: webApp?.platform || 'unknown',
        version: webApp?.version || 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        url: typeof window !== 'undefined' ? window.location.href : 'N/A',
        search: typeof window !== 'undefined' ? window.location.search : 'N/A',
        hash: typeof window !== 'undefined' ? window.location.hash : 'N/A',
        isTelegramWebApp: isTelegramWebApp(),
    };
    
    // Check for initData in various places
    if (webApp) {
        info.initDataRaw = webApp.initData || '';
        info.hasInitDataUnsafe = !!webApp.initDataUnsafe;
        info.hasUser = !!webApp.initDataUnsafe?.user;
        
        // Try to get from URL
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            info.urlHasTgWebAppData = params.has('tgWebAppData');
            
            const hash = window.location.hash;
            info.hashHasTgWebAppData = hash.includes('tgWebAppData');
        }
    }
    
    return info;
};

export const useTelegramHaptic = () => {
    const webApp = getTelegramWebApp();
    return {
        impact: (style: 'light' | 'medium' | 'heavy' = 'medium') => {
            webApp?.HapticFeedback.impactOccurred(style);
        },
        notification: (type: 'error' | 'success' | 'warning') => {
            webApp?.HapticFeedback.notificationOccurred(type);
        },
        selection: () => {
            webApp?.HapticFeedback.selectionChanged();
        },
    };
};

/**
 * Request fullscreen mode
 * Expands the app to cover the entire device screen, removing Telegram UI bars
 */
export const requestFullscreen = (): boolean => {
    const webApp = getTelegramWebApp();
    if (webApp && webApp.requestFullscreen && typeof webApp.requestFullscreen === 'function') {
        try {
            webApp.requestFullscreen();
            console.log('✅ Fullscreen mode requested');
            return true;
        } catch (error) {
            // Method might not be supported in this version
            console.warn('⚠️ Fullscreen not supported in this Telegram WebApp version:', error);
            return false;
        }
    }
    console.warn('⚠️ Fullscreen not available (method not supported or not in Telegram WebApp)');
    return false;
};

/**
 * Exit fullscreen mode
 * Returns the app to normal mode with Telegram UI bars visible
 */
export const exitFullscreen = (): boolean => {
    const webApp = getTelegramWebApp();
    if (webApp && typeof webApp.exitFullscreen === 'function') {
        try {
            webApp.exitFullscreen();
            console.log('✅ Exited fullscreen mode');
            return true;
        } catch (error) {
            console.error('Failed to exit fullscreen:', error);
            return false;
        }
    }
    console.warn('⚠️ Fullscreen not available (not in Telegram WebApp)');
    return false;
};

/**
 * Check if app is currently in fullscreen mode
 */
export const isFullscreen = (): boolean => {
    const webApp = getTelegramWebApp();
    return webApp?.isFullscreen || false;
};

/**
 * Hook to manage fullscreen mode
 * Returns functions to toggle fullscreen and check current state
 */
export const useTelegramFullscreen = () => {
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);

    useEffect(() => {
        const webApp = getTelegramWebApp();
        if (webApp) {
            // Check initial state
            setIsFullscreenMode(webApp.isFullscreen || false);

            // Listen for fullscreen changes
            const handleFullscreenChange = () => {
                setIsFullscreenMode(webApp.isFullscreen || false);
            };

            // Telegram WebApp doesn't have a direct event for fullscreen changes
            // We'll check periodically or use viewport changes as a proxy
            const checkInterval = setInterval(() => {
                if (webApp.isFullscreen !== isFullscreenMode) {
                    setIsFullscreenMode(webApp.isFullscreen || false);
                }
            }, 500);

            return () => clearInterval(checkInterval);
        }
    }, []);

    return {
        isFullscreen: isFullscreenMode,
        requestFullscreen: () => {
            if (requestFullscreen()) {
                setIsFullscreenMode(true);
            }
        },
        exitFullscreen: () => {
            if (exitFullscreen()) {
                setIsFullscreenMode(false);
            }
        },
        toggleFullscreen: () => {
            if (isFullscreenMode) {
                exitFullscreen();
                setIsFullscreenMode(false);
            } else {
                requestFullscreen();
                setIsFullscreenMode(true);
            }
        },
    };
};

