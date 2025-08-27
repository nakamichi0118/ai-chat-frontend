// チャットID生成関数（先に定義）
function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2);
}

// タイトル生成・保存・復元機能
function generateChatTitle(message) {
    // メッセージの最初の30文字程度をタイトルとして使用
    const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
    return title.replace(/\n/g, ' '); // 改行を空白に置換
}

function updatePageTitle(title) {
    if (title) {
        document.title = `${title} - アイユーくんAIチャット`;
        currentChatTitle = title;
        localStorage.setItem('currentChatTitle', title);
    } else {
        document.title = 'アイユーくんAIチャット';
        currentChatTitle = null;
        localStorage.removeItem('currentChatTitle');
    }
}

function restorePageTitle() {
    const savedTitle = localStorage.getItem('currentChatTitle');
    if (savedTitle) {
        currentChatTitle = savedTitle;
        document.title = `${savedTitle} - アイユーくんAIチャット`;
    }
}

// 拡張版 - 履歴保持・社内リソース対応
let messages = [];
let currentChatId = generateChatId();
let currentChatTitle = null; // チャットタイトル保存用
let chatHistory = {};
let isGenerating = false;
let availableModels = [];
let userProfile = {};
let companyKnowledge = [];

// 機能フラグ（明確にfalseで初期化）
let isKnowledgeEnabled = false;
let isVoiceEnabled = false;
let isSpeakEnabled = false;
let isPersonalityEnabled = false; // アイユーくん人格機能（デフォルトOFF）
let isResearchModeEnabled = false; // リサーチモード（ウェブ検索強化）

// 音声認識と合成
let recognition = null;
let synthesis = window.speechSynthesis;
let isRecording = false;

// DOM要素（初期化時に設定）
let messagesDiv;
let messageInput;
let sendButton;
let statusElement;
let modelSelect;

// 初期化時にローカルストレージから読み込み
function initializeApp() {
    console.log('🚀 アプリケーションを初期化中...');
    
    // DOM要素を取得
    messagesDiv = document.getElementById('messages');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    statusElement = document.getElementById('status');
    modelSelect = document.getElementById('modelSelect');
    
    // 要素が取得できているか確認
    if (!messagesDiv || !messageInput || !sendButton) {
        console.error('❌ 必須のDOM要素が見つかりません');
        console.error('  messagesDiv:', messagesDiv);
        console.error('  messageInput:', messageInput);
        console.error('  sendButton:', sendButton);
        return;
    }
    
    loadFromLocalStorage();
    loadUserProfile();
    // ナレッジは自動読み込みしない
    // loadCompanyKnowledge();
    loadModels();
    checkConnection();
    
    // UI要素の初期化を確認
    initializeUIElements();
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // 保存された設定を復元
    restoreSettings();
    
    // タイトルを復元
    restorePageTitle();
    
    setInterval(checkConnection, 30000);
    setInterval(saveToLocalStorage, 10000); // 10秒ごとに自動保存
    
    // ウィンドウ閉じる前に保存
    window.addEventListener('beforeunload', saveToLocalStorage);
    
    // モデル選択保存イベント
    if (modelSelect) {
        modelSelect.addEventListener('change', () => {
            localStorage.setItem('selectedModel', modelSelect.value);
        });
    }
    
    // 初回または会話が空の場合はウェルカム画面を表示
    if (!messages || messages.length === 0) {
        showWelcomeScreen();
    }
    
    // チャット履歴を常に表示
    renderChatHistory();
    
    console.log('✅ アプリケーション初期化完了');
}

// UI要素の初期化を確認
function initializeUIElements() {
    const elements = [
        'knowledgeToggle',
        'voiceToggle', 
        'speakToggle',
        'knowledgeStatus',
        'messageInput',
        'sendButton'
    ];
    
    let missingElements = [];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            missingElements.push(id);
        }
    });
    
    if (missingElements.length > 0) {
        console.error('❌ UI要素が見つかりません:', missingElements);
    } else {
        console.log('✅ すべてのUI要素が正常に読み込まれました');
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    console.log('📎 イベントリスナーを設定中...');
    
    // 送信ボタン
    const sendBtn = document.getElementById('sendButton');
    if (sendBtn) {
        sendBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('送信ボタンがクリックされました');
            console.log('window.sendMessage exists?', typeof window.sendMessage);
            console.log('sendMessage exists?', typeof sendMessage);
            
            try {
                await sendMessage();
                console.log('sendMessage実行完了');
            } catch (error) {
                console.error('sendMessage実行エラー:', error);
            }
        });
        console.log('✅ 送信ボタンのイベントリスナーを設定');
    } else {
        console.error('❌ 送信ボタンが見つかりません');
    }
    
    // 新しいチャットボタン
    const newChatBtn = document.getElementById('newChatButton');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            console.log('新しいチャットボタンがクリックされました');
            startNewChat();
        });
        console.log('✅ 新しいチャットボタンのイベントリスナーを設定');
    } else {
        console.error('❌ 新しいチャットボタンが見つかりません');
    }
    
    // ナレッジトグル
    const knowledgeToggle = document.getElementById('knowledgeToggle');
    if (knowledgeToggle) {
        knowledgeToggle.addEventListener('change', window.toggleKnowledge);
        console.log('✅ ナレッジトグルのイベントリスナーを設定');
    }
    
    // 音声入力トグル
    const voiceToggle = document.getElementById('voiceToggle');
    if (voiceToggle) {
        voiceToggle.addEventListener('change', window.toggleVoice);
        console.log('✅ 音声入力トグルのイベントリスナーを設定');
    }
    
    // 読み上げトグル
    const speakToggle = document.getElementById('speakToggle');
    if (speakToggle) {
        speakToggle.addEventListener('change', window.toggleSpeak);
        console.log('✅ 読み上げトグルのイベントリスナーを設定');
    }
    
    // メッセージ入力イベント
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (window.sendMessage) {
                    window.sendMessage();
                } else {
                    sendMessage();
                }
            }
        });
        
        msgInput.addEventListener('input', () => {
            msgInput.style.height = 'auto';
            msgInput.style.height = msgInput.scrollHeight + 'px';
        });
        console.log('✅ メッセージ入力のイベントリスナーを設定');
    }
    
    console.log('✅ すべてのイベントリスナーの設定完了');
}

