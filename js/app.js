/**
 * 主應用類，負責協調 UI、連接和媒體處理
 */
class WebTransportApp {
    constructor() {
      // 初始化 UI 管理器
      this.uiManager = new UIManager();
      
      // 初始化連接管理器
      this.connectionManager = new ConnectionManager();
      
      // 初始化媒體處理器
      this.mediaProcessor = new MediaProcessor();
      
      // 本地媒體流
      this.localStream = null;
      
      // 初始化狀態
      this.initialized = false;
    }
    
    /**
     * 初始化應用
     */
    async init() {
      try {
        console.log('初始化 WebTransport 應用...');
        
        // 初始化 UI
        this.uiManager.init();
        
        // 設置 UI 回調
        this.uiManager.onJoinRoom = (roomId, displayName) => this.joinRoom(roomId, displayName);
        this.uiManager.onLeaveRoom = () => this.leaveRoom();
        this.uiManager.onToggleMute = () => this.toggleMute();
        this.uiManager.onToggleVideo = () => this.toggleVideo();
        
        // 設置連接管理器回調
        this.connectionManager.onUserJoined = (userId, displayName) => this.handleUserJoined(userId, displayName);
        this.connectionManager.onUserLeft = (userId) => this.handleUserLeft(userId);
        this.connectionManager.onRemoteStream = (userId, stream) => this.handleRemoteStream(userId, stream);
        this.connectionManager.onConnectionStateChange = (userId, state) => this.handleConnectionStateChange(userId, state);
        
        // 連接到信令服務器
        await this.connectionManager.connectSignaling();
        
        // 更新 UI 中的傳輸類型
        this.uiManager.updateTransportType(this.connectionManager.connectionStrategy);
        
        // 如果使用 WebTransport 策略，初始化媒體處理器
        if (this.connectionManager.connectionStrategy === 'webtransport') {
          const initialized = await this.mediaProcessor.init();
          if (initialized) {
            this.connectionManager.setMediaProcessor(this.mediaProcessor);
          } else {
            console.warn('媒體處理器初始化失敗，將回退到 WebRTC 策略');
            this.connectionManager.connectionStrategy = 'webrtc';
            this.uiManager.updateTransportType('webrtc');
          }
        }
        
        this.initialized = true;
        console.log('WebTransport 應用初始化完成');
      } catch (error) {
        console.error('初始化應用失敗:', error);
        this.uiManager.showError(`初始化失敗: ${error.message}`);
      }
    }
    
    /**
     * 獲取本地媒體流
     * @returns {Promise<MediaStream>} - 本地媒體流
     */
    async getLocalMedia() {
      try {
        const constraints = {
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('獲取本地媒體流成功');
        return stream;
      } catch (error) {
        console.error('獲取本地媒體流失敗:', error);
        this.uiManager.showError(`無法訪問攝像頭或麥克風: ${error.message}`);
        return null;
      }
    }
    
    /**
     * 加入房間
     * @param {string} roomId - 房間 ID
     * @param {string} displayName - 顯示名稱
     */
    async joinRoom(roomId, displayName) {
      if (!this.initialized) {
        console.warn('應用尚未初始化，無法加入房間');
        return;
      }
      
      try {
        // 獲取本地媒體流
        this.localStream = await this.getLocalMedia();
        if (!this.localStream) return;
        
        // 顯示本地視頻
        this.uiManager.displayLocalStream(this.localStream);
        
        // 設置連接管理器的本地流
        this.connectionManager.setLocalStream(this.localStream);
        
        // 加入房間
        await this.connectionManager.joinRoom(roomId, displayName);
        
        // 更新 UI
        this.uiManager.updateConnectionStatus(true, roomId);
        
        console.log(`成功加入房間: ${roomId}`);
      } catch (error) {
        console.error('加入房間失敗:', error);
        this.uiManager.showError(`加入房間失敗: ${error.message}`);
      }
    }
    
    /**
     * 離開房間
     */
    async leaveRoom() {
      if (!this.initialized) return;
      
      try {
        // 離開房間
        await this.connectionManager.leaveRoom();
        
        // 停止本地媒體流
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => track.stop());
          this.localStream = null;
        }
        
        // 更新 UI
        this.uiManager.updateConnectionStatus(false);
        
        console.log('已離開房間');
      } catch (error) {
        console.error('離開房間失敗:', error);
      }
    }
    
    /**
     * 切換靜音狀態
     */
    toggleMute() {
      if (!this.initialized || !this.localStream) return;
      
      const isMuted = this.uiManager.toggleMuteUI();
      this.connectionManager.toggleMute(isMuted);
    }
    
    /**
     * 切換視頻狀態
     */
    toggleVideo() {
      if (!this.initialized || !this.localStream) return;
      
      const isVideoOff = this.uiManager.toggleVideoUI();
      this.connectionManager.toggleVideo(isVideoOff);
    }
    
    /**
     * 處理用戶加入事件
     * @param {string} userId - 用戶 ID
     * @param {string} displayName - 顯示名稱
     */
    handleUserJoined(userId, displayName) {
      // 在 UI 中添加遠程用戶
      this.uiManager.addRemoteUser(userId, displayName);
    }
    
    /**
     * 處理用戶離開事件
     * @param {string} userId - 用戶 ID
     */
    handleUserLeft(userId) {
      // 從 UI 中移除遠程用戶
      this.uiManager.removeRemoteUser(userId);
    }
    
    /**
     * 處理遠程媒體流
     * @param {string} userId - 用戶 ID
     * @param {MediaStream} stream - 遠程媒體流
     */
    handleRemoteStream(userId, stream) {
      // 顯示遠程視頻流
      this.uiManager.displayRemoteStream(userId, stream);
    }
    
    /**
     * 處理連接狀態變化
     * @param {string} userId - 用戶 ID
     * @param {string} state - 連接狀態
     */
    handleConnectionStateChange(userId, state) {
      console.log(`用戶 ${userId} 的連接狀態變為: ${state}`);
      
      // 如果連接斷開，從 UI 中移除用戶
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.uiManager.removeRemoteUser(userId);
      }
    }
  }
  
  // 當頁面加載完成時初始化應用
  document.addEventListener('DOMContentLoaded', async () => {
    const app = new WebTransportApp();
    await app.init();
  });
  