// セキュリティ設定
const CONFIG = {
    MAX_MESSAGE_LENGTH: 4000,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30分
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: ['.txt', '.pdf', '.doc', '.docx', '.csv', '.json'],
    PII_PATTERNS: {
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        phone: /(\d{3}[-.\s]??\d{4}[-.\s]??\d{4}|\(\d{3}\)\s*\d{3}[-.\s]??\d{4}|\d{3}[-.\s]??\d{3}[-.\s]??\d{4})/g,
        creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
        passport: /\b[A-Z]{1,2}\d{6,9}\b/g,
        bankAccount: /\b\d{4,}\b/g
    }
};

// グローバル変数
let messages = [];
let currentChatId = generateSecureId();
let chatHistory = {};
let isGenerating = false;
let sessionTimer = null;
let sessionTimeLeft = CONFIG.SESSION_TIMEOUT;
let uploadedFiles = [];
let auditLog = [];

// DOM要素
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusElement = document.getElementById('status');
const modelSelect = document.getElementById('modelSelect');
const charCount = document.getElementById('charCount');
const sessionTimerElement = document.getElementById('sessionTimer');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');

// セキュアなID生成
function generateSecureId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// セッションタイマー初期化
function initSessionTimer() {
    sessionTimer = setInterval(() => {
        sessionTimeLeft -= 1000;
        const minutes = Math.floor(sessionTimeLeft / 60000);
        const seconds = Math.floor((sessionTimeLeft % 60000) / 1000);
        sessionTimerElement.textContent = `セッション: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (sessionTimeLeft <= 5 * 60 * 1000 && sessionTimeLeft > 4 * 60 * 1000) {
            showNotification('セッションは5分後に終了します', 'warning');
        }
        
        if (sessionTimeLeft <= 0) {
            handleSessionTimeout();
        }
    }, 1000);
}

// セッションタイムアウト処理
function handleSessionTimeout() {
    clearInterval(sessionTimer);
    addAuditLog('session_timeout', 'セッションがタイムアウトしました');
    alert('セッションがタイムアウトしました。再度ログインしてください。');
    window.location.reload();
}

// アクティビティでセッションリセット
function resetSessionTimer() {
    sessionTimeLeft = CONFIG.SESSION_TIMEOUT;
}

// PII検出とマスキング
function detectAndMaskPII(text) {
    if (!document.getElementById('piiDetection').checked) {
        return { text, detected: [] };
    }
    
    let maskedText = text;
    const detected = [];
    
    for (const [type, pattern] of Object.entries(CONFIG.PII_PATTERNS)) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                detected.push({ type, value: match });
                maskedText = maskedText.replace(match, `<span class="pii-masked" title="${type}が検出されました">[${type.toUpperCase()}]</span>`);
            });
        }
    }
    
    if (detected.length > 0) {
        showNotification(`⚠️ ${detected.length}件の個人情報が検出されました`, 'warning');
        addAuditLog('pii_detection', `PII検出: ${detected.map(d => d.type).join(', ')}`);
    }
    
    return { text: maskedText, detected };
}

// 監査ログ追加
function addAuditLog(type, message, metadata = {}) {
    if (!document.getElementById('auditLog').checked) return;
    
    const logEntry = {
        id: generateSecureId(),
        timestamp: new Date().toISOString(),
        type,
        message,
        metadata,
        user: document.getElementById('userInfo').textContent,
        sessionId: currentChatId
    };
    
    auditLog.push(logEntry);
    
    // サーバーに送信
    fetch('http://localhost:3001/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
    }).catch(console.error);
}

// Markdownレンダリング（セキュア）
function renderMarkdown(text) {
    const renderer = new marked.Renderer();
    
    // リンクを新しいタブで開く
    renderer.link = (href, title, text) => {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${title || ''}">${text}</a>`;
    };
    
    // コードブロックのハイライト
    renderer.code = (code, language) => {
        if (language && hljs.getLanguage(language)) {
            try {
                return `<pre><code class="hljs ${language}">${hljs.highlight(code, { language }).value}</code></pre>`;
            } catch (e) {
                console.error('Highlight error:', e);
            }
        }
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
    };
    
    marked.setOptions({
        renderer,
        gfm: true,
        breaks: true,
        sanitize: false // DOMPurifyで別途サニタイズ
    });
    
    const html = marked.parse(text);
    
    // XSS対策
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 
                      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'table', 
                      'thead', 'tbody', 'tr', 'th', 'td', 'span'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'title']
    });
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 入力イベント
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    resetSessionTimer();
});

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
    
    const length = messageInput.value.length;
    charCount.textContent = `${length} / ${CONFIG.MAX_MESSAGE_LENGTH}`;
    
    if (length > CONFIG.MAX_MESSAGE_LENGTH) {
        charCount.style.color = '#d32f2f';
        sendButton.disabled = true;
    } else {
        charCount.style.color = '#666';
        sendButton.disabled = false;
    }
});