// ウェルカム画面表示
function showWelcomeScreen() {
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h2 style="color: #1e3a8a; font-weight: 700;">
                <img src="/aiyu-icons/こんにちは.png" alt="アイユーくん" style="width: 36px; height: 36px; vertical-align: middle; margin-right: 8px;">
                アイユーくんAIチャットへようこそワン！
            </h2>
            <p style="color: #3b5998; font-size: 16px;">なんでも聞いてくださいワン！お手伝いしますワン🐾</p>
            ${userProfile.name ? `<p style="color: #2d4a9e;">こんにちは、${userProfile.name}さんワン！今日も頑張りましょうワン🌟</p>` : ''}
            <div class="quick-tips" style="margin-top: 25px; padding: 20px; background: linear-gradient(135deg, #f0f4ff 0%, #e0e8ff 100%); border-radius: 12px; border: 1px solid #d0deff;">
                <p style="color: #1e3a8a; font-weight: 600; margin-bottom: 12px;">💡 便利な機能ワン：</p>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    <li style="margin: 8px 0; color: #2d4a9e;">🎯 <strong>質問するだけ</strong> - 難しいこともわかりやすく説明するワン</li>
                    <li style="margin: 8px 0; color: #2d4a9e;">📄 <strong>ファイル添付OK</strong> - PDFや画像も理解できるワン</li>
                    <li style="margin: 8px 0; color: #2d4a9e;">🎙️ <strong>音声入力対応</strong> - 話しかけるだけでOKワン</li>
                    <li style="margin: 8px 0; color: #2d4a9e;">💼 <strong>業務サポート</strong> - 資料作成もお任せワン</li>
                </ul>
            </div>
            <div class="start-chat" style="margin-top: 20px; text-align: center;">
                <p style="color: #64748b; font-size: 14px;">さっそく下のボックスに質問を入力してみてワン！</p>
            </div>
        </div>
    `;
}

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
    
    // タイトルをリセット
    updatePageTitle(null);
    
    // UIをクリア
    messagesDiv.innerHTML = '';
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // ファイル添付もクリア
    if (window.clearAttachedFiles) {
        window.clearAttachedFiles();
    }
    
    // ウェルカム画面を表示
    showWelcomeScreen();
    
    // ローカルストレージを更新
    saveToLocalStorage();
    
    console.log('✅ 新しいチャット準備完了');
}

// チャットID生成（上部で定義済み）

// ローカルストレージから読み込み
function loadFromLocalStorage() {
    try {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            chatHistory = JSON.parse(savedHistory);
            renderChatHistory();
        }
        
        const savedCurrent = localStorage.getItem('currentChat');
        if (savedCurrent) {
            const data = JSON.parse(savedCurrent);
            currentChatId = data.id;
            messages = data.messages || [];
            
            // 会話を復元
            if (messages.length > 0) {
                messagesDiv.innerHTML = '';
                messages.forEach(msg => {
                    addMessage(msg.role, msg.content, false);
                });
            }
        }
        
        console.log('✅ 会話履歴を復元しました');
    } catch (error) {
        console.error('履歴の読み込みエラー:', error);
    }
}

// ローカルストレージに保存
function saveToLocalStorage() {
    try {
        // 現在の会話を保存
        localStorage.setItem('currentChat', JSON.stringify({
            id: currentChatId,
            messages: messages,
            timestamp: new Date().toISOString()
        }));
        
        // 履歴を保存
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        
        console.log('💾 自動保存完了');
    } catch (error) {
        console.error('保存エラー:', error);
    }
}

// ユーザープロファイル読み込み
function loadUserProfile() {
    const saved = localStorage.getItem('userProfile');
    if (saved) {
        userProfile = JSON.parse(saved);
    } else {
        // 初回はプロファイル設定を促す
        userProfile = {
            name: '',
            department: '',
            preferences: [],
            context: ''
        };
    }
}

// 社内ナレッジ読み込み（ナレッジボタンがONの時のみ）
async function loadCompanyKnowledge() {
    // ナレッジボタンがONの時のみ読み込む
    if (!isKnowledgeEnabled) {
        console.log('ナレッジ機能は無効です');
        companyKnowledge = [];
        return;
    }
    
    try {
        // 社内ドキュメントフォルダから読み込み
        const baseUrl = window.API_CONFIG ? window.API_CONFIG.getBaseUrl() : 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/knowledge`);
        if (response.ok) {
            companyKnowledge = await response.json();
            console.log(`📚 社内ナレッジ ${companyKnowledge.length}件読み込み`);
        }
    } catch (error) {
        console.log('社内ナレッジは後で設定できます');
    }
}

// Markdownレンダラーを一度だけ初期化
let markdownRenderer = null;

// Markdownレンダラーの初期化
function initializeMarkdownRenderer() {
    if (markdownRenderer) return;
    
    markdownRenderer = new marked.Renderer();
    
    // codeblock用のオーバーライド
    markdownRenderer.codeblock = function(code) {
        // codeオブジェクトから実際のテキストを取得
        let codeText = code;
        let lang = 'plaintext';
        
        // codeがオブジェクトの場合の処理
        if (typeof code === 'object' && code !== null) {
            codeText = code.text || code.raw || String(code);
            lang = code.lang || 'plaintext';
        }
        
        // 文字列に変換
        if (typeof codeText !== 'string') {
            codeText = String(codeText || '');
        }
        
        const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
        
        return `
            <div class="code-block-wrapper">
                <div class="code-block-header">
                    <span class="code-language">${lang}</span>
                    <button class="copy-code-btn" onclick="copyCode('${codeId}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        コピー
                    </button>
                </div>
                <pre><code id="${codeId}" class="language-${lang}">${escapeHtml(codeText)}</code></pre>
            </div>
        `;
    };
    
    // 古いバージョンとの互換性のため
    markdownRenderer.code = markdownRenderer.codeblock;
    
    marked.setOptions({
        renderer: markdownRenderer,
        highlight: false,
        breaks: true // 改行を<br>に変換
    });
}

// Markdownレンダリング（最適化版）
function renderMarkdown(text) {
    if (!markdownRenderer) {
        initializeMarkdownRenderer();
    }
    
    const html = marked.parse(text);
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 
                      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'table', 
                      'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'span', 'button', 'svg', 'rect', 'path'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id', 'onclick', 
                       'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'x', 'y', 
                       'rx', 'ry', 'd', 'stroke-linecap', 'stroke-linejoin']
    });
}

// HTMLエスケープ関数
function escapeHtml(text) {
    // textが文字列でない場合は文字列に変換
    if (typeof text !== 'string') {
        text = String(text || '');
    }
    
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// コードをクリップボードにコピー
window.copyCode = function(codeId) {
    const codeElement = document.getElementById(codeId);
    if (codeElement) {
        const text = codeElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            // コピー成功のフィードバック
            // codeIdから対応するボタンを見つける
            const codeBlock = codeElement.closest('.code-block-wrapper');
            if (codeBlock) {
                const btn = codeBlock.querySelector('.copy-code-btn');
                if (btn) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✓ コピー完了';
                    btn.style.color = '#10b981';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.color = '';
                    }, 2000);
                }
            }
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
            alert('クリップボードへのコピーに失敗しました');
        });
    }
}

