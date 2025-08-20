// API Configuration for production deployment
const API_BASE_URL = 'https://your-api-gateway-url.amazonaws.com/prod';

// Development fallback
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE_URL = 'http://localhost:3001';
}

// Export configuration
window.API_CONFIG = {
    baseURL: API_BASE_URL,
    timeout: 30000,
    retries: 3
};

console.log('API Base URL:', API_BASE_URL);
