#!/bin/bash

echo "🚀 Production optimization..."

# Minify CSS files
if command -v cssnano &> /dev/null; then
    echo "📦 Minifying CSS..."
    for css_file in *.css; do
        if [ -f "$css_file" ]; then
            cssnano "$css_file" "${css_file%.css}.min.css"
        fi
    done
fi

# Update HTML to use minified CSS
if [ -f "index.html" ]; then
    sed -i.bak 's/\.css/\.min\.css/g' index.html
fi

# Create service worker for offline support
cat > sw.js << 'JS_EOF'
const CACHE_NAME = 'ai-chat-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles-enhanced.min.css',
  '/aiyu-styles-v2.min.css',
  '/app-enhanced.js',
  '/config.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
JS_EOF

# Register service worker in HTML
if [ -f "index.html" ]; then
    sed -i.bak '/<\/body>/i\
    <script>\
      if ("serviceWorker" in navigator) {\
        navigator.serviceWorker.register("/sw.js");\
      }\
    </script>' index.html
fi

echo "✅ Production optimization complete"