// メッセージ入力イベント - setupEventListeners内に移動済み

// メッセージ送信
async function sendMessage() {
    let typingDiv = null; // エラーハンドリングでも使用するため外で宣言
    
    try {
        // DOM要素の確認
        if (!messageInput) {
            console.error('❌ messageInput is null');
            alert('エラー: メッセージ入力欄が見つかりません。ページをリロードしてください。');
            return;
        }
        
        let message = messageInput.value.trim();
        
        // デバッグ: attachedFiles の状態を確認
        console.log('📎 Current attachedFiles:', attachedFiles);
        console.log('📎 attachedFiles length:', attachedFiles.length);
        console.log('📎 attachedFiles type:', typeof attachedFiles);
        console.log('📎 attachedFiles is array?:', Array.isArray(attachedFiles));
        
        // ファイルのみでの送信を許可
        if (!message && attachedFiles.length > 0) {
            message = 'ファイルを確認してください。'; // デフォルトメッセージ
            console.log('📎 File-only submission with default message');
        } else if (!message) {
            console.log('⚠️ Empty message and no files, skipping');
            console.log('⚠️ attachedFiles detail:', JSON.stringify(attachedFiles));
            return;
        }
        
        if (isGenerating) {
            console.log('⚠️ Already generating, skipping');
            return;
        }
        
        console.log('=== sendMessage START ===');
        console.log('1. Message:', message);
        console.log('2. isGenerating:', isGenerating);
        console.log('3. modelSelect:', modelSelect);
        console.log('4. modelSelect.value:', modelSelect ? modelSelect.value : 'N/A');
        console.log('5. availableModels:', availableModels);
        
        // 最初のメッセージの場合、タイトルを設定
        if (messages.length === 0 && !currentChatTitle) {
            const title = generateChatTitle(message);
            updatePageTitle(title);
            console.log('📝 Chat title set to:', title);
        }
    
        // モデル選択（デフォルト値を設定）
        let selectedModel = modelSelect ? modelSelect.value : 'gemini-1.5-flash';
        if (!selectedModel) {
            selectedModel = 'gemini-1.5-flash';
        }
        console.log('6. Selected model:', selectedModel);
        console.log('7. isKnowledgeEnabled:', isKnowledgeEnabled);
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        addMessage('user', message);
        
        isGenerating = true;
        sendButton.disabled = true;
        
        typingDiv = addTypingIndicator();
        console.log('8. Typing indicator added');
        // コンテキスト構築（ナレッジが有効な場合のみ）
        // contextは削除し、useKnowledgeフラグのみ送信
        
        // ファイル情報をログ出力
        console.log('📎 Attached files count:', attachedFiles.length);
        if (attachedFiles.length > 0) {
            attachedFiles.forEach((file, index) => {
                console.log(`  File ${index + 1}: ${file.name} (${file.type}, ${file.size} bytes)`);
                console.log(`    Data preview:`, file.data ? file.data.substring(0, 100) : 'No data');
            });
        }
        
        const requestBody = {
            message: message,
            model: selectedModel,
            history: messages.slice(-10),
            useKnowledge: Boolean(isKnowledgeEnabled),
            usePersonality: Boolean(isPersonalityEnabled),
            useResearch: Boolean(isResearchModeEnabled),
            userProfile: userProfile,
            files: attachedFiles // 添付ファイルを含める
        };
        console.log('9. Request body (files array length):', requestBody.files ? requestBody.files.length : 0);
        console.log('10. Full request body size:', JSON.stringify(requestBody).length, 'characters');
        
        const baseUrl = window.API_CONFIG ? window.API_CONFIG.getBaseUrl() : 'http://localhost:3001';
        
        // リトライ機能付きfetch
        const fetchWithRetry = async (url, options, maxRetries = 3) => {
            let lastError = null;
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    console.log(`Attempt ${i + 1} of ${maxRetries}...`);
                    const response = await fetch(url, options);
                    
                    if (!response.ok) {
                        if (response.status === 403) {
                            // 認証エラーの場合はリトライしない
                            const errorData = await response.json();
                            throw new Error(`AUTH_FAILED: ${errorData.reason || 'MAC認証が拒否されました'}`);
                        } else if (response.status >= 500) {
                            // サーバーエラーの場合はリトライ
                            lastError = new Error(`Server error: ${response.status}`);
                            console.warn(`Server error on attempt ${i + 1}, retrying...`);
                            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指数バックオフ
                            continue;
                        }
                    }
                    
                    return response;
                } catch (error) {
                    lastError = error;
                    console.warn(`Network error on attempt ${i + 1}:`, error);
                    
                    if (i < maxRetries - 1) {
                        // リトライ前に待機（指数バックオフ）
                        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                        
                        // リトライ中であることをユーザーに通知
                        if (typingDiv && typingDiv.querySelector('.typing-indicator')) {
                            typingDiv.querySelector('.typing-indicator').innerHTML += 
                                `<div style="color: orange; font-size: 12px; margin-top: 4px;">接続を再試行中... (${i + 2}/${maxRetries})</div>`;
                        }
                    }
                }
            }
            
            throw lastError || new Error('Failed after all retries');
        };
        
        const response = await fetchWithRetry(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('10. Response status:', response.status);
        console.log('11. Response ok:', response.ok);
        console.log('12. Response headers:', response.headers.get('content-type'));
        
        if (!response.ok) {
            if (response.status === 403) {
                // 認証エラーの場合は詳細な情報を取得
                const errorData = await response.json();
                throw new Error(`MAC_AUTH_DENIED: ${errorData.userMessage || errorData.reason || 'デバイス認証が拒否されました'}`);
            }
            throw new Error(`Network response was not ok: ${response.status}`);
        }
        
        // JSONレスポンスかSSEレスポンスかを判定
        const contentType = response.headers.get('content-type');
        console.log('13. Response content-type:', contentType);
        
        removeTypingIndicator(typingDiv);
        const assistantDiv = addMessage('assistant', '');
        const contentDiv = assistantDiv.querySelector('.message-content');
        console.log('14. Assistant div created:', assistantDiv ? 'OK' : 'Failed');
        console.log('15. Content div:', contentDiv ? 'OK' : 'Failed');
        
        let assistantMessage = '';
        
        if (contentType && contentType.includes('application/json')) {
            // JSON形式のレスポンスを処理（新しいWorker用）
            console.log('Processing JSON response...');
            const data = await response.json();
            console.log('JSON response data:', data);
            
            if (data.response) {
                assistantMessage = data.response;
                contentDiv.innerHTML = renderMarkdown(assistantMessage);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            } else if (data.error) {
                throw new Error(data.error);
            }
        } else {
            // SSE形式のレスポンスを処理（既存のサーバー用）
            console.log('Processing SSE response...');
            
            // まずJSONレスポンスかチェック
            const text = await response.text();
            console.log('Raw response text:', text.substring(0, 200));
            
            try {
                // JSONとしてパース可能かチェック
                const data = JSON.parse(text);
                if (data.response) {
                    assistantMessage = data.response;
                    contentDiv.innerHTML = renderMarkdown(assistantMessage);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                } else if (data.error) {
                    throw new Error(data.error);
                }
            } catch (jsonError) {
                // JSONでない場合はSSEとして処理
                const lines = text.split('\n');
                
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
                                console.log(`17. Received content (total: ${assistantMessage.length}):`, data.content.substring(0, 50));
                                contentDiv.innerHTML = renderMarkdown(assistantMessage);
                                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                            } else if (data.error) {
                                console.error('18. Server error:', data.error);
                            }
                        } catch (e) {
                            console.error('19. Error parsing SSE data:', e);
                            console.error('20. Problematic JSON string:', jsonStr);
                        }
                    }
                }
            }
        }
        
        console.log('21. Final assistant message length:', assistantMessage.length);
        console.log('22. Final assistant message preview:', assistantMessage.substring(0, 100));
        
        messages.push({ role: 'assistant', content: assistantMessage });
        updateChatHistory();
        saveToLocalStorage(); // 自動保存
        
        // ファイル添付をクリア
        attachedFiles = [];
        const filePreview = document.getElementById('filePreview');
        if (filePreview) {
            filePreview.innerHTML = '';
            filePreview.style.display = 'none';
        }
        
        // 読み上げ機能が有効なら読み上げる
        if (isSpeakEnabled && assistantMessage) {
            console.log('🔊 読み上げ開始:', assistantMessage.substring(0, 50));
            speakText(assistantMessage);
        }
        
        console.log('=== sendMessage END ===');
        
    } catch (error) {
        console.error('=== sendMessage ERROR ===');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        removeTypingIndicator(typingDiv);
        
        // エラーメッセージをより詳細に
        let errorMessage = 'エラーが発生しました: ';
        
        if (error.message.includes('AUTH_FAILED') || error.message.includes('MAC_AUTH_DENIED')) {
            // MAC認証エラー（サーバーエラーと明確に区別）
            errorMessage = '🚫 デバイス認証エラー\n\n' +
                          'このデバイスは認証されていません。\n\n' +
                          '対処方法：\n' +
                          '1. 社内ネットワークに接続していることを確認\n' +
                          '2. システム管理者に連絡して、このデバイスの登録を依頼\n\n' +
                          '連絡先：情報システム部（内線XXXX）\n\n' +
                          '※これはサーバーエラーではなく、セキュリティ設定による制限です。';
        } else if (error.message.includes('Failed after all retries')) {
            errorMessage = '🔌 接続エラー: サーバーに接続できません。以下を確認してください:\n' +
                          '1. Dockerコンテナが起動しているか確認\n' +
                          '2. docker-compose ps でサービスの状態を確認\n' +
                          '3. ネットワーク接続を確認';
        } else if (error.message.includes('Server error')) {
            errorMessage = '⚠️ サーバーエラー: バックエンドで問題が発生しました。\n' +
                          'docker-compose logs backend で詳細を確認してください。';
        } else if (error.message.includes('404')) {
            errorMessage = '❌ APIエンドポイントが見つかりません。\n' +
                          'バックエンドが正しく起動しているか確認してください。';
        } else if (error.message.includes('Network')) {
            errorMessage = '🌐 ネットワークエラー: インターネット接続を確認してください。';
        } else {
            errorMessage += error.message;
        }
        
        // エラーメッセージにリトライボタンを追加
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="color: #d32f2f; margin-bottom: 12px; white-space: pre-wrap;">${errorMessage}</div>
            <button onclick="location.reload()" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                🔄 ページをリロード
            </button>
        `;
        
        const messageDiv = addMessage('assistant', '', false);
        messageDiv.querySelector('.message-content').appendChild(errorDiv);
        
        setStatus('error');
    } finally {
        isGenerating = false;
        sendButton.disabled = false;
    }
}

// コンテキスト構築（削除済み - バックエンドで処理）
// function buildContext(message) { ... }
// この関数は削除されました。ナレッジ検索はバックエンドで行います。

// メッセージ追加
function addMessage(role, content, save = true) {
    if (messagesDiv.querySelector('.welcome-message')) {
        messagesDiv.innerHTML = '';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'user') {
        avatar.textContent = userProfile.name || 'You';
    } else {
        // アイユーくんのアイコンを使用
        const aiyuIcons = ['こんにちは', 'ひらめき', 'きらきら', '自己紹介'];
        const randomIcon = aiyuIcons[Math.floor(Math.random() * aiyuIcons.length)];
        avatar.innerHTML = `<img src="/aiyu-icons/${randomIcon}.png" alt="アイユー" style="width: 100%; height: 100%; object-fit: cover;">`;
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (role === 'assistant' && content) {
        contentDiv.innerHTML = renderMarkdown(content);
    } else {
        contentDiv.textContent = content;
    }
    
    // タイムスタンプ追加
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString();
    
    // アクションボタンコンテナ
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    actionsDiv.style.cssText = 'display: flex; gap: 8px; margin-top: 8px; opacity: 0.7; transition: opacity 0.2s;';
    
    // コピーボタン
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn copy-btn';
    copyBtn.style.cssText = 'padding: 2px 6px; background: transparent; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; color: #666;';
    copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>コピー</span>
    `;
    copyBtn.onmouseover = () => {
        copyBtn.style.background = 'rgba(0,0,0,0.05)';
        copyBtn.style.borderColor = 'rgba(0,0,0,0.2)';
    };
    copyBtn.onmouseout = () => {
        copyBtn.style.background = 'transparent';
        copyBtn.style.borderColor = 'rgba(0,0,0,0.1)';
    };
    copyBtn.onclick = () => {
        const textContent = role === 'assistant' ? contentDiv.innerText : content;
        navigator.clipboard.writeText(textContent).then(() => {
            copyBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style="color: #4CAF50;">完了</span>
            `;
            setTimeout(() => {
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    <span>コピー</span>
                `;
            }, 2000);
        }).catch(err => {
            console.error('コピーに失敗:', err);
            copyBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span style="color: #f44336;">失敗</span>
            `;
            setTimeout(() => {
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    <span>コピー</span>
                `;
            }, 2000);
        });
    };
    actionsDiv.appendChild(copyBtn);
    
    // ユーザーメッセージには再送信ボタンを追加
    if (role === 'user') {
        const resendBtn = document.createElement('button');
        resendBtn.className = 'action-btn resend-btn';
        resendBtn.style.cssText = 'padding: 2px 6px; background: transparent; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; color: #666;';
        resendBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span>再送信</span>
        `;
        resendBtn.onmouseover = () => {
            resendBtn.style.background = 'rgba(0,0,0,0.05)';
            resendBtn.style.borderColor = 'rgba(0,0,0,0.2)';
        };
        resendBtn.onmouseout = () => {
            resendBtn.style.background = 'transparent';
            resendBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        };
        resendBtn.onclick = () => {
            if (!isGenerating) {
                messageInput.value = content;
                sendMessage();
            } else {
                alert('現在生成中です。完了後に再送信してください。');
            }
        };
        actionsDiv.appendChild(resendBtn);
    }
    
    // マウスホバーで表示
    messageDiv.onmouseenter = () => actionsDiv.style.opacity = '1';
    messageDiv.onmouseleave = () => actionsDiv.style.opacity = '0.7';
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestamp);
    messageDiv.appendChild(actionsDiv);
    messagesDiv.appendChild(messageDiv);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    if (role === 'user' && save) {
        messages.push({ role, content });
    }
    
    return messageDiv;
}

// タイピングインジケーター
function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.innerHTML = `
        <div class="message-avatar"><img src="/aiyu-icons/ひらめき.png" alt="アイユー" style="width: 100%; height: 100%; object-fit: cover;"></div>
        <div class="message-content">
            <div class="typing-indicator" style="display: inline-flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%); border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                <div class="typing-dots" style="display: flex; gap: 3px; align-items: center;">
                    <span class="typing-dot" style="width: 6px; height: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; animation: typing-wave 1.2s infinite; animation-delay: 0s;"></span>
                    <span class="typing-dot" style="width: 6px; height: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; animation: typing-wave 1.2s infinite; animation-delay: 0.15s;"></span>
                    <span class="typing-dot" style="width: 6px; height: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; animation: typing-wave 1.2s infinite; animation-delay: 0.3s;"></span>
                </div>
                <span style="color: #6b7280; font-size: 13px; font-weight: 500;">考え中</span>
            </div>
        </div>
    `;
    
    // アニメーションスタイルを追加（一度だけ）
    if (!document.querySelector('style[data-typing-animation]')) {
        const style = document.createElement('style');
        style.setAttribute('data-typing-animation', 'true');
        style.textContent = `
            @keyframes typing-wave {
                0%, 60%, 100% { 
                    transform: translateY(0);
                    opacity: 0.5;
                }
                30% { 
                    transform: translateY(-10px);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return typingDiv;
}

function removeTypingIndicator(typingDiv) {
    if (typingDiv && typingDiv.parentNode) {
        typingDiv.remove();
    }
}

// 新規チャット（グローバルスコープで利用可能にする）
window.newChat = function() {
    // 現在のチャットを履歴に保存
    if (messages.length > 0) {
        updateChatHistory();
        saveToLocalStorage();
    }
    
    currentChatId = generateChatId();
    messages = [];
    showWelcomeScreen();
}

// チャット履歴更新
function updateChatHistory() {
    if (messages.length === 0) return;
    
    chatHistory[currentChatId] = {
        title: messages[0]?.content?.substring(0, 30) + '...' || '新しいチャット',
        messages: messages,
        timestamp: new Date().toISOString(),
        lastUpdated: new Date().toISOString()  // 最終更新日時を追加
    };
    renderChatHistory();
}

// チャット履歴レンダリング
function renderChatHistory() {
    const historyDiv = document.getElementById('chatHistory');
    if (!historyDiv) return;
    
    historyDiv.innerHTML = '';
    
    const sortedChats = Object.entries(chatHistory)
        .sort((a, b) => {
            // lastUpdatedがあればそれを使用、なければtimestampを使用
            const dateA = new Date(a[1].lastUpdated || a[1].timestamp);
            const dateB = new Date(b[1].lastUpdated || b[1].timestamp);
            return dateB - dateA;  // 新しい順
        })
        .slice(0, 20); // 最新20件
    
    sortedChats.forEach(([id, chat]) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.innerHTML = `
            <div class="chat-item-title" contenteditable="false" data-chat-id="${id}">${chat.title}</div>
            <div class="chat-item-date">${new Date(chat.timestamp).toLocaleDateString()}</div>
        `;
        
        // タイトルをダブルクリックで編集可能に
        const titleDiv = chatItem.querySelector('.chat-item-title');
        titleDiv.ondblclick = (e) => {
            e.stopPropagation();
            titleDiv.contentEditable = 'true';
            titleDiv.focus();
            
            // 全文選択
            const range = document.createRange();
            range.selectNodeContents(titleDiv);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        };
        
        titleDiv.onblur = () => {
            titleDiv.contentEditable = 'false';
            const newTitle = titleDiv.textContent.trim();
            if (newTitle && newTitle !== chat.title) {
                chat.title = newTitle;
                saveToLocalStorage();
            }
        };
        
        titleDiv.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleDiv.blur();
            }
        };
        
        chatItem.onclick = () => {
            if (titleDiv.contentEditable !== 'true') {
                loadChat(id);
            }
        };
        
        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteChat(id);
        };
        chatItem.appendChild(deleteBtn);
        
        historyDiv.appendChild(chatItem);
    });
}

