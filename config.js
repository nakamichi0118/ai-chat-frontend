// API Configuration
window.API_CONFIG = {
    getBaseUrl: function() {
        // 本番環境 - Cloudflare Workers経由
        if (window.location.hostname.includes('pages.dev')) {
            return 'https://ai-chat-backend-full.masakazu199018.workers.dev';
        }
        // ローカル開発環境
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        // 社内ネットワーク
        return 'http://192.168.6.26:3001';
    },
    timeout: 30000,
    retries: 3
};

console.log('API Base URL:', window.API_CONFIG.getBaseUrl());
