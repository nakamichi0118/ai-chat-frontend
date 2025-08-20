let messages = [];
let currentChatId = Date.now();
let chatHistory = {};
let isGenerating = false;

const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusElement = document.getElementById('status');
const modelSelect = document.getElementById('modelSelect');

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

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isGenerating) return;
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    addMessage('user', message);
    
    isGenerating = true;
    sendButton.disabled = true;
    
    const typingDiv = addTypingIndicator();
    
    try {
        const response = await fetch('http://localhost:3001/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                model: modelSelect.value,
                history: messages.slice(-10)
            })
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
                            contentDiv.textContent = assistantMessage;
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
        
    } catch (error) {
        console.error('Error:', error);
        removeTypingIndicator(typingDiv);
        addMessage('assistant', 'エラーが発生しました。バックエンドサーバーが起動していることを確認してください。');
        setStatus('error');
    } finally {
        isGenerating = false;
        sendButton.disabled = false;
    }
}

function addMessage(role, content) {
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
    contentDiv.textContent = content;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    if (role === 'user') {
        messages.push({ role, content });
    }
    
    return messageDiv;
}

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

function newChat() {
    currentChatId = Date.now();
    messages = [];
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h2>新しいチャットを開始しました</h2>
            <p>何でもお聞きください。</p>
            <p class="info">※ このチャットは完全にローカルで動作し、データは外部に送信されません。</p>
        </div>
    `;
}

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
}

function setStatus(status) {
    if (status === 'error') {
        statusElement.textContent = '● 接続エラー';
        statusElement.className = 'status error';
    } else {
        statusElement.textContent = '● 接続中';
        statusElement.className = 'status';
    }
}

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

checkConnection();
setInterval(checkConnection, 30000);