// チャット読み込み
function loadChat(chatId) {
    // 現在のチャットと同じなら何もしない
    if (chatId === currentChatId) return;
    
    if (messages.length > 0) {
        updateChatHistory();
    }
    
    const chat = chatHistory[chatId];
    if (!chat) return;
    
    currentChatId = chatId;
    // メッセージを深くコピーして複製を防ぐ
    messages = JSON.parse(JSON.stringify(chat.messages || []));
    
    messagesDiv.innerHTML = '';
    messages.forEach(msg => {
        addMessage(msg.role, msg.content, false);
    });
    
    // クリックしたチャットのlastUpdatedを更新
    chat.lastUpdated = new Date().toISOString();
    
    saveToLocalStorage();
    renderChatHistory();  // 並び順を更新
}

// チャット削除
function deleteChat(chatId) {
    if (confirm('このチャットを削除しますか？')) {
        delete chatHistory[chatId];
        
        // 現在のチャットを削除した場合、新しいチャットを開始
        if (chatId === currentChatId) {
            currentChatId = generateChatId();
            messages = [];
            showWelcomeScreen();
        }
        
        renderChatHistory();
        saveToLocalStorage();
    }
}

// エクスポート機能は管理者画面でのみ利用可能
// ユーザー向けのエクスポート機能は削除済み
// function exportAllChats() - 削除済み

