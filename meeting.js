// 議事録作成システム JavaScript

// グローバル変数
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let recordingStartTime = null;
let timerInterval = null;
let recognition = null;
let audioContext = null;
let analyser = null;
let microphone = null;
let animationId = null;

// 話者管理
let speakers = new Map();
let currentSpeaker = null;
let speakerColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
let lastSpeechTime = null;
let silenceThreshold = 2000; // 2秒以上の無音で話者交代の可能性
let currentTranscriptBuffer = ''; // 現在の音声認識バッファ

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeMeetingForm();
    initializeSpeechRecognition();
    initializeAudioVisualizer();
    setupFileUpload();
    
    // 現在の日時を設定
    const now = new Date();
    document.getElementById('meetingDateTime').value = now.toISOString().slice(0, 16);
});

// 会議フォーム初期化
function initializeMeetingForm() {
    // 話者検出トグル
    const speakerToggle = document.getElementById('speakerDetection');
    speakerToggle.addEventListener('change', (e) => {
        const mappingDiv = document.getElementById('speakerMapping');
        mappingDiv.style.display = e.target.checked ? 'block' : 'none';
        
        if (!e.target.checked) {
            // 話者検出をOFFにした場合、現在の話者をリセット
            currentSpeaker = '話者1';
            speakers.clear();
            speakers.set('話者1', {
                color: speakerColors[0],
                count: 0,
                lastActive: Date.now()
            });
        }
    });
    
    // 手動話者切り替えボタンを追加
    addManualSpeakerControls();
}

// 手動話者切り替えコントロール追加
function addManualSpeakerControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'manualSpeakerControls';
    controlsDiv.style.cssText = 'margin: 10px 0; display: flex; gap: 10px; align-items: center;';
    controlsDiv.innerHTML = `
        <button onclick="switchSpeaker()" class="btn btn-secondary" style="padding: 5px 10px;">
            話者切替 (現在: <span id="currentSpeakerDisplay">話者1</span>)
        </button>
        <input type="number" id="silenceThresholdInput" min="500" max="10000" step="500" value="${silenceThreshold}"
               style="width: 80px;" onchange="updateSilenceThreshold(this.value)">
        <label>無音閾値(ms)</label>
    `;
    
    const recordingSection = document.querySelector('.recording-section');
    if (recordingSection) {
        recordingSection.insertBefore(controlsDiv, recordingSection.firstChild);
    }
}

// 手動で話者を切り替え
function switchSpeaker() {
    const existingSpeakers = Array.from(speakers.keys());
    const maxNum = existingSpeakers.reduce((max, name) => {
        const match = name.match(/話者(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    
    const nextNum = maxNum + 1;
    currentSpeaker = `話者${nextNum}`;
    
    if (!speakers.has(currentSpeaker)) {
        speakers.set(currentSpeaker, {
            color: speakerColors[speakers.size % speakerColors.length],
            count: 0,
            lastActive: Date.now()
        });
        updateSpeakerMapping();
    }
    
    // 表示を更新
    const display = document.getElementById('currentSpeakerDisplay');
    if (display) {
        display.textContent = currentSpeaker;
    }
}

// 無音閾値を更新
function updateSilenceThreshold(value) {
    silenceThreshold = parseInt(value);
    console.log('無音閾値を更新:', silenceThreshold, 'ms');
}

// 音声認識初期化
function initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('音声認識がサポートされていません');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = handleSpeechResult;
    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
    };
    
    recognition.onend = () => {
        if (isRecording && !isPaused) {
            recognition.start(); // 自動再開
        }
    };
}

// 音声認識結果処理
function handleSpeechResult(event) {
    const transcriptBox = document.getElementById('realtimeTranscript');
    let finalTranscript = '';
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
            // 最終確定したテキスト
            finalTranscript += transcript;
            
            // バッファに追加
            currentTranscriptBuffer += transcript;
            
            // 話者検出が有効な場合
            if (document.getElementById('speakerDetection').checked) {
                const speaker = detectSpeaker(transcript);
                
                // 完全な文として追加（上書きではなく追加）
                addTranscriptLine(speaker, currentTranscriptBuffer.trim());
                currentTranscriptBuffer = ''; // バッファをクリア
            } else {
                addTranscriptLine('話者1', currentTranscriptBuffer.trim());
                currentTranscriptBuffer = '';
            }
        } else {
            interimTranscript = transcript; // 暫定結果（上書き）
        }
    }
    
    // リアルタイム表示更新（暫定結果を表示）
    if (interimTranscript || currentTranscriptBuffer) {
        showInterimTranscript(currentTranscriptBuffer + interimTranscript);
    }
}

