// DOM 元素
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinRoomButton = document.getElementById('joinRoom');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');
const roomInput = document.getElementById('roomInput');
const statusDiv = document.getElementById('status');
const connectionStatus = document.getElementById('connectionStatus');

// 設定 STUN & TURN 伺服器 (增加多個選項提高連線成功率)
const peerConnection = new RTCPeerConnection({
    iceServers: [
        // Google 的公共 STUN 伺服器
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun.voipgain.com:3478" },
        
        // TURN 伺服器選項
        {
            urls: "turn:turn.anyfirewall.com:443?transport=tcp",
            username: "webrtc",
            credential: "webrtc"
        },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        
        {
            url: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        },
        {
            url: 'turn:192.158.29.39:3478?transport=udp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
        },
        {
            url: 'turn:192.158.29.39:3478?transport=tcp',
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
        },
        {
            url: 'turn:turn.bistri.com:80',
            credential: 'homeo',
            username: 'homeo'
         },
         {
            url: 'turn:turn.anyfirewall.com:443?transport=tcp',
            credential: 'webrtc',
            username: 'webrtc'
        }
    ],
    iceCandidatePoolSize: 10
});

let localStream;
let roomName = null;
let isInitiator = false;
let iceConnectionTimeout;
const ICE_TIMEOUT = 15000; // 15 秒

// 初始禁用按鈕
startCallButton.disabled = true;
endCallButton.disabled = true;

// 顯示連線狀態
function updateConnectionStatus(status) {
    statusDiv.style.display = 'block';
    connectionStatus.textContent = status;
    console.log('連線狀態:', status);
}

// 獲取用戶媒體（攝像頭和麥克風）
async function setupLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        // 將本地媒體流添加到 peer connection
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        console.log('本地媒體流已添加');
        
        joinRoomButton.disabled = false;
    } catch (error) {
        console.error('無法訪問攝像頭和麥克風:', error);
        alert('無法訪問攝像頭和麥克風。請確保您已授予權限並且設備正常工作。');
    }
}

// 設置 WebSocket 連接
let signalingSocket;

function connectSignalingServer() {
    // 使用您的 Glitch 伺服器
    signalingSocket = new WebSocket('wss://aluminum-tremendous-archaeology.glitch.me/');
    
    signalingSocket.onopen = () => {
        console.log('WebSocket 連接已建立');
        updateConnectionStatus('已連接到信令伺服器');
    };
    
    signalingSocket.onerror = error => {
        console.error('WebSocket 錯誤:', error);
        updateConnectionStatus('信令伺服器連接錯誤');
    };
    
    signalingSocket.onclose = () => {
        console.log('WebSocket 連接已關閉');
        updateConnectionStatus('與信令伺服器的連接已關閉');
    };
    
    signalingSocket.onmessage = async event => {
        try {
            let data;
            
            // 處理不同類型的消息數據
            if (event.data instanceof Blob) {
                const text = await event.data.text();
                data = JSON.parse(text);
            } else if (typeof event.data === 'string') {
                data = JSON.parse(event.data);
            } else {
                console.error('意外的 WebSocket 消息格式:', event.data);
                return;
            }
            
            console.log('收到 WebSocket 消息:', data);
            
            // 處理 WebRTC 信令消息
            if (data.type === 'join' && data.room === roomName) {
                console.log('有新用戶加入房間');
                if (isInitiator) {
                    startCallButton.disabled = false;
                }
            } else if (data.type === 'offer' && data.room === roomName) {
                console.log('收到 offer');
                updateConnectionStatus('收到通話請求...');
                
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                signalingSocket.send(JSON.stringify({
                    type: 'answer',
                    answer: answer,
                    room: roomName
                }));
                
                updateConnectionStatus('已回應通話請求');
            } else if (data.type === 'answer' && data.room === roomName) {
                console.log('收到 answer');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                updateConnectionStatus('對方已接受通話');
            } else if (data.type === 'candidate' && data.room === roomName) {
                console.log('收到 ICE candidate');
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('添加 ICE candidate 失敗:', e);
                }
            }
        } catch (error) {
            console.error('處理 WebSocket 消息失敗:', error);
        }
    };
}

