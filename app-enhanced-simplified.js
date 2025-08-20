// 最小限の動作確認版
console.log('app-enhanced.js: Script loading started');

// URLパラメータを取得
const urlParams = new URLSearchParams(window.location.search);
const noHistory = urlParams.get('nohistory') === 'true';
const debugMode = urlParams.get('debug') === 'true';

if (noHistory) {
    console.warn('📌 履歴機能無効モードで起動');
}
if (debugMode) {
    console.warn('🐛 デバッグモードで起動');
}

// チャットID生成（先に定義）
function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2);
}

// グローバル変数
let messages = [];
let currentChatId = generateChatId();  // 関数定義後に呼び出し
let chatHistory = {};
let isGenerating = false;
let availableModels = [];
let userProfile = {};
let companyKnowledge = [];
let lastMessageTime = 0;  // 重複送信防止用

// 機能フラグ
let isKnowledgeEnabled = false;
let isVoiceEnabled = false;
let isSpeakEnabled = false;

// 音声認識と合成
let recognition = null;
let synthesis = window.speechSynthesis;
let isRecording = false;

// DOM要素（DOMContentLoaded後に初期化）
let messagesDiv;
let messageInput;
let sendButton;
let statusElement;
let modelSelect;

// Markdownレンダラー
let markdownRenderer = null;

console.log('app-enhanced.js: Global variables initialized');

// 新しいチャットを開始
function startNewChat() {
    console.log('🆕 新しいチャットを開始');
    
    // 現在の会話を履歴に保存
    if (messages.length > 0) {
        chatHistory[currentChatId] = [...messages];
        saveToLocalStorage();
    }
    
    // 新しいチャットIDを生成
    currentChatId = generateChatId();
    messages = [];
    
    // UIをクリア
    if (messagesDiv) {
        messagesDiv.innerHTML = '';
    }
    if (messageInput) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }
    
    // ウェルカム画面を表示
    showWelcomeScreen();
    
    // ローカルストレージを更新
    saveToLocalStorage();
    
    console.log('✅ 新しいチャット準備完了');
}

// ウェルカム画面表示
function showWelcomeScreen() {
    if (!messagesDiv) return;
    
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h2>AIアシスタントへようこそ</h2>
            <p>何でもお聞きください。</p>
            <div class="info" style="margin-top: 20px;">
                <p>📝 <strong>Markdown対応</strong> - 表やコードブロックがきれいに表示されます</p>
                <p>💾 <strong>自動保存</strong> - 会話は自動的に保存されます</p>
                <p>📚 <strong>社内ナレッジ</strong> - 登録したドキュメントを自動参照します</p>
            </div>
        </div>
    `;
}

// メッセージ送信
async function sendMessage() {
    if (!messageInput || !messagesDiv) {
        console.error('Required DOM elements not found');
        return;
    }
    
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;
    
    // 重複送信防止（1秒以内の連続送信を防ぐ）
    const now = Date.now();
    if (now - lastMessageTime < 1000) {
        console.warn('送信が速すぎます。1秒待ってください。');
        return;
    }
    lastMessageTime = now;
    
    console.log('Sending message:', message);
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    addMessage('user', message);
    
    isGenerating = true;
    if (sendButton) sendButton.disabled = true;
    
    const typingDiv = addTypingIndicator();
    
    try {
        const selectedModel = modelSelect ? modelSelect.value : 'gemini-1.5-flash';
        console.log('ModelSelect element:', modelSelect);
        console.log('Selected model value:', selectedModel);
        console.log('Available models:', availableModels);
        
        const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                model: selectedModel,
                history: messages.slice(-10),
                useKnowledge: isKnowledgeEnabled
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // タイピングインジケーターを削除
        if (typingDiv && typingDiv.parentNode) {
            typingDiv.remove();
        }
        
        // SSE（ストリーミング）レスポンスの処理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        
        // アシスタントメッセージ用のdivを作成
        const messageDiv = addMessage('assistant', '', false);
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
                            if (contentDiv) {
                                contentDiv.innerHTML = renderMarkdown(assistantMessage);
                                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                            }
                        }
                    } catch (e) {
                        // JSONパースエラーは無視
                        console.debug('Partial data:', jsonStr);
                    }
                }
            }
        }
        
        // 完了後、メッセージを保存
        if (assistantMessage) {
            messages.push({ 
                role: 'assistant', 
                content: assistantMessage,
                timestamp: Date.now()
            });
            saveToLocalStorage();
        }
        
    } catch (error) {
        console.error('Error:', error);
        if (typingDiv && typingDiv.parentNode) {
            typingDiv.remove();
        }
        addMessage('assistant', 'エラーが発生しました: ' + error.message);
    } finally {
        isGenerating = false;
        if (sendButton) sendButton.disabled = false;
    }
}

// メッセージ追加
function addMessage(role, content, save = true) {
    if (!messagesDiv) return;
    
    if (messagesDiv.querySelector('.welcome-message')) {
        messagesDiv.innerHTML = '';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? (userProfile.name || 'You') : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (role === 'assistant' && content) {
        contentDiv.innerHTML = renderMarkdown(content);
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
    
    if (role === 'user' && save) {
        messages.push({ 
            role, 
            content,
            timestamp: Date.now()
        });
    }
    
    // 読み上げ機能
    if (role === 'assistant' && isSpeakEnabled && content) {
        speakText(content);
    }
    
    return messageDiv;
}

// タイピングインジケーター追加
function addTypingIndicator() {
    if (!messagesDiv) return null;
    
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

// Markdownレンダリング
function renderMarkdown(text) {
    if (!window.marked) {
        return text;
    }
    
    try {
        const html = marked.parse(text);
        return DOMPurify.sanitize(html);
    } catch (e) {
        console.error('Markdown render error:', e);
        return text;
    }
}

// テキスト読み上げ
function speakText(text) {
    if (!synthesis) return;
    
    // Markdownやコードブロックを除去
    const cleanText = text.replace(/```[\s\S]*?```/g, 'コードブロック')
                          .replace(/[#*`_~\[\]()]/g, '')
                          .substring(0, 500);
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    synthesis.speak(utterance);
}