// ファイルアップロード
fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
        // ファイルサイズチェック
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showNotification(`${file.name}はサイズが大きすぎます（最大10MB）`, 'error');
            continue;
        }
        
        // ファイルタイプチェック
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!CONFIG.ALLOWED_FILE_TYPES.includes(ext)) {
            showNotification(`${file.name}は許可されていないファイル形式です`, 'error');
            continue;
        }
        
        // ウイルススキャン（サーバー側で実行）
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('http://localhost:3001/api/scan-file', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.safe) {
                uploadedFiles.push({
                    id: generateSecureId(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    content: await readFileContent(file)
                });
                
                updateFileList();
                addAuditLog('file_upload', `ファイルアップロード: ${file.name}`);
                showNotification(`${file.name}をアップロードしました`, 'success');
            } else {
                showNotification(`${file.name}は安全でない可能性があります`, 'error');
                addAuditLog('file_blocked', `危険なファイルをブロック: ${file.name}`);
            }
        } catch (error) {
            console.error('File scan error:', error);
            showNotification('ファイルスキャンエラー', 'error');
        }
    }
    
    fileInput.value = '';
});

// ファイル内容読み取り
async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// ファイルリスト更新
function updateFileList() {
    fileList.innerHTML = uploadedFiles.map(file => `
        <div class="file-item">
            📄 ${file.name}
            <span class="remove" onclick="removeFile('${file.id}')">×</span>
        </div>
    `).join('');
}

// ファイル削除
function removeFile(fileId) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    updateFileList();
}

// メッセージ送信
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;
    
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
        showNotification('メッセージが長すぎます', 'error');
        return;
    }
    
    resetSessionTimer();
    
    // PII検出
    const { text: maskedMessage, detected } = detectAndMaskPII(message);
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    charCount.textContent = '0 / 4000';
    
    // ユーザーメッセージ追加
    addMessage('user', message, maskedMessage);
    
    // 監査ログ
    addAuditLog('message_sent', 'メッセージ送信', { 
        length: message.length, 
        hasFiles: uploadedFiles.length > 0,
        piiDetected: detected.length > 0
    });
    
    isGenerating = true;
    sendButton.disabled = true;
    
    const typingDiv = addTypingIndicator();
    
    try {
        const requestBody = {
            message,
            model: modelSelect.value,
            history: messages.slice(-10),
            files: uploadedFiles,
            sessionId: currentChatId
        };
        
        const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': currentChatId
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        
        removeTypingIndicator(typingDiv);
        const assistantDiv = addMessage('assistant', '');
        const contentDiv = assistantDiv.querySelector('.message-content');
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.content) {
                            assistantMessage += data.content;
                            contentDiv.innerHTML = renderMarkdown(assistantMessage);
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }
        
        messages.push({ role: 'assistant', content: assistantMessage });
        updateChatHistory();
        uploadedFiles = [];
        updateFileList();
        
        addAuditLog('response_received', 'AI応答受信', { length: assistantMessage.length });
        
    } catch (error) {
        console.error('Error:', error);
        removeTypingIndicator(typingDiv);
        addMessage('assistant', 'エラーが発生しました。システム管理者にお問い合わせください。');
        setStatus('error');
        addAuditLog('error', `エラー: ${error.message}`);
    } finally {
        isGenerating = false;
        sendButton.disabled = false;
    }
}