// プロファイル表示（グローバルスコープで利用可能にする）
window.showProfile = function() {
    const name = prompt('お名前:', userProfile.name || '');
    const department = prompt('部署:', userProfile.department || '');
    const context = prompt('AIに覚えておいてほしいこと:', userProfile.context || '');
    
    if (name !== null) {
        userProfile.name = name;
        userProfile.department = department;
        userProfile.context = context;
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        alert('プロファイルを更新しました');
    }
}

// 社内ナレッジ管理（グローバルスコープで利用可能にする）
window.showKnowledge = async function() {
    window.location.href = 'knowledge-manager.html';
}

// モデル読み込み
async function loadModels() {
    try {
        const baseUrl = window.API_CONFIG ? window.API_CONFIG.getBaseUrl() : 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/models`);
        const data = await response.json();
        
        if (data.models && data.models.length > 0) {
            availableModels = data.models;
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
            
            // 前回選択したモデルを復元
            const savedModel = localStorage.getItem('selectedModel');
            if (savedModel && data.models.find(m => m.name === savedModel)) {
                modelSelect.value = savedModel;
            } else if (data.models.find(m => m.name === 'gemini-1.5-flash')) {
                modelSelect.value = 'gemini-1.5-flash';
            } else if (data.models.length > 0) {
                modelSelect.value = data.models[0].name;
            }
        }
    } catch (error) {
        console.error('Error loading models:', error);
        modelSelect.innerHTML = '<option value="">モデルを読み込めません</option>';
    }
}

// モデル選択保存は initializeApp 内で設定

// トグル機能の実装（グローバルスコープで利用可能にする）
window.toggleKnowledge = function() {
    isKnowledgeEnabled = !isKnowledgeEnabled;
    const btn = document.getElementById('knowledgeToggle');
    const status = document.getElementById('knowledgeStatus');
    
    console.log('ナレッジトグル:', isKnowledgeEnabled);
    
    if (isKnowledgeEnabled) {
        btn.classList.add('active');
        status.style.display = 'flex';
        status.querySelector('.status-text').textContent = 'ナレッジベース接続中';
        
        // ナレッジデータの再読み込み
        loadCompanyKnowledge();
    } else {
        btn.classList.remove('active');
        status.style.display = 'none';
        // ナレッジをクリア
        companyKnowledge = [];
    }
    
    localStorage.setItem('knowledgeEnabled', String(isKnowledgeEnabled));
}

window.toggleVoice = function() {
    isVoiceEnabled = !isVoiceEnabled;
    const btn = document.getElementById('voiceToggle');
    const voiceBtn = document.getElementById('voiceButton');
    
    if (isVoiceEnabled) {
        btn.classList.add('active');
        voiceBtn.style.display = 'flex';
        initializeSpeechRecognition();
    } else {
        btn.classList.remove('active');
        voiceBtn.style.display = 'none';
        if (recognition) {
            recognition.stop();
        }
    }
    
    localStorage.setItem('voiceEnabled', isVoiceEnabled);
}

window.toggleSpeak = function() {
    isSpeakEnabled = !isSpeakEnabled;
    const btn = document.getElementById('speakToggle');
    
    if (isSpeakEnabled) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
        // 現在の読み上げを停止
        if (synthesis.speaking) {
            synthesis.cancel();
        }
    }
    
    localStorage.setItem('speakEnabled', isSpeakEnabled);
}

window.togglePersonality = function() {
    isPersonalityEnabled = !isPersonalityEnabled;
    const btn = document.getElementById('personalityToggle');
    
    console.log('人格トグル:', isPersonalityEnabled);
    
    if (isPersonalityEnabled) {
        btn.classList.add('active');
        console.log('✅ アイユーくん人格モード: ON');
    } else {
        btn.classList.remove('active');
        console.log('⚪ アイユーくん人格モード: OFF');
    }
    
    localStorage.setItem('personalityEnabled', String(isPersonalityEnabled));
}

window.toggleResearchMode = function() {
    isResearchModeEnabled = !isResearchModeEnabled;
    const btn = document.getElementById('researchToggle');
    
    console.log('リサーチモード:', isResearchModeEnabled);
    
    if (isResearchModeEnabled) {
        btn.classList.add('active');
        console.log('✅ リサーチモード: ON');
    } else {
        btn.classList.remove('active');
        console.log('⚪ リサーチモード: OFF');
    }
    
    localStorage.setItem('researchModeEnabled', String(isResearchModeEnabled));
}

// 音声認識の初期化
function initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('お使いのブラウザは音声認識に対応していません。Chrome/Edgeをお使いください。');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
        isRecording = true;
        const voiceBtn = document.getElementById('voiceButton');
        voiceBtn.classList.add('recording');
        voiceBtn.querySelector('.recording-indicator').style.display = 'block';
    };
    
    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        messageInput.value = finalTranscript || interimTranscript;
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    };
    
    recognition.onend = () => {
        isRecording = false;
        const voiceBtn = document.getElementById('voiceButton');
        voiceBtn.classList.remove('recording');
        voiceBtn.querySelector('.recording-indicator').style.display = 'none';
    };
    
    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        if (event.error === 'no-speech') {
            alert('音声が検出されませんでした。もう一度お試しください。');
        }
    };
}

// 音声入力開始（グローバルスコープで利用可能にする）
window.startVoiceInput = function() {
    if (!recognition) {
        initializeSpeechRecognition();
    }
    
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

// テキスト読み上げ
function speakText(text) {
    if (!isSpeakEnabled || !text) return;
    
    console.log('🔊 speakText関数が呼ばれました');
    console.log('  isSpeakEnabled:', isSpeakEnabled);
    console.log('  synthesis:', synthesis);
    console.log('  synthesis.speaking:', synthesis ? synthesis.speaking : 'N/A');
    
    // Markdownを除去してプレーンテキストに
    const plainText = text
        .replace(/```[\s\S]*?```/g, 'コードブロック')
        .replace(/[#*`_~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '画像')
        .substring(0, 500);  // 最大500文字まで
    
    console.log('  読み上げテキスト:', plainText.substring(0, 100));
    
    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    // エラーハンドリング
    utterance.onerror = (event) => {
        console.error('🔊 読み上げエラー:', event);
    };
    
    utterance.onstart = () => {
        console.log('🔊 読み上げ開始');
    };
    
    utterance.onend = () => {
        console.log('🔊 読み上げ終了');
    };
    
    synthesis.speak(utterance);
}