// 話者検出（改善版）
function detectSpeaker(transcript) {
    const now = Date.now();
    
    // 初回または長い無音後は新しい話者の可能性
    if (!lastSpeechTime || (now - lastSpeechTime) > silenceThreshold) {
        // 話者が変わった可能性がある
        
        // 既存の話者がいない場合、または一定時間経過後
        if (!currentSpeaker || (now - lastSpeechTime) > silenceThreshold * 2) {
            // 新しい話者として扱う
            if (!currentSpeaker) {
                currentSpeaker = '話者1';
            } else {
                // 現在の話者数を確認して次の番号を割り当て
                const existingSpeakers = Array.from(speakers.keys());
                const maxNum = existingSpeakers.reduce((max, name) => {
                    const match = name.match(/話者(\d+)/);
                    return match ? Math.max(max, parseInt(match[1])) : max;
                }, 0);
                
                // 長い無音後は話者交代の可能性を考慮
                if ((now - lastSpeechTime) > silenceThreshold * 3) {
                    // 3倍の閾値を超えたら新しい話者の可能性が高い
                    const nextNum = maxNum + 1;
                    currentSpeaker = `話者${nextNum}`;
                }
            }
        }
    }
    
    // 話者情報を登録
    if (!speakers.has(currentSpeaker)) {
        speakers.set(currentSpeaker, {
            color: speakerColors[speakers.size % speakerColors.length],
            count: 0,
            lastActive: now
        });
        updateSpeakerMapping();
    } else {
        // 既存話者の最終活動時間を更新
        speakers.get(currentSpeaker).lastActive = now;
    }
    
    speakers.get(currentSpeaker).count++;
    lastSpeechTime = now;
    
    return currentSpeaker;
}

// 話者マッピング更新
function updateSpeakerMapping() {
    const mappingDiv = document.getElementById('speakerMapping');
    let html = '<h4>検出された話者:</h4>';
    
    speakers.forEach((info, name) => {
        html += `
            <div class="speaker-item">
                <span class="speaker-color" style="background: ${info.color}"></span>
                <input type="text" value="${name}" placeholder="名前を入力" 
                       onchange="renameSpeaker('${name}', this.value)">
                <span>(${info.count}回発言)</span>
            </div>
        `;
    });
    
    mappingDiv.innerHTML = html;
}

// 話者名変更
function renameSpeaker(oldName, newName) {
    if (oldName !== newName && newName) {
        const info = speakers.get(oldName);
        speakers.delete(oldName);
        speakers.set(newName, info);
        
        // 既存の文字起こしも更新
        document.querySelectorAll('.speaker-label').forEach(label => {
            if (label.textContent === oldName + ':') {
                label.textContent = newName + ':';
            }
        });
    }
}