// ローカルストレージから読み込み
function loadFromLocalStorage() {
    // 履歴無効モードの場合はスキップ
    if (noHistory) {
        console.log('履歴無効モード: LocalStorage読み込みをスキップ');
        messages = [];
        return;
    }
    
    try {
        const saved = localStorage.getItem('chatData');
        if (saved) {
            // データサイズチェック（1MB以上は危険）
            if (saved.length > 1024 * 1024) {
                console.error(`データサイズが大きすぎます (${(saved.length / 1024 / 1024).toFixed(2)}MB)`);
                localStorage.removeItem('chatData');
                messages = [];
                return;
            }
            
            const data = JSON.parse(saved);
            messages = data.messages || [];
            
            // メッセージ数が異常に多い場合はクリア
            if (messages.length > 50) {
                console.warn(`メッセージ数が多すぎます (${messages.length}件), 最新20件のみ保持`);
                messages = messages.slice(-20);
            }
            
            // 重複メッセージを削除
            messages = removeDuplicateMessages(messages);
            
            currentChatId = data.currentChatId || generateChatId();
            chatHistory = data.chatHistory || {};
            userProfile = data.userProfile || {};
        }
    } catch (e) {
        console.error('LocalStorage読み込みエラー:', e);
        // エラー時はLocalStorageをクリア
        localStorage.removeItem('chatData');
        messages = [];
    }
}