// 初期設定の復元 - initializeApp内に統合
function restoreSettings() {
    // 保存された設定を復元（ナレッジ・人格・リサーチはデフォルトOFF）
    const knowledgeEnabled = localStorage.getItem('knowledgeEnabled') === 'true';
    const voiceEnabled = localStorage.getItem('voiceEnabled') === 'true';
    const speakEnabled = localStorage.getItem('speakEnabled') === 'true';
    const personalityEnabled = localStorage.getItem('personalityEnabled') === 'true';
    const researchEnabled = localStorage.getItem('researchModeEnabled') === 'true';
    
    console.log('初期設定復元:');
    console.log('  ナレッジ:', knowledgeEnabled);
    console.log('  音声:', voiceEnabled);
    console.log('  読み上げ:', speakEnabled);
    console.log('  人格:', personalityEnabled);
    console.log('  リサーチ:', researchEnabled);
    
    // 直接状態を設定（イベントループを避けるため）
    // ナレッジ設定
    isKnowledgeEnabled = knowledgeEnabled;
    const knowledgeBtn = document.getElementById('knowledgeToggle');
    const knowledgeStatus = document.getElementById('knowledgeStatus');
    if (knowledgeBtn) {
        if (knowledgeEnabled) {
            knowledgeBtn.classList.add('active');
        } else {
            knowledgeBtn.classList.remove('active');
        }
    }
    if (knowledgeStatus) {
        knowledgeStatus.style.display = knowledgeEnabled ? 'inline' : 'none';
    }
    
    // 音声設定
    isVoiceEnabled = voiceEnabled;
    const voiceBtn = document.getElementById('voiceToggle');
    if (voiceBtn) {
        if (voiceEnabled) {
            voiceBtn.classList.add('active');
            // 音声認識の初期化は必要に応じて後で
        } else {
            voiceBtn.classList.remove('active');
        }
    }
    
    // 読み上げ設定
    isSpeakEnabled = speakEnabled;
    const speakBtn = document.getElementById('speakToggle');
    if (speakBtn) {
        if (speakEnabled) {
            speakBtn.classList.add('active');
        } else {
            speakBtn.classList.remove('active');
        }
    }
    
    // 人格設定
    isPersonalityEnabled = personalityEnabled;
    const personalityBtn = document.getElementById('personalityToggle');
    if (personalityBtn) {
        if (personalityEnabled) {
            personalityBtn.classList.add('active');
        } else {
            personalityBtn.classList.remove('active');
        }
    }
    
    // リサーチモード設定
    isResearchModeEnabled = researchEnabled;
    const researchBtn = document.getElementById('researchToggle');
    if (researchBtn) {
        if (researchEnabled) {
            researchBtn.classList.add('active');
        } else {
            researchBtn.classList.remove('active');
        }
    }
    
    // ローカルストレージに保存
    localStorage.setItem('knowledgeEnabled', knowledgeEnabled);
    localStorage.setItem('voiceEnabled', voiceEnabled);
    localStorage.setItem('speakEnabled', speakEnabled);
    localStorage.setItem('personalityEnabled', personalityEnabled);
}

