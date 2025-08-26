const CACHE_NAME = 'shorelore-v1.0.0';
const STATIC_CACHE_NAME = 'shorelore-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'shorelore-dynamic-v1.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/src/App.jsx',
    '/public/manifest.json',
    '/public/icons/icon-192x192.png',
    '/public/icons/icon-512x512.png',
    // CDN resources
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/react@18/umd/react.development.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    'https://unpkg.com/@babel/standalone/babel.min.js'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static files:', error);
            })
    );
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                // Take control of all clients immediately
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip cross-origin requests that we don't control
    if (url.origin !== location.origin && !STATIC_FILES.includes(request.url)) {
        return;
    }
    
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    console.log('[SW] Serving from cache:', request.url);
                    return cachedResponse;
                }
                
                // Otherwise fetch from network
                return fetch(request)
                    .then((response) => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response as it can only be consumed once
                        const responseToCache = response.clone();
                        
                        // Cache the fetched resource
                        caches.open(DYNAMIC_CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });
                        
                        console.log('[SW] Fetched and cached:', request.url);
                        return response;
                    })
                    .catch(() => {
                        // If network fails, try to serve a fallback page for navigation requests
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                        
                        // For other requests, you could return a fallback resource
                        return new Response('Offline - Content not available', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Background sync for offline posts (when browser supports it)
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-posts') {
        event.waitUntil(
            syncOfflinePosts()
        );
    }
});

// Function to sync offline posts when back online
async function syncOfflinePosts() {
    try {
        // In a real app, this would sync with a backend server
        // For now, we'll just log that sync would happen
        console.log('[SW] Syncing offline posts...');
        
        // Get offline posts from IndexedDB
        const db = await openDB();
        const transaction = db.transaction(['offline_posts'], 'readonly');
        const store = transaction.objectStore('offline_posts');
        const offlinePosts = await store.getAll();
        
        if (offlinePosts.length > 0) {
            console.log(`[SW] Found ${offlinePosts.length} offline posts to sync`);
            // In a real app: send to server, then delete from offline_posts store
        }
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Helper function to open IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ShoreLoreDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Message handling for manual cache updates
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'UPDATE_CACHE') {
        // Force cache update
        caches.delete(STATIC_CACHE_NAME)
            .then(() => caches.delete(DYNAMIC_CACHE_NAME))
            .then(() => {
                return caches.open(STATIC_CACHE_NAME);
            })
            .then((cache) => {
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                event.ports[0].postMessage({ success: true });
            })
            .catch((error) => {
                event.ports[0].postMessage({ success: false, error: error.message });
            });
    }
});

// Push notification handling (for future features)
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'New activity in your fishing community!',
        icon: '/public/icons/icon-192x192.png',
        badge: '/public/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: 'shorelore-notification',
        actions: [
            {
                action: 'view',
                title: 'View',
                icon: '/public/icons/icon-192x192.png'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('ShoreLore', options)
    );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

console.log('[SW] Service worker loaded successfully');