// 文字起こし行追加（改善版）
function addTranscriptLine(speaker, text) {
    if (!text || text.trim() === '') return; // 空のテキストは追加しない
    
    const transcriptBox = document.getElementById('realtimeTranscript');
    
    // プレースホルダーを削除
    const placeholder = transcriptBox.querySelector('.placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // 暫定表示を削除
    const interim = document.getElementById('interimTranscript');
    if (interim) {
        interim.remove();
    }
    
    // 同じ話者の最後の行を確認（連続発言の場合は結合を検討）
    const allLines = transcriptBox.querySelectorAll('.transcript-line');
    const lastLine = allLines[allLines.length - 1];
    
    // 同じ話者が短時間で連続して話している場合
    if (lastLine) {
        const lastSpeaker = lastLine.querySelector('.speaker-label')?.textContent.replace(':', '');
        const lastTimestamp = lastLine.getAttribute('data-timestamp');
        const now = Date.now();
        
        // 同じ話者で、5秒以内の発言の場合は結合
        if (lastSpeaker === speaker && lastTimestamp && (now - parseInt(lastTimestamp)) < 5000) {
            const lastText = lastLine.querySelector('.transcript-text');
            if (lastText) {
                // 既存のテキストに追加
                lastText.textContent = lastText.textContent + ' ' + text;
                // タイムスタンプ更新
                lastLine.querySelector('.timestamp').textContent = new Date().toLocaleTimeString();
                lastLine.setAttribute('data-timestamp', now.toString());
                transcriptBox.scrollTop = transcriptBox.scrollHeight;
                return;
            }
        }
    }
    
    // 新しい行として追加
    const line = document.createElement('div');
    line.className = 'transcript-line';
    line.setAttribute('data-timestamp', Date.now().toString());
    
    const speakerInfo = speakers.get(speaker);
    const color = speakerInfo ? speakerInfo.color : '#666';
    
    line.innerHTML = `
        <span class="speaker-label" style="color: ${color}">${speaker}:</span>
        <span class="transcript-text">${text}</span>
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
    `;
    
    transcriptBox.appendChild(line);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

// 暫定文字起こし表示
function showInterimTranscript(text) {
    let interim = document.getElementById('interimTranscript');
    if (!interim) {
        interim = document.createElement('div');
        interim.id = 'interimTranscript';
        interim.style.opacity = '0.6';
        interim.style.fontStyle = 'italic';
        document.getElementById('realtimeTranscript').appendChild(interim);
    }
    interim.textContent = '認識中: ' + text;
}

// オーディオビジュアライザー初期化
function initializeAudioVisualizer() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
}

// ビジュアライザー描画
function drawVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            
            ctx.fillStyle = `rgb(16, ${163 + barHeight}, 127)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    };
    
    draw();
}

// 録音トグル
async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

// 録音開始
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // MediaRecorder設定
        const options = { mimeType: 'audio/webm' };
        mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            processRecording(audioBlob);
        };
        
        // オーディオビジュアライザー接続
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        drawVisualizer();
        
        // 録音開始
        mediaRecorder.start(1000); // 1秒ごとにデータ取得
        audioChunks = [];
        isRecording = true;
        recordingStartTime = Date.now();
        
        // 音声認識開始
        if (recognition) {
            recognition.start();
        }
        
        // UI更新
        updateRecordingUI(true);
        startTimer();
        
    } catch (error) {
        console.error('録音開始エラー:', error);
        alert('マイクへのアクセスが拒否されました');
    }
}

// 録音一時停止
function pauseRecording() {
    if (!isRecording) return;
    
    if (!isPaused) {
        mediaRecorder.pause();
        if (recognition) recognition.stop();
        isPaused = true;
        document.getElementById('pauseBtn').textContent = '再開';
    } else {
        mediaRecorder.resume();
        if (recognition) recognition.start();
        isPaused = false;
        document.getElementById('pauseBtn').textContent = '一時停止';
    }
}

// 録音停止
function stopRecording() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    
    if (recognition) {
        recognition.stop();
    }
    
    if (microphone) {
        microphone.disconnect();
    }
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    isRecording = false;
    isPaused = false;
    
    updateRecordingUI(false);
    stopTimer();
}

// 録音UI更新
function updateRecordingUI(recording) {
    const recordBtn = document.getElementById('recordBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusIndicator = document.getElementById('statusIndicator');
    
    if (recording) {
        recordBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        
        statusIndicator.querySelector('.status-dot').classList.add('recording');
        statusIndicator.querySelector('.status-text').textContent = '録音中';
    } else {
        recordBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        
        statusIndicator.querySelector('.status-dot').classList.remove('recording');
        statusIndicator.querySelector('.status-text').textContent = '待機中';
    }
}

// タイマー
function startTimer() {
    const timerElement = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        timerElement.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// 録音処理
async function processRecording(audioBlob) {
    showProcessingModal('音声を解析しています...');
    
    // 既存の文字起こしデータを収集
    const existingTranscripts = [];
    document.querySelectorAll('.transcript-line').forEach(line => {
        const speaker = line.querySelector('.speaker-label')?.textContent.replace(':', '');
        const text = line.querySelector('.transcript-text')?.textContent;
        const timestamp = line.querySelector('.timestamp')?.textContent;
        if (speaker && text) {
            existingTranscripts.push({ speaker, text, timestamp });
        }
    });
    
    // 音声をBase64に変換
    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        
        try {
            // バックエンドに送信して文字起こし＆議事録生成
            const response = await fetch('http://localhost:3001/api/meeting/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    meetingInfo: getMeetingInfo(),
                    speakers: Array.from(speakers.entries()),
                    transcripts: existingTranscripts  // 既存の文字起こしも送信
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                updateMinutes(result.minutes);
                hideProcessingModal();
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            console.error('処理エラー:', error);
            hideProcessingModal();
            alert('議事録の生成に失敗しました');
        }
    };
    
    reader.readAsDataURL(audioBlob);
}

// 会議情報取得
function getMeetingInfo() {
    const participants = [];
    document.querySelectorAll('.participant-name').forEach(input => {
        if (input.value) participants.push(input.value);
    });
    
    return {
        title: document.getElementById('meetingTitle').value || '無題の会議',
        dateTime: document.getElementById('meetingDateTime').value,
        participants: participants
    };
}

// 議事録生成
async function generateMinutes() {
    const transcriptBox = document.getElementById('realtimeTranscript');
    const transcripts = [];
    
    transcriptBox.querySelectorAll('.transcript-line').forEach(line => {
        const speaker = line.querySelector('.speaker-label')?.textContent.replace(':', '');
        const text = line.querySelector('.transcript-text')?.textContent;
        if (speaker && text) {
            transcripts.push({ speaker, text });
        }
    });
    
    if (transcripts.length === 0) {
        alert('文字起こしデータがありません');
        return;
    }
    
    showProcessingModal('議事録を生成しています...');
    
    try {
        const response = await fetch('http://localhost:3001/api/meeting/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                meetingInfo: getMeetingInfo(),
                transcripts: transcripts
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateMinutes(result.minutes);
        }
        
    } catch (error) {
        console.error('議事録生成エラー:', error);
        alert('議事録の生成に失敗しました');
    } finally {
        hideProcessingModal();
    }
}

// 議事録更新
function updateMinutes(minutes) {
    document.getElementById('minutesTitle').textContent = minutes.title;
    document.getElementById('minutesDate').textContent = minutes.dateTime;
    document.getElementById('minutesParticipants').textContent = minutes.participants.join(', ');
    
    // 議題
    const agendaList = document.getElementById('minutesAgenda');
    agendaList.innerHTML = minutes.agenda.map(item => `<li>${item}</li>`).join('');
    
    // 議論内容
    document.getElementById('minutesDiscussion').innerHTML = minutes.discussion;
    
    // 決定事項
    const decisionsList = document.getElementById('minutesDecisions');
    decisionsList.innerHTML = minutes.decisions.map(item => `<li>${item}</li>`).join('');
    
    // アクションアイテム
    const actionsTable = document.getElementById('minutesActions');
    actionsTable.innerHTML = minutes.actionItems.map(item => `
        <tr>
            <td>${item.task}</td>
            <td>${item.assignee}</td>
            <td>${item.deadline}</td>
        </tr>
    `).join('');
    
    // 次回予定
    document.getElementById('minutesNextMeeting').textContent = minutes.nextMeeting || '未定';
}

// 参加者追加
function addParticipant() {
    const list = document.getElementById('participantsList');
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.innerHTML = `
        <input type="text" placeholder="参加者名" class="participant-name">
        <button class="btn-remove" onclick="removeParticipant(this)">×</button>
    `;
    list.appendChild(item);
}

// 参加者削除
function removeParticipant(btn) {
    btn.parentElement.remove();
}

// ファイルアップロード設定
function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('audioFile');
    
    // ドラッグ&ドロップ
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    // ファイル選択
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

// ファイルアップロード処理
async function handleFileUpload(file) {
    if (!file.type.startsWith('audio/')) {
        alert('音声ファイルを選択してください');
        return;
    }
    
    showProcessingModal('音声ファイルを処理しています...');
    
    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        
        try {
            const response = await fetch('http://localhost:3001/api/meeting/transcribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    meetingInfo: getMeetingInfo()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // 文字起こし結果を表示
                const transcriptBox = document.getElementById('realtimeTranscript');
                transcriptBox.innerHTML = '';
                
                result.transcripts.forEach(item => {
                    addTranscriptLine(item.speaker || '話者', item.text);
                });
                
                // 議事録を更新
                if (result.minutes) {
                    updateMinutes(result.minutes);
                }
            }
            
        } catch (error) {
            console.error('アップロード処理エラー:', error);
            alert('ファイルの処理に失敗しました');
        } finally {
            hideProcessingModal();
        }
    };
    
    reader.readAsDataURL(file);
}

// エクスポート
function exportMinutes() {
    const format = 'markdown'; // デフォルト
    exportAs(format);
}

function exportAs(format) {
    const minutes = collectMinutesData();
    
    switch (format) {
        case 'markdown':
            exportAsMarkdown(minutes);
            break;
        case 'text':
            exportAsText(minutes);
            break;
        case 'word':
            alert('Word形式のエクスポートは準備中です');
            break;
        case 'pdf':
            alert('PDF形式のエクスポートは準備中です');
            break;
    }
}

// 議事録データ収集
function collectMinutesData() {
    return {
        title: document.getElementById('minutesTitle').textContent,
        dateTime: document.getElementById('minutesDate').textContent,
        participants: document.getElementById('minutesParticipants').textContent,
        agenda: Array.from(document.querySelectorAll('#minutesAgenda li')).map(li => li.textContent),
        discussion: document.getElementById('minutesDiscussion').innerHTML,
        decisions: Array.from(document.querySelectorAll('#minutesDecisions li')).map(li => li.textContent),
        actionItems: Array.from(document.querySelectorAll('#minutesActions tr')).map(tr => {
            const cells = tr.querySelectorAll('td');
            return {
                task: cells[0]?.textContent,
                assignee: cells[1]?.textContent,
                deadline: cells[2]?.textContent
            };
        }),
        nextMeeting: document.getElementById('minutesNextMeeting').textContent
    };
}

// Markdownエクスポート
function exportAsMarkdown(minutes) {
    let markdown = `# 議事録\n\n`;
    markdown += `**会議名:** ${minutes.title}\n\n`;
    markdown += `**日時:** ${minutes.dateTime}\n\n`;
    markdown += `**参加者:** ${minutes.participants}\n\n`;
    
    markdown += `## 議題\n\n`;
    minutes.agenda.forEach(item => {
        markdown += `- ${item}\n`;
    });
    
    markdown += `\n## 議論内容\n\n${minutes.discussion}\n\n`;
    
    markdown += `## 決定事項\n\n`;
    minutes.decisions.forEach(item => {
        markdown += `- ${item}\n`;
    });
    
    markdown += `\n## アクションアイテム\n\n`;
    markdown += `| タスク | 担当者 | 期限 |\n`;
    markdown += `|--------|--------|------|\n`;
    minutes.actionItems.forEach(item => {
        if (item.task) {
            markdown += `| ${item.task} | ${item.assignee} | ${item.deadline} |\n`;
        }
    });
    
    markdown += `\n## 次回予定\n\n${minutes.nextMeeting}\n`;
    
    downloadFile(markdown, `議事録_${minutes.title}_${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown');
}

// テキストエクスポート
function exportAsText(minutes) {
    let text = `議事録\n${'='.repeat(50)}\n\n`;
    text += `会議名: ${minutes.title}\n`;
    text += `日時: ${minutes.dateTime}\n`;
    text += `参加者: ${minutes.participants}\n\n`;
    
    text += `議題\n${'-'.repeat(30)}\n`;
    minutes.agenda.forEach((item, i) => {
        text += `${i + 1}. ${item}\n`;
    });
    
    text += `\n議論内容\n${'-'.repeat(30)}\n${minutes.discussion.replace(/<[^>]*>/g, '')}\n\n`;
    
    text += `決定事項\n${'-'.repeat(30)}\n`;
    minutes.decisions.forEach((item, i) => {
        text += `${i + 1}. ${item}\n`;
    });
    
    text += `\nアクションアイテム\n${'-'.repeat(30)}\n`;
    minutes.actionItems.forEach(item => {
        if (item.task) {
            text += `・${item.task} (担当: ${item.assignee}, 期限: ${item.deadline})\n`;
        }
    });
    
    text += `\n次回予定: ${minutes.nextMeeting}\n`;
    
    downloadFile(text, `議事録_${minutes.title}_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
}

// ファイルダウンロード
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// 処理中モーダル
function showProcessingModal(message) {
    const modal = document.getElementById('processingModal');
    const status = document.getElementById('processingStatus');
    status.textContent = message;
    modal.classList.add('active');
}

function hideProcessingModal() {
    const modal = document.getElementById('processingModal');
    modal.classList.remove('active');
}

// プログレスバー更新
function updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    fill.style.width = percent + '%';
}

// グローバル関数として公開
window.switchSpeaker = switchSpeaker;
window.updateSilenceThreshold = updateSilenceThreshold;
window.toggleRecording = toggleRecording;
window.pauseRecording = pauseRecording;
window.stopRecording = stopRecording;
window.addParticipant = addParticipant;
window.removeParticipant = removeParticipant;
window.generateMinutes = generateMinutes;
window.exportMinutes = exportMinutes;
window.exportAs = exportAs;
window.renameSpeaker = renameSpeaker;