// ステータス設定
function setStatus(status) {
    if (!statusElement) return; // statusElement が存在しない場合は何もしない
    
    if (status === 'error') {
        statusElement.textContent = '● 接続エラー';
        statusElement.className = 'status error';
    } else {
        statusElement.textContent = '● 接続中';
        statusElement.className = 'status';
    }
}

// 接続チェック
async function checkConnection() {
    try {
        const baseUrl = window.API_CONFIG ? window.API_CONFIG.getBaseUrl() : 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/health`);
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

// ファイル添付機能
let attachedFiles = [];

// ファイル添付の初期化
function initializeFileAttachment() {
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
}

// ファイル選択処理
async function handleFileSelect(event) {
    console.log('🔹 handleFileSelect called');
    console.log('🔹 Event:', event);
    console.log('🔹 Files selected:', event.target.files);
    
    const files = Array.from(event.target.files);
    const filePreview = document.getElementById('filePreview');
    
    console.log('🔹 Files array:', files);
    console.log('🔹 Files count:', files.length);
    
    for (const file of files) {
        console.log(`🔹 Processing file: ${file.name}, size: ${file.size}, type: ${file.type}`);
        
        // ファイルサイズチェック（10MB以下）
        if (file.size > 10 * 1024 * 1024) {
            alert(`${file.name} は10MBを超えています。`);
            continue;
        }
        
        // PDFファイルの特別処理
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            console.log(`🔹 PDF detected, converting to images...`);
            
            try {
                // PDFを画像に変換
                const images = await convertPDFToImages(file);
                console.log(`🔹 PDF converted to ${images.length} images`);
                
                // 各画像をファイルとして追加
                images.forEach((image, index) => {
                    const imageObj = {
                        name: `${file.name}_page_${image.pageNumber}.png`,
                        type: 'image/png',
                        size: image.data.length,
                        data: image.data,
                        originalPdf: file.name,
                        pageNumber: image.pageNumber
                    };
                    
                    attachedFiles.push(imageObj);
                    console.log(`🔹 Added PDF page ${image.pageNumber} as image`);
                    
                    // プレビューに追加
                    addFilePreview(imageObj.name, attachedFiles.length - 1);
                });
                
                // PDFの処理完了メッセージ
                const messageDiv = document.createElement('div');
                messageDiv.className = 'pdf-conversion-success';
                messageDiv.style.cssText = 'background: #d4edda; color: #155724; padding: 8px; border-radius: 4px; margin: 8px 0; font-size: 13px;';
                messageDiv.textContent = `✅ PDF「${file.name}」を${images.length}枚の画像に変換しました。Geminiで内容を読み取れます。`;
                filePreview.appendChild(messageDiv);
                
                // 5秒後にメッセージを削除
                setTimeout(() => messageDiv.remove(), 5000);
                
            } catch (error) {
                console.error('PDF conversion failed:', error);
                alert(`PDF「${file.name}」の変換に失敗しました: ${error.message}`);
                continue;
            }
        } else {
            // PDF以外のファイルは通常通り処理
            const fileData = await readFile(file);
            console.log(`🔹 File data read, length: ${fileData ? fileData.length : 0}`);
            
            const fileObj = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: fileData
            };
            
            attachedFiles.push(fileObj);
            console.log(`🔹 File added to attachedFiles. New length: ${attachedFiles.length}`);
            console.log('🔹 Current attachedFiles:', attachedFiles);
            
            // プレビューに追加
            addFilePreview(file.name, attachedFiles.length - 1);
        }
    }
    
    // プレビューエリアを表示
    if (attachedFiles.length > 0) {
        filePreview.style.display = 'flex';
        console.log('🔹 File preview displayed');
    }
    
    console.log('🔹 Final attachedFiles after processing:', attachedFiles);
    console.log('🔹 Final attachedFiles length:', attachedFiles.length);
    
    // ファイル入力をリセット
    event.target.value = '';
}

// PDFを画像に変換する関数
async function convertPDFToImages(file) {
    console.log(`🖼️ Converting PDF to images: ${file.name}`);
    
    return new Promise(async (resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // PDF.jsを使用してPDFを読み込む
                const loadingTask = pdfjsLib.getDocument({data: uint8Array});
                const pdf = await loadingTask.promise;
                
                console.log(`📄 PDF loaded: ${pdf.numPages} pages`);
                
                const images = [];
                const maxPages = Math.min(pdf.numPages, 10); // 最大10ページまで処理
                
                // 各ページを画像に変換
                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                    console.log(`🔄 Converting page ${pageNum}/${pdf.numPages}`);
                    
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({scale: 2.0}); // 高解像度で変換
                    
                    // Canvas要素を作成
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    // PDFページをCanvasにレンダリング
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    // CanvasをBase64画像データに変換
                    const imageData = canvas.toDataURL('image/png', 0.9);
                    
                    images.push({
                        pageNumber: pageNum,
                        data: imageData,
                        width: viewport.width,
                        height: viewport.height
                    });
                    
                    console.log(`✅ Page ${pageNum} converted to image`);
                }
                
                if (pdf.numPages > maxPages) {
                    console.log(`⚠️ PDF has ${pdf.numPages} pages, but only first ${maxPages} pages were converted`);
                }
                
                resolve(images);
                
            } catch (error) {
                console.error('PDF conversion error:', error);
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ファイル読み込み
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            resolve(e.target.result); // Base64またはテキスト
        };
        
        reader.onerror = reject;
        
        // 画像ファイルはBase64エンコード
        if (file.type.startsWith('image/')) {
            console.log(`📋 Reading ${file.name} as Base64...`);
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            // PDFファイルは特別な処理（convertPDFToImages で処理するため、ここでは読み込まない）
            console.log(`📋 PDF file will be converted to images: ${file.name}`);
            resolve(null); // PDFの場合はnullを返す
        } else {
            console.log(`📋 Reading ${file.name} as text...`);
            reader.readAsText(file);
        }
    });
}

// ファイルプレビュー追加
function addFilePreview(fileName, index) {
    const filePreview = document.getElementById('filePreview');
    const previewItem = document.createElement('div');
    previewItem.className = 'file-preview-item';
    previewItem.innerHTML = `
        <span>${fileName}</span>
        <span class="remove-file" onclick="removeFile(${index})">×</span>
    `;
    filePreview.appendChild(previewItem);
}

// ファイル削除
window.removeFile = function(index) {
    attachedFiles.splice(index, 1);
    
    // プレビューを再描画
    const filePreview = document.getElementById('filePreview');
    filePreview.innerHTML = '';
    
    attachedFiles.forEach((file, i) => {
        addFilePreview(file.name, i);
    });
    
    // ファイルがなくなったらプレビューエリアを非表示
    if (attachedFiles.length === 0) {
        filePreview.style.display = 'none';
    }
}

// ファイル添付を含むメッセージ送信のラッパー
async function sendMessageWrapper() {
    const message = messageInput.value.trim();
    if (!message && attachedFiles.length === 0) return;
    
    // ファイルがある場合は、メッセージに添付情報を追加
    let enhancedMessage = message;
    if (attachedFiles.length > 0) {
        enhancedMessage += '\n\n【添付ファイル】\n';
        for (const file of attachedFiles) {
            if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || 
                file.name.endsWith('.js') || file.name.endsWith('.py') || file.name.endsWith('.json')) {
                enhancedMessage += `\nファイル: ${file.name}\n\`\`\`\n${file.data}\n\`\`\`\n`;
            } else if (file.type.startsWith('image/')) {
                enhancedMessage += `\n画像: ${file.name}\n`;
            } else {
                enhancedMessage += `\nファイル: ${file.name} (${Math.round(file.size / 1024)}KB)\n`;
            }
        }
        
        // ファイルをクリア
        attachedFiles = [];
        const filePreview = document.getElementById('filePreview');
        filePreview.innerHTML = '';
        filePreview.style.display = 'none';
        
        // メッセージを一時的に変更
        messageInput.value = enhancedMessage;
    }
    
    // 元のsendMessage関数を呼び出す
    await sendMessage();
}

