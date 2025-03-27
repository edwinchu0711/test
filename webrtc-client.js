// DOM 元素
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinRoomButton = document.getElementById('joinRoom');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');
const roomInput = document.getElementById('roomInput');
const connectionStatus = document.getElementById('connectionStatus');
const iceStatus = document.getElementById('iceStatus');

// Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyBxC9R5PoRBxh8mR8gWkP0qLB7MHVVs4_A",
  authDomain: "webrtc-signaling-demo.firebaseapp.com",
  databaseURL: "https://webrtc-signaling-demo-default-rtdb.firebaseio.com",
  projectId: "webrtc-signaling-demo",
  storageBucket: "webrtc-signaling-demo.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:1234567890abcdef"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// WebRTC 變數
let localStream;
let peerConnection;
let roomName;
let currentRoomRef;
let roomExists = false;
let isInitiator = false;
let iceConnectionTimeout;
const ICE_TIMEOUT = 15000; // 15 秒連線超時

// 初始化 WebRTC 連接
function initializePeerConnection() {
  // 配置多個 STUN/TURN 伺服器以提高連線成功率
  peerConnection = new RTCPeerConnection({
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
      },
      {
        urls: "turn:openrelay.metered.ca:80?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ],
    iceCandidatePoolSize: 10
  });

  // 監聽 ICE 候選
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      // 發送 ICE 候選到 Firebase
      const candidateRef = database.ref(`rooms/${roomName}/candidates/${isInitiator ? 'caller' : 'callee'}`).push();
      candidateRef.set(event.candidate.toJSON());
      
      updateStatus(`發送 ICE 候選: ${event.candidate.candidate.split(' ')[7]}`);
    } else {
      updateStatus('ICE 候選收集完成');
    }
  };

  // 監聽 ICE 連線狀態變化
  peerConnection.oniceconnectionstatechange = () => {
    updateStatus(`ICE 連線狀態: ${peerConnection.iceConnectionState}`);
    
    if (peerConnection.iceConnectionState === 'checking') {
      // 開始計時
      clearTimeout(iceConnectionTimeout);
      iceConnectionTimeout = setTimeout(() => {
        if (peerConnection.iceConnectionState === 'checking' || peerConnection.iceConnectionState === 'new') {
          updateStatus('連線逾時，嘗試使用 TCP 連線...', true);
          // 嘗試重啟 ICE
          if (isInitiator) {
            createAndSendOffer(true);
          }
        }
      }, ICE_TIMEOUT);
    } else if (peerConnection.iceConnectionState === 'connected' || 
               peerConnection.iceConnectionState === 'completed') {
      clearTimeout(iceConnectionTimeout);
      updateStatus('連線成功！可以開始視訊通話');
    } else if (peerConnection.iceConnectionState === 'failed' || 
               peerConnection.iceConnectionState === 'disconnected' || 
               peerConnection.iceConnectionState === 'closed') {
      updateStatus('連線失敗或中斷。請確認網路設定或重新連線。', true);
    }
  };

  // 監聽遠端媒體流
  peerConnection.ontrack = event => {
    updateStatus('收到遠端視訊流');
    remoteVideo.srcObject = event.streams[0];
  };

  // 添加本地媒體流到連接
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    updateStatus('已添加本地視訊流到連接');
  }
}

// 更新狀態顯示
function updateStatus(message, isError = false) {
  console.log(message);
  const statusElement = document.createElement('div');
  statusElement.textContent = message;
  if (isError) {
    statusElement.className = 'error';
  }
  iceStatus.prepend(statusElement);
  
  // 限制顯示的狀態數量
  while (iceStatus.children.length > 5) {
    iceStatus.removeChild(iceStatus.lastChild);
  }
}

// 獲取用戶媒體
async function getLocalMedia() {
  try {
    const constraints = { 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: true 
    };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    updateStatus('成功獲取本地視訊');
    joinRoomButton.disabled = false;
    
    return true;
  } catch (error) {
    console.error('無法獲取媒體設備:', error);
    updateStatus(`無法獲取攝影機或麥克風: ${error.message}`, true);
    return false;
  }
}