// 重複メッセージを削除
function removeDuplicateMessages(msgs) {
    const seen = new Set();
    return msgs.filter(msg => {
        const key = `${msg.role}:${msg.content}:${msg.timestamp || ''}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

// ローカルストレージに保存
function saveToLocalStorage() {
    // 履歴無効モードの場合はスキップ
    if (noHistory) {
        return;
    }
    
    try {
        // メッセージ数の上限チェック（厳格化）
        if (messages.length > 30) {
            console.warn('メッセージ数制限: 最新20件のみ保持');
            messages = messages.slice(-20);
        }
        
        // 重複メッセージを削除
        messages = removeDuplicateMessages(messages);
        
        const data = {
            messages: messages.map(m => ({
                role: m.role,
                content: m.content.substring(0, 5000), // 各メッセージ最大5000文字
                timestamp: m.timestamp
            })),
            currentChatId,
            chatHistory: {}, // 履歴は保存しない（メモリ節約）
            userProfile
        };
        
        const jsonStr = JSON.stringify(data);
        
        // データサイズチェック（500KB以上は保存しない）
        if (jsonStr.length > 500 * 1024) {
            console.error('保存データが大きすぎます。クリアします。');
            localStorage.removeItem('chatData');
            messages = [];
            return;
        }
        
        localStorage.setItem('chatData', JSON.stringify(data));
    } catch (e) {
        console.error('LocalStorage保存エラー:', e);
        // 保存エラー時はLocalStorageをクリア
        localStorage.removeItem('chatData');
    }
}

// モデル一覧を取得
async function loadModels() {
    try {
        const response = await fetch('http://localhost:3001/api/models');
        if (response.ok) {
            const data = await response.json();
            availableModels = data.models || [];
            updateModelSelect();
        }
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// モデル選択を更新
function updateModelSelect() {
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';
    availableModels.forEach((model, index) => {
        const option = document.createElement('option');
        option.value = model.name;  // id ではなく name を使用
        option.textContent = model.description || model.name;  // description があれば表示
        // Gemini 1.5 Flashをデフォルトに設定
        if (model.name === 'gemini-1.5-flash' || index === 0) {
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });
    console.log('Model select updated with', availableModels.length, 'models');
    console.log('Default selected model:', modelSelect.value);
}

// プロファイル読み込み
function loadUserProfile() {
    const saved = localStorage.getItem('userProfile');
    if (saved) {
        try {
            userProfile = JSON.parse(saved);
        } catch (e) {
            console.error('Error loading profile:', e);
        }
    }
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

// トグル機能の実装
window.toggleKnowledge = function() {
    isKnowledgeEnabled = !isKnowledgeEnabled;
    const btn = document.getElementById('knowledgeToggle');
    const status = document.getElementById('knowledgeStatus');
    
    if (btn) {
        if (isKnowledgeEnabled) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    if (status) {
        status.style.display = isKnowledgeEnabled ? 'inline-block' : 'none';
    }
    
    localStorage.setItem('knowledgeEnabled', isKnowledgeEnabled);
    console.log('ナレッジ機能:', isKnowledgeEnabled ? '有効' : '無効');
}

window.toggleVoice = function() {
    isVoiceEnabled = !isVoiceEnabled;
    const btn = document.getElementById('voiceToggle');
    
    if (btn) {
        if (isVoiceEnabled) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    localStorage.setItem('voiceEnabled', isVoiceEnabled);
    console.log('音声入力:', isVoiceEnabled ? '有効' : '無効');
}

window.toggleSpeak = function() {
    isSpeakEnabled = !isSpeakEnabled;
    const btn = document.getElementById('speakToggle');
    
    if (btn) {
        if (isSpeakEnabled) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    localStorage.setItem('speakEnabled', isSpeakEnabled);
    console.log('読み上げ:', isSpeakEnabled ? '有効' : '無効');
}

window.startVoiceInput = function() {
    console.log('音声入力機能は実装中です');
}

// LocalStorageを完全にクリアする関数
function clearAllData() {
    console.log('Clearing all data from LocalStorage...');
    localStorage.clear();
    messages = [];
    chatHistory = {};
    currentChatId = generateChatId();
    if (messagesDiv) {
        messagesDiv.innerHTML = '';
        showWelcomeScreen();
    }
    console.log('All data cleared');
}

// グローバル関数として公開
window.sendMessage = sendMessage;
window.newChat = startNewChat;
window.clearAllData = clearAllData;  // デバッグ用

// アプリ初期化
async function initializeApp() {
    console.log('🚀 アプリケーションを初期化中...');
    
    // DOM要素を取得
    messagesDiv = document.getElementById('messages');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    statusElement = document.getElementById('status');
    modelSelect = document.getElementById('modelSelect');
    
    // 要素が取得できているか確認
    console.log('DOM要素の状態:');
    console.log('  messagesDiv:', messagesDiv ? 'OK' : 'NG');
    console.log('  messageInput:', messageInput ? 'OK' : 'NG');
    console.log('  sendButton:', sendButton ? 'OK' : 'NG');
    console.log('  statusElement:', statusElement ? 'OK' : 'NG');
    console.log('  modelSelect:', modelSelect ? 'OK' : 'NG');
    
    if (!messagesDiv || !messageInput || !sendButton) {
        console.error('❌ 必須のDOM要素が見つかりません');
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
    
    // データ読み込み
    loadFromLocalStorage();
    loadUserProfile();
    await loadModels();  // モデルリストを待機
    checkConnection();
    
    // 定期処理
    setInterval(checkConnection, 30000);
    setInterval(saveToLocalStorage, 10000);
    
    // ウィンドウ閉じる前に保存
    window.addEventListener('beforeunload', saveToLocalStorage);
    
    // 初回または会話が空の場合はウェルカム画面を表示
    if (!messages || messages.length === 0 || noHistory) {
        showWelcomeScreen();
    } else {
        // 既存の会話を表示（最新10件のみ、安全のため）
        const displayMessages = messages.slice(-10);
        console.log(`表示: ${displayMessages.length}件 / 全${messages.length}件`);
        
        // 安全のため、1件ずつ遅延して表示
        let index = 0;
        const displayNextMessage = () => {
            if (index < displayMessages.length) {
                const msg = displayMessages[index];
                if (msg && msg.content && msg.content.length < 10000) { // 10000文字以下のみ
                    addMessage(msg.role, msg.content, false);
                }
                index++;
                // 次のメッセージを10ms後に表示（ブラウザの負荷軽減）
                setTimeout(displayNextMessage, 10);
            }
        };
        displayNextMessage();
    }
    
    console.log('✅ アプリケーション初期化完了');
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    initializeApp();
});

console.log('app-enhanced.js: Script loading completed');