// チャットエクスポート機能
function exportChat() {
    if (messages.length === 0) {
        alert('エクスポートする会話がありません。');
        return;
    }
    
    // 現在の日時を取得
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    // エクスポート形式を選択
    const format = confirm('Markdown形式でエクスポートしますか？\n「キャンセル」を押すとJSON形式でエクスポートします。') ? 'markdown' : 'json';
    
    let content, filename, mimeType;
    
    if (format === 'markdown') {
        // Markdown形式
        content = `# AIチャット履歴\n\n`;
        content += `**エクスポート日時:** ${now.toLocaleString('ja-JP')}\n\n`;
        content += `---\n\n`;
        
        messages.forEach((msg, index) => {
            if (msg.role === 'user') {
                content += `### 👤 ユーザー\n`;
            } else {
                content += `### 🤖 AI アシスタント\n`;
            }
            content += `${msg.content}\n\n`;
            if (index < messages.length - 1) {
                content += `---\n\n`;
            }
        });
        
        filename = `chat-export-${timestamp}.md`;
        mimeType = 'text/markdown';
    } else {
        // JSON形式
        const exportData = {
            exportDate: now.toISOString(),
            chatId: currentChatId,
            messages: messages,
            metadata: {
                totalMessages: messages.length,
                userMessages: messages.filter(m => m.role === 'user').length,
                assistantMessages: messages.filter(m => m.role === 'assistant').length
            }
        };
        
        content = JSON.stringify(exportData, null, 2);
        filename = `chat-export-${timestamp}.json`;
        mimeType = 'application/json';
    }
    
    // ファイルをダウンロード
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 成功通知
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = `✅ チャットを${filename}にエクスポートしました`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// グローバル関数として公開（HTML内のonclickで利用可能にする）
// 直接sendMessage関数を使用（ファイル添付機能は一旦無効化）
window.sendMessage = sendMessage;
window.newChat = startNewChat;
window.exportChat = exportChat;
// toggleKnowledge, toggleVoice, toggleSpeak, startVoiceInputは既に定義済み

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeFileAttachment();
    initializeMarkdownRenderer();
});