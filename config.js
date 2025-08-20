// API Configuration
window.API_CONFIG = {
    getBaseUrl: function() {
        // 本番環境 - 本社サーバーに直接アクセス（一時的な解決策）
        if (window.location.hostname.includes('pages.dev')) {
            // CORSエラーを避けるため、現在は直接アクセス不可
            // 後でプロキシサーバーのURLに置き換える
            return 'http://192.168.6.26:3001';
        }
        // 開発環境
        return 'http://localhost:3001';
    },
    timeout: 30000,
    retries: 3
};

console.log('API Base URL:', window.API_CONFIG.getBaseUrl());