// 監聽 ICE 連接狀態變化
peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE 連接狀態:', peerConnection.iceConnectionState);
    updateConnectionStatus('ICE 狀態: ' + peerConnection.iceConnectionState);
    
    if (peerConnection.iceConnectionState === 'checking') {
        // 開始計時
        clearTimeout(iceConnectionTimeout);
        iceConnectionTimeout = setTimeout(() => {
            if (peerConnection.iceConnectionState === 'checking') {
                updateConnectionStatus('連接逾時，嘗試使用 TURN 伺服器...');
                // 可以在這裡實現重試邏輯
            }
        }, ICE_TIMEOUT);
    } else if (peerConnection.iceConnectionState === 'connected' || 
               peerConnection.iceConnectionState === 'completed') {
        clearTimeout(iceConnectionTimeout);
        updateConnectionStatus('已成功建立連接');
    } else if (peerConnection.iceConnectionState === 'failed') {
        updateConnectionStatus('連接失敗，請嘗試重新連接');
    } else if (peerConnection.iceConnectionState === 'disconnected') {
        updateConnectionStatus('連接已斷開');
    }
};

// 當有 ICE 候選時發送給對方
peerConnection.onicecandidate = event => {
    if (event.candidate) {
        console.log('發送 ICE candidate');
        signalingSocket.send(JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
            room: roomName
        }));
    }
};

// 當有遠端流時顯示
peerConnection.ontrack = event => {
    console.log('收到遠端媒體流:', event.streams[0]);
    remoteVideo.srcObject = event.streams[0];
};

// 加入房間
joinRoomButton.onclick = () => {
    roomName = roomInput.value.trim();
    
    if (!roomName) {
        alert('請輸入房間名稱');
        return;
    }
    
    if (!signalingSocket || signalingSocket.readyState !== WebSocket.OPEN) {
        alert('正在連接信令伺服器，請稍候...');
        connectSignalingServer();
        setTimeout(() => joinRoom(), 1000);
        return;
    }
    
    joinRoom();
};

function joinRoom() {
    if (!signalingSocket || signalingSocket.readyState !== WebSocket.OPEN) {
        alert('信令伺服器未連接');
        return;
    }
    
    signalingSocket.send(JSON.stringify({
        type: 'join',
        room: roomName
    }));
    
    console.log(`已加入房間: ${roomName}`);
    updateConnectionStatus(`已加入房間: ${roomName}`);
    
    joinRoomButton.disabled = true;
    roomInput.disabled = true;
    startCallButton.disabled = false;
    isInitiator = true;
}

// 開始通話
startCallButton.onclick = async () => {
    try {
        console.log('開始通話');
        updateConnectionStatus('正在發起通話...');
        
        // 創建 offer
        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: true
        };
        
        const offer = await peerConnection.createOffer(offerOptions);
        await peerConnection.setLocalDescription(offer);
        
        signalingSocket.send(JSON.stringify({
            type: 'offer',
            offer: offer,
            room: roomName
        }));
        
        startCallButton.disabled = true;
        endCallButton.disabled = false;
    } catch (error) {
        console.error('發起通話失敗:', error);
        alert('發起通話失敗: ' + error.message);
    }
};

// 結束通話
endCallButton.onclick = () => {
    console.log('結束通話');
    
    // 關閉連接
    peerConnection.close();
    
    // 停止所有媒體軌道
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // 清除視頻
    remoteVideo.srcObject = null;
    
    // 重置 UI
    startCallButton.disabled = false;
    endCallButton.disabled = true;
    updateConnectionStatus('通話已結束');
    
    // 重新設置 peer connection
    setupPeerConnection();
};

// 重新設置 peer connection
function setupPeerConnection() {
    // 創建新的 peer connection
    peerConnection.close();
    
    // 重新配置 STUN & TURN 伺服器
    const newPeerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
            {
                urls: "turn:turn.anyfirewall.com:443?transport=tcp",
                username: "webrtc",
                credential: "webrtc"
            },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ],
        iceCandidatePoolSize: 10
    });
    
    // 重新綁定事件處理程序
    newPeerConnection.onicecandidate = peerConnection.onicecandidate;
    newPeerConnection.ontrack = peerConnection.ontrack;
    newPeerConnection.oniceconnectionstatechange = peerConnection.oniceconnectionstatechange;
    
    // 替換舊的連接
    peerConnection = newPeerConnection;
    
    // 重新添加本地媒體流
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
}

// 初始化
window.onload = () => {
    setupLocalMedia();
    connectSignalingServer();
    statusDiv.style.display = 'block';
};

// 處理頁面關閉
window.onbeforeunload = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (signalingSocket) {
        signalingSocket.close();
    }
};