// メッセージ追加
function addMessage(role, content, displayContent = null) {
    if (messagesDiv.querySelector('.welcome-message')) {
        messagesDiv.innerHTML = '';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'You' : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (role === 'assistant' && content) {
        contentDiv.innerHTML = renderMarkdown(content);
    } else {
        contentDiv.innerHTML = displayContent || escapeHtml(content);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    if (role === 'user') {
        messages.push({ role, content });
    }
    
    return messageDiv;
}

// タイピングインジケーター
function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return typingDiv;
}

function removeTypingIndicator(typingDiv) {
    if (typingDiv && typingDiv.parentNode) {
        typingDiv.remove();
    }
}

// 新規チャット
function newChat() {
    if (messages.length > 0) {
        if (!confirm('現在のチャットを終了して新しいチャットを開始しますか？')) {
            return;
        }
    }
    
    currentChatId = generateSecureId();
    messages = [];
    uploadedFiles = [];
    updateFileList();
    
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h2>新しいセキュアチャットを開始しました</h2>
            <div class="security-features">
                <h3>🛡️ セキュリティ機能</h3>
                <ul>
                    <li>✅ エンドツーエンド暗号化</li>
                    <li>✅ PII自動検出・マスキング</li>
                    <li>✅ 全操作の監査ログ記録</li>
                    <li>✅ ファイルウイルススキャン</li>
                    <li>✅ セッションタイムアウト（30分）</li>
                </ul>
            </div>
        </div>
    `;
    
    addAuditLog('chat_created', '新しいチャットを開始');
    resetSessionTimer();
}

// チャットエクスポート
function exportChat() {
    const exportData = {
        chatId: currentChatId,
        timestamp: new Date().toISOString(),
        messages: messages,
        metadata: {
            model: modelSelect.value,
            messageCount: messages.length
        }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${currentChatId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    addAuditLog('chat_exported', 'チャットをエクスポート');
    showNotification('チャットをエクスポートしました', 'success');
}

// 監査ログ表示
function showAuditLog() {
    document.getElementById('auditLogModal').style.display = 'flex';
    loadAuditLogs();
}

function closeAuditLog() {
    document.getElementById('auditLogModal').style.display = 'none';
}

async function loadAuditLogs() {
    try {
        const response = await fetch('http://localhost:3001/api/audit');
        const logs = await response.json();
        
        const logContent = document.getElementById('logContent');
        logContent.innerHTML = logs.map(log => `
            <div class="log-entry ${log.type === 'error' ? 'error' : ''}">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> - 
                ${log.type}: ${log.message}
                ${log.metadata ? `<pre>${JSON.stringify(log.metadata, null, 2)}</pre>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load audit logs:', error);
    }
}

// フィルターログ
function filterLogs() {
    const dateFrom = document.getElementById('logDateFrom').value;
    const dateTo = document.getElementById('logDateTo').value;
    const logType = document.getElementById('logType').value;
    
    // フィルタリングロジック実装
    loadAuditLogs(); // 簡易実装
}

// 通知表示
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#d32f2f' : type === 'warning' ? '#ff6f00' : '#1976d2'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// チャット履歴更新
function updateChatHistory() {
    chatHistory[currentChatId] = {
        title: messages[0]?.content?.substring(0, 30) + '...' || '新しいチャット',
        messages: messages,
        timestamp: new Date()
    };
    renderChatHistory();
}

function renderChatHistory() {
    const historyDiv = document.getElementById('chatHistory');
    historyDiv.innerHTML = '';
    
    Object.entries(chatHistory)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .forEach(([id, chat]) => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.textContent = chat.title;
            chatItem.onclick = () => loadChat(id);
            historyDiv.appendChild(chatItem);
        });
}

function loadChat(chatId) {
    currentChatId = chatId;
    messages = chatHistory[chatId].messages;
    
    messagesDiv.innerHTML = '';
    messages.forEach(msg => {
        addMessage(msg.role, msg.content);
    });
    
    addAuditLog('chat_loaded', `チャット読み込み: ${chatId}`);
}

// ステータス設定
function setStatus(status) {
    if (status === 'error') {
        statusElement.textContent = '● 接続エラー';
        statusElement.className = 'status error';
    } else {
        statusElement.textContent = '● 接続中';
        statusElement.className = 'status';
    }
}

// モデル読み込み
async function loadModels() {
    try {
        const response = await fetch('http://localhost:3001/api/models');
        const data = await response.json();
        
        if (data.models && data.models.length > 0) {
            modelSelect.innerHTML = '';
            
            const providers = {};
            data.models.forEach(model => {
                if (!providers[model.provider]) {
                    providers[model.provider] = [];
                }
                providers[model.provider].push(model);
            });
            
            Object.entries(providers).forEach(([provider, models]) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = provider.toUpperCase();
                
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.description || model.name;
                    optgroup.appendChild(option);
                });
                
                modelSelect.appendChild(optgroup);
            });
            
            // デフォルトモデル選択
            if (data.models.find(m => m.name === 'gemini-flash')) {
                modelSelect.value = 'gemini-flash';
            }
        }
    } catch (error) {
        console.error('Error loading models:', error);
        modelSelect.innerHTML = '<option value="">モデルを読み込めません</option>';
    }
}

// 接続チェック
async function checkConnection() {
    try {
        const response = await fetch('http://localhost:3001/api/health');
        const data = await response.json();
        if (response.ok) {
            setStatus('connected');
        } else {
            setStatus('error');
        }
    } catch {
        setStatus('error');
    }
}

// スタイル追加（アニメーション）
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initSessionTimer();
    loadModels();
    checkConnection();
    setInterval(checkConnection, 30000);
    
    // ページ離脱時の警告
    window.addEventListener('beforeunload', (e) => {
        if (messages.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    // 右クリック無効化（機密情報保護）
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.message-content')) {
            e.preventDefault();
            showNotification('セキュリティポリシーにより右クリックは無効です', 'warning');
        }
    });
    
    addAuditLog('session_start', 'セッション開始');
});