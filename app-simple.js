// シンプル版 - 履歴機能なし、LocalStorage不使用
console.log('app-simple.js: Loading...');

// グローバル変数（最小限）
let isGenerating = false;

// DOM要素
let messagesDiv;
let messageInput;
let sendButton;
let statusElement;

// アプリ初期化
function initializeApp() {
    console.log('Initializing simple app...');
    
    // DOM要素を取得
    messagesDiv = document.getElementById('messages');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    statusElement = document.getElementById('status');
    
    if (!messagesDiv || !messageInput || !sendButton) {
        console.error('Required DOM elements not found');
        return;
    }
    
    // イベントリスナーの設定
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });
    
    // 接続チェック
    checkConnection();
    setInterval(checkConnection, 30000);
    
    console.log('Simple app initialized');
}

// メッセージ送信
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;
    
    console.log('Sending:', message);
    
    // ウェルカムメッセージを削除
    const welcomeMsg = messagesDiv.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    // ユーザーメッセージを追加
    addMessage('user', message);
    
    // 入力をクリア
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    isGenerating = true;
    sendButton.disabled = true;
    
    // タイピングインジケーター追加
    const typingDiv = addTypingIndicator();
    
    try {
        const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                model: 'gemini-1.5-flash',
                history: [],  // 履歴なし
                useKnowledge: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // SSE（ストリーミング）レスポンスの処理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        
        // タイピングインジケーターを削除
        if (typingDiv) {
            typingDiv.remove();
        }
        
        // アシスタントメッセージ用のdivを作成
        const messageDiv = addMessage('assistant', '');
        const contentDiv = messageDiv.querySelector('.message-content');
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') {
                        break;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.content) {
                            assistantMessage += data.content;
                            // Markdownをレンダリング
                            try {
                                const html = marked.parse(assistantMessage);
                                contentDiv.innerHTML = DOMPurify.sanitize(html);
                            } catch (e) {
                                contentDiv.textContent = assistantMessage;
                            }
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        }
                    } catch (e) {
                        // JSONパースエラーは無視（部分的なデータの可能性）
                        console.debug('Partial data:', jsonStr);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        if (typingDiv) {
            typingDiv.remove();
        }
        addMessage('assistant', 'エラーが発生しました: ' + error.message);
    } finally {
        isGenerating = false;
        sendButton.disabled = false;
    }
}

// メッセージ追加
function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'You' : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (role === 'assistant' && content) {
        // Markdownレンダリング
        try {
            const html = marked.parse(content);
            contentDiv.innerHTML = DOMPurify.sanitize(html);
        } catch (e) {
            contentDiv.textContent = content;
        }
    } else {
        contentDiv.textContent = content;
    }
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString();
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestamp);
    messagesDiv.appendChild(messageDiv);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // メッセージdivを返す（SSE処理で使用）
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

// 接続チェック
async function checkConnection() {
    try {
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
            setStatus('connected');
        } else {
            setStatus('error');
        }
    } catch {
        setStatus('error');
    }
}

// ステータス設定
function setStatus(status) {
    if (!statusElement) return;
    
    if (status === 'error') {
        statusElement.textContent = '● オフライン';
        statusElement.className = 'status error';
    } else {
        statusElement.textContent = '● 接続中';
        statusElement.className = 'status';
    }
}

// グローバル関数として公開
window.sendMessage = sendMessage;

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    initializeApp();
});

console.log('app-simple.js: Loaded successfully');