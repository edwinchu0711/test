/**
 * UI 管理類，負責處理用戶界面相關操作
 */
class UIManager {
    constructor() {
      // UI 元素
      this.joinContainer = document.getElementById('joinContainer');
      this.callContainer = document.getElementById('callContainer');
      this.errorContainer = document.getElementById('errorContainer');
      this.errorMessage = document.getElementById('errorMessage');
      this.connectionStatus = document.getElementById('connectionStatus');
      this.transportType = document.getElementById('transportType');
      this.videoGrid = document.getElementById('videoGrid');
      this.localVideo = document.getElementById('localVideo');
      
      // 按鈕
      this.joinButton = document.getElementById('joinButton');
      this.muteButton = document.getElementById('muteButton');
      this.videoButton = document.getElementById('videoButton');
      this.hangupButton = document.getElementById('hangupButton');
      this.dismissErrorButton = document.getElementById('dismissErrorButton');
      
      // 輸入框
      this.roomIdInput = document.getElementById('roomIdInput');
      this.displayNameInput = document.getElementById('displayNameInput');
      
      // 狀態
      this.isMuted = false;
      this.isVideoOff = false;
      
      // 回調函數
      this.onJoinRoom = null;
      this.onLeaveRoom = null;
      this.onToggleMute = null;
      this.onToggleVideo = null;
    }
    
    /**
     * 初始化 UI 和事件監聽
     */
    init() {
      // 綁定按鈕事件
      this.joinButton.addEventListener('click', () => {
        const roomId = this.roomIdInput.value.trim() || this.generateRoomId();
        const displayName = this.displayNameInput.value.trim() || '匿名用戶';
        
        if (this.onJoinRoom) {
          this.onJoinRoom(roomId, displayName);
        }
      });
      
      this.muteButton.addEventListener('click', () => {
        if (this.onToggleMute) {
          this.onToggleMute();
        }
      });
      
      this.videoButton.addEventListener('click', () => {
        if (this.onToggleVideo) {
          this.onToggleVideo();
        }
      });
      
      this.hangupButton.addEventListener('click', () => {
        if (this.onLeaveRoom) {
          this.onLeaveRoom();
        }
      });
      
      this.dismissErrorButton.addEventListener('click', () => {
        this.hideError();
      });
      
      console.log('UI 管理器初始化完成');
    }
    
    /**
     * 生成隨機房間 ID
     */
    generateRoomId() {
      return 'room_' + Math.floor(Math.random() * 1000000);
    }
    
    /**
     * 顯示本地視頻流
     * @param {MediaStream} stream - 本地媒體流
     */
    displayLocalStream(stream) {
      this.localVideo.srcObject = stream;
      console.log('顯示本地視頻流');
    }
    
    /**
     * 添加遠程用戶
     * @param {string} userId - 用戶 ID
     * @param {string} displayName - 顯示名稱
     */
    addRemoteUser(userId, displayName) {
      // 檢查是否已存在
      if (document.getElementById(`video-${userId}`)) {
        return;
      }
      
      const videoItem = document.createElement('div');
      videoItem.className = 'video-item remote';
      videoItem.id = `container-${userId}`;
      videoItem.innerHTML = `
        <video id="video-${userId}" autoplay playsinline></video>
        <div class="video-label">${displayName || userId}</div>
      `;
      
      this.videoGrid.appendChild(videoItem);
      console.log(`添加遠程用戶: ${userId}`);
      
      return document.getElementById(`video-${userId}`);
    }
    
    /**
     * 顯示遠程視頻流
     * @param {string} userId - 用戶 ID
     * @param {MediaStream} stream - 遠程媒體流
     */
    displayRemoteStream(userId, stream) {
      const videoElement = document.getElementById(`video-${userId}`);
      if (videoElement) {
        videoElement.srcObject = stream;
        console.log(`顯示用戶 ${userId} 的遠程視頻流`);
      } else {
        console.warn(`找不到用戶 ${userId} 的視頻元素`);
      }
    }
    
    /**
     * 移除遠程用戶
     * @param {string} userId - 用戶 ID
     */
    removeRemoteUser(userId) {
      const container = document.getElementById(`container-${userId}`);
      if (container) {
        container.remove();
        console.log(`移除遠程用戶: ${userId}`);
      }
    }
    
    /**
     * 切換靜音狀態
     * @returns {boolean} - 新的靜音狀態
     */
    toggleMuteUI() {
      this.isMuted = !this.isMuted;
      if (this.isMuted) {
        this.muteButton.classList.add('active');
        this.muteButton.querySelector('.icon').textContent = '🔇';
      } else {
        this.muteButton.classList.remove('active');
        this.muteButton.querySelector('.icon').textContent = '🎤';
      }
      console.log(`靜音狀態: ${this.isMuted}`);
      return this.isMuted;
    }
    
    /**
     * 切換視頻狀態
     * @returns {boolean} - 新的視頻狀態
     */
    toggleVideoUI() {
      this.isVideoOff = !this.isVideoOff;
      if (this.isVideoOff) {
        this.videoButton.classList.add('active');
        this.videoButton.querySelector('.icon').textContent = '🚫';
      } else {
        this.videoButton.classList.remove('active');
        this.videoButton.querySelector('.icon').textContent = '📹';
      }
      console.log(`視頻狀態: ${this.isVideoOff ? '關閉' : '開啟'}`);
      return this.isVideoOff;
    }
    
    /**
     * 更新連接狀態
     * @param {boolean} isConnected - 是否已連接
     * @param {string} roomId - 房間 ID
     */
    updateConnectionStatus(isConnected, roomId = '') {
      if (isConnected) {
        this.connectionStatus.textContent = `已連接到房間: ${roomId}`;
        this.connectionStatus.classList.add('connected');
        this.joinContainer.classList.add('hidden');
        this.callContainer.classList.remove('hidden');
      } else {
        this.connectionStatus.textContent = '未連接';
        this.connectionStatus.classList.remove('connected');
        this.callContainer.classList.add('hidden');
        this.joinContainer.classList.remove('hidden');
      }
    }
    
    /**
     * 更新傳輸類型
     * @param {string} type - 傳輸類型 ('webtransport' 或 'webrtc')
     */
    updateTransportType(type) {
      this.transportType.textContent = type === 'webtransport' ? 'WebTransport' : 'WebRTC';
      this.transportType.className = 'transport-type ' + type;
    }
    
    /**
     * 顯示錯誤訊息
     * @param {string} message - 錯誤訊息
     */
    showError(message) {
      this.errorMessage.textContent = message;
      this.errorContainer.classList.remove('hidden');
    }
    
    /**
     * 隱藏錯誤訊息
     */
    hideError() {
      this.errorContainer.classList.add('hidden');
    }
  }
  