// 創建並發送 Offer
async function createAndSendOffer(iceRestart = false) {
  try {
    const offerOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    };
    
    if (iceRestart) {
      offerOptions.iceRestart = true;
    }
    
    const offer = await peerConnection.createOffer(offerOptions);
    await peerConnection.setLocalDescription(offer);
    
    // 發送 offer 到 Firebase
    await database.ref(`rooms/${roomName}/offer`).set({
      type: offer.type,
      sdp: offer.sdp
    });
    
    updateStatus('已發送通話邀請');
  } catch (error) {
    console.error('創建 offer 失敗:', error);
    updateStatus(`創建通話邀請失敗: ${error.message}`, true);
  }
}

// 創建並發送 Answer
async function createAndSendAnswer() {
  try {
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    // 發送 answer 到 Firebase
    await database.ref(`rooms/${roomName}/answer`).set({
      type: answer.type,
      sdp: answer.sdp
    });
    
    updateStatus('已接受通話邀請');
  } catch (error) {
    console.error('創建 answer 失敗:', error);
    updateStatus(`接受通話邀請失敗: ${error.message}`, true);
  }
}

// 加入房間
async function joinRoom() {
  roomName = roomInput.value.trim();
  if (!roomName) {
    alert('請輸入房間名稱');
    return;
  }
  
  // 檢查房間是否已存在
  const roomRef = database.ref(`rooms/${roomName}`);
  const snapshot = await roomRef.once('value');
  roomExists = snapshot.exists();
  
  // 初始化連接
  initializePeerConnection();
  
  if (roomExists) {
    updateStatus(`加入房間: ${roomName}`);
    isInitiator = false;
    
    // 監聽 offer
    database.ref(`rooms/${roomName}/offer`).on('value', async snapshot => {
      const offer = snapshot.val();
      if (offer && !peerConnection.currentRemoteDescription) {
        updateStatus('收到通話邀請');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await createAndSendAnswer();
      }
    });
  } else {
    updateStatus(`創建新房間: ${roomName}`);
    isInitiator = true;
    startCallButton.disabled = false;
  }
  
  // 監聽 answer
  database.ref(`rooms/${roomName}/answer`).on('value', async snapshot => {
    const answer = snapshot.val();
    if (answer && peerConnection.signalingState !== 'stable') {
      updateStatus('收到對方接受通話');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });
  
  // 監聽 ICE 候選
  const candidatesRef = isInitiator ? 
    database.ref(`rooms/${roomName}/candidates/callee`) : 
    database.ref(`rooms/${roomName}/candidates/caller`);
  
  candidatesRef.on('child_added', async snapshot => {
    const candidate = snapshot.val();
    if (candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        updateStatus('添加對方 ICE 候選');
      } catch (error) {
        console.error('添加 ICE 候選失敗:', error);
      }
    }
  });
  
  // 設置房間清理
  database.ref(`rooms/${roomName}`).onDisconnect().remove();
  
  // 更新 UI
  joinRoomButton.disabled = true;
  roomInput.disabled = true;
  if (isInitiator) {
    startCallButton.disabled = false;
  } else {
    startCallButton.disabled = true;
    endCallButton.disabled = false;
  }
  
  connectionStatus.textContent = `連線狀態: 已${isInitiator ? '創建' : '加入'}房間 ${roomName}`;
}

// 開始通話
function startCall() {
  createAndSendOffer();
  startCallButton.disabled = true;
  endCallButton.disabled = false;
}

// 結束通話
function endCall() {
  if (peerConnection) {
    peerConnection.close();
  }
  
  if (roomName) {
    database.ref(`rooms/${roomName}`).remove();
  }
  
  // 重置 UI
  remoteVideo.srcObject = null;
  startCallButton.disabled = true;
  endCallButton.disabled = true;
  joinRoomButton.disabled = false;
  roomInput.disabled = false;
  
  // 重置狀態
  connectionStatus.textContent = '連線狀態: 通話已結束';
  updateStatus('通話已結束');
  
  // 釋放資源
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // 重新獲取媒體
  getLocalMedia();
}

// 初始化
async function initialize() {
  // 禁用按鈕直到媒體準備好
  joinRoomButton.disabled = true;
  startCallButton.disabled = true;
  endCallButton.disabled = true;
  
  // 獲取本地媒體
  await getLocalMedia();
  
  // 設置按鈕事件
  joinRoomButton.addEventListener('click', joinRoom);
  startCallButton.addEventListener('click', startCall);
  endCallButton.addEventListener('click', endCall);
}

// 啟動應用
initialize();

// 處理頁面關閉
window.addEventListener('beforeunload', () => {
  if (roomName) {
    database.ref(`rooms/${roomName}`).remove();
  }
});
