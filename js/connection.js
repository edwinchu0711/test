/**
 * 連接管理類，負責處理 WebTransport 和 WebRTC 連接
 */
class ConnectionManager {
    constructor() {
      // 連接狀態
      this.signalingConnected = false;
      this.transportConnected = false;
      this.roomId = null;
      this.userId = null;
      this.displayName = null;
      
      // WebSocket 連接
      this.signalingSocket = null;
      this.signalingUrl = 'wss://aluminum-tremendous-archaeology.glitch.me'; // 替換為您的信令服務器地址
      
      // WebTransport 連接
      this.webTransports = new Map(); // userId -> WebTransport
      
      // WebRTC 連接
      this.peerConnections = new Map(); // userId -> RTCPeerConnection
      
      // 本地媒體流
      this.localStream = null;
      
      // 媒體處理器
      this.mediaProcessor = null;
      
      // 功能檢測
      this.features = {
        webTransport: typeof WebTransport !== 'undefined',
        webRTC: typeof RTCPeerConnection !== 'undefined',
        webCodecs: typeof VideoEncoder !== 'undefined',
        mediaStreamTrackProcessor: typeof MediaStreamTrackProcessor !== 'undefined'
      };
      
      // 連接策略
      this.connectionStrategy = this.determineConnectionStrategy();
      
      // 回調函數
      this.onUserJoined = null;
      this.onUserLeft = null;
      this.onRemoteStream = null;
      this.onConnectionStateChange = null;
    }
    
    /**
     * 確定連接策略
     * @returns {string} - 連接策略 ('webtransport' 或 'webrtc')
     */
    determineConnectionStrategy() {
      if (this.features.webTransport && this.features.webCodecs && this.features.mediaStreamTrackProcessor) {
        console.log('使用 WebTransport 策略');
        return 'webtransport';
      } else if (this.features.webRTC) {
        console.log('使用 WebRTC 策略');
        return 'webrtc';
      } else {
        console.error('瀏覽器不支持任何可用的連接策略');
        return 'none';
      }
    }
    
    /**
     * 設置媒體處理器
     * @param {MediaProcessor} processor - 媒體處理器實例
     */
    setMediaProcessor(processor) {
      this.mediaProcessor = processor;
      
      // 設置編碼回調
      if (processor) {
        processor.onEncodedVideoChunk = (chunk) => this.handleEncodedVideoChunk(chunk);
        processor.onEncodedAudioChunk = (chunk) => this.handleEncodedAudioChunk(chunk);
      }
    }
    
    /**
     * 連接到信令服務器
     */
    async connectSignaling() {
      return new Promise((resolve, reject) => {
        try {
          this.signalingSocket = new WebSocket(this.signalingUrl);
          
          this.signalingSocket.onopen = () => {
            console.log('已連接到信令服務器');
            this.signalingConnected = true;
            resolve();
          };
          
          this.signalingSocket.onclose = () => {
            console.log('與信令服務器的連接已關閉');
            this.signalingConnected = false;
            
            // 嘗試重新連接
            setTimeout(() => {
              if (!this.signalingConnected) {
                console.log('嘗試重新連接到信令服務器...');
                this.connectSignaling().catch(console.error);
              }
            }, 5000);
          };
          
          this.signalingSocket.onerror = (error) => {
            console.error('信令服務器連接錯誤:', error);
            reject(error);
          };
          
          this.signalingSocket.onmessage = (event) => {
            this.handleSignalingMessage(event.data);
          };
        } catch (error) {
          console.error('連接信令服務器失敗:', error);
          reject(error);
        }
      });
    }
    
    /**
     * 處理來自信令服務器的消息
     * @param {string} data - 消息數據
     */
    handleSignalingMessage(data) {
        try {
          // 檢查消息類型
          if (data instanceof Blob) {
            // 如果是 Blob，先轉換為文本
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const message = JSON.parse(reader.result);
                this.processSignalingMessage(message);
              } catch (error) {
                console.error('解析信令消息失敗:', error);
              }
            };
            reader.readAsText(data);
          } else {
            // 如果已經是文本或其他格式
            const message = JSON.parse(data);
            this.processSignalingMessage(message);
          }
        } catch (error) {
          console.error('處理信令消息時出錯:', error);
        }
      }
      
      processSignalingMessage(message) {
        switch (message.type) {
          case 'join-room':
            this.handleJoinRoom(message.roomId, message.userId, message.displayName, message.supportWebTransport);
            break;
            
          case 'user-joined':
            this.handleUserJoined(message.userId, message.displayName);
            break;
            
          case 'user-left':
            this.handleUserLeft(message.userId);
            break;
            
          case 'transport-info':
            this.handleTransportInfo(message.userId, message.transportUrl);
            break;
            
          case 'offer':
            this.handleOffer(message.userId, message.offer);
            break;
            
          case 'answer':
            this.handleAnswer(message.userId, message.answer);
            break;
            
          case 'ice-candidate':
            this.handleIceCandidate(message.userId, message.candidate);
            break;
            
          default:
            console.warn('收到未知類型的信令消息:', message);
        }
      }
      
      // 新增處理加入房間的方法
      handleJoinRoom(roomId, userId, displayName, supportWebTransport) {
        console.log(`用戶 ${displayName} (${userId}) 請求加入房間 ${roomId}`);
        
        // 加入房間的邏輯
        this.currentRoomId = roomId;
        
        // 如果支持 WebTransport，可以進行相關設置
        if (supportWebTransport) {
          this.initializeWebTransport();
        }
        
        // 通知其他用戶有新用戶加入
        this.broadcastUserJoined(userId, displayName);
        
        // 向新用戶發送房間內現有用戶的信息
        this.sendExistingParticipants(userId);
      }
      
    
    /**
     * 發送信令消息
     * @param {Object} message - 要發送的消息
     */
    sendSignalingMessage(message) {
      if (this.signalingConnected && this.signalingSocket) {
        this.signalingSocket.send(JSON.stringify(message));
      } else {
        console.warn('無法發送信令消息，未連接到信令服務器');
      }
    }
    
    /**
     * 加入房間
     * @param {string} roomId - 房間 ID
     * @param {string} displayName - 顯示名稱
     */
    async joinRoom(roomId, displayName) {
      this.roomId = roomId;
      this.userId = 'user_' + Math.floor(Math.random() * 1000000);
      this.displayName = displayName;
      
      // 發送加入房間消息
      this.sendSignalingMessage({
        type: 'join-room',
        roomId: this.roomId,
        userId: this.userId,
        displayName: this.displayName,
        supportWebTransport: this.connectionStrategy === 'webtransport'
      });
      
      console.log(`嘗試加入房間: ${roomId}`);
    }
    
    /**
     * 離開房間
     */
    async leaveRoom() {
      if (!this.roomId) return;
      
      // 發送離開房間消息
      this.sendSignalingMessage({
        type: 'leave-room',
        roomId: this.roomId,
        userId: this.userId
      });
      
      // 關閉所有連接
      this.closeAllConnections();
      
      console.log(`已離開房間: ${this.roomId}`);
      this.roomId = null;
    }
    
    /**
     * 關閉所有連接
     */
    closeAllConnections() {
      // 關閉 WebTransport 連接
      for (const [userId, transport] of this.webTransports.entries()) {
        try {
          transport.close();
        } catch (e) {
          console.error(`關閉與用戶 ${userId} 的 WebTransport 連接時出錯:`, e);
        }
      }
      this.webTransports.clear();
      
      // 關閉 WebRTC 連接
      for (const [userId, pc] of this.peerConnections.entries()) {
        try {
          pc.close();
        } catch (e) {
          console.error(`關閉與用戶 ${userId} 的 WebRTC 連接時出錯:`, e);
        }
      }
      this.peerConnections.clear();
      
      // 清理媒體處理器
      if (this.mediaProcessor) {
        this.mediaProcessor.dispose();
      }
    }
    
    /**
     * 設置本地媒體流
     * @param {MediaStream} stream - 本地媒體流
     */
    setLocalStream(stream) {
      this.localStream = stream;
      
      // 如果使用 WebTransport，初始化媒體處理
      if (this.connectionStrategy === 'webtransport' && this.mediaProcessor) {
        this.mediaProcessor.processLocalStream(stream);
      }
    }
    
    /**
     * 處理用戶加入事件
     * @param {string} userId - 用戶 ID
     * @param {string} displayName - 顯示名稱
     */
    handleUserJoined(userId, displayName) {
      console.log(`用戶 ${userId} (${displayName}) 加入了房間`);
      
      // 根據連接策略建立連接
      if (this.connectionStrategy === 'webtransport') {
        // 請求 WebTransport URL
        this.sendSignalingMessage({
          type: 'request-transport',
          roomId: this.roomId,
          userId: this.userId,
          targetUserId: userId
        });
      } else if (this.connectionStrategy === 'webrtc') {
        // 創建 WebRTC 連接
        this.createPeerConnection(userId);
        this.createOffer(userId);
      }
      
      // 調用回調
      if (this.onUserJoined) {
        this.onUserJoined(userId, displayName);
      }
    }
    
    /**
     * 處理用戶離開事件
     * @param {string} userId - 用戶 ID
     */
    handleUserLeft(userId) {
      console.log(`用戶 ${userId} 離開了房間`);
      
      // 關閉與該用戶的連接
      if (this.webTransports.has(userId)) {
        try {
          this.webTransports.get(userId).close();
        } catch (e) {
          console.error(`關閉與用戶 ${userId} 的 WebTransport 連接時出錯:`, e);
        }
        this.webTransports.delete(userId);
      }
      
      if (this.peerConnections.has(userId)) {
        try {
          this.peerConnections.get(userId).close();
        } catch (e) {
          console.error(`關閉與用戶 ${userId} 的 WebRTC 連接時出錯:`, e);
        }
        this.peerConnections.delete(userId);
      }
      
      // 清理媒體處理器中的用戶資源
      if (this.mediaProcessor) {
        this.mediaProcessor.cleanupUser(userId);
      }
      
      // 調用回調
      if (this.onUserLeft) {
        this.onUserLeft(userId);
      }
    }
    
    /**
     * 處理 WebTransport URL 信息
     * @param {string} userId - 用戶 ID
     * @param {string} transportUrl - WebTransport URL
     */
    async handleTransportInfo(userId, transportUrl) {
      if (!this.features.webTransport) return;
      
      try {
        console.log(`收到用戶 ${userId} 的 WebTransport URL: ${transportUrl}`);
        
        // 創建 WebTransport 連接
        const transport = new WebTransport(transportUrl);
        
        // 等待連接建立
        await transport.ready;
        console.log(`與用戶 ${userId} 建立了 WebTransport 連接`);
        
        // 存儲連接
        this.webTransports.set(userId, transport);
        
        // 處理連接關閉
        transport.closed.then(() => {
          console.log(`與用戶 ${userId} 的 WebTransport 連接已關閉`);
          this.webTransports.delete(userId);
        }).catch(error => {
          console.error(`與用戶 ${userId} 的 WebTransport 連接異常關閉:`, error);
          this.webTransports.delete(userId);
        });
        
        // 處理數據報
        this.handleDatagrams(userId, transport);
        
        // 處理傳入流
        this.handleIncomingStreams(userId, transport);
        
        // 如果使用媒體處理器，為該用戶創建軌道生成器
        if (this.mediaProcessor) {
          const remoteStream = this.mediaProcessor.createTrackGeneratorsForUser(userId);
          
          // 調用回調
          if (remoteStream && this.onRemoteStream) {
            this.onRemoteStream(userId, remoteStream);
          }
        }
        
        // 發送控制消息
        this.sendControlMessage('connected', true, userId);
      } catch (error) {
        console.error(`建立與用戶 ${userId} 的 WebTransport 連接失敗:`, error);
      }
    }
    
    /**
     * 處理數據報
     * @param {string} userId - 用戶 ID
     * @param {WebTransport} transport - WebTransport 連接
     */
    async handleDatagrams(userId, transport) {
      try {
        const reader = transport.datagrams.readable.getReader();
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          // 解析控制消息
          const view = new DataView(value.buffer);
          const type = view.getUint8(0);
          
          switch (type) {
            case 1: // 靜音狀態
              const isMuted = view.getUint8(1) === 1;
              console.log(`用戶 ${userId} 的靜音狀態: ${isMuted}`);
              break;
              
            case 2: // 視頻狀態
              const isVideoOff = view.getUint8(1) === 1;
              console.log(`用戶 ${userId} 的視頻狀態: ${isVideoOff}`);
              break;
              
            default:
              console.warn(`收到未知類型的數據報: ${type}`);
          }
        }
      } catch (error) {
        console.error(`讀取來自用戶 ${userId} 的數據報時出錯:`, error);
      }
    }
    
    /**
     * 處理傳入流
     * @param {string} userId - 用戶 ID
     * @param {WebTransport} transport - WebTransport 連接
     */
    async handleIncomingStreams(userId, transport) {
      try {
        const reader = transport.incomingUnidirectionalStreams.getReader();
        
        while (true) {
          const { value: stream, done } = await reader.read();
          if (done) break;
          
          // 讀取流類型
          const streamReader = stream.getReader();
          const { value: typeData } = await streamReader.read();
          const streamType = typeData[0] === 1 ? 'video' : 'audio';
          
          console.log(`收到來自用戶 ${userId} 的 ${streamType} 流`);
          
          // 讀取流數據
          this.readStreamData(userId, streamReader, streamType);
        }
      } catch (error) {
        console.error(`處理來自用戶 ${userId} 的傳入流時出錯:`, error);
      }
    }
    
    /**
     * 讀取流數據
     * @param {string} userId - 用戶 ID
     * @param {ReadableStreamDefaultReader} reader - 流讀取器
     * @param {string} streamType - 流類型 ('video' 或 'audio')
     */
    async readStreamData(userId, reader, streamType) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          // 處理媒體數據
          if (this.mediaProcessor) {
            if (streamType === 'video') {
              this.mediaProcessor.handleReceivedVideoData(userId, value);
            } else {
              this.mediaProcessor.handleReceivedAudioData(userId, value);
            }
          }
        }
      } catch (error) {
        console.error(`讀取來自用戶 ${userId} 的 ${streamType} 數據時出錯:`, error);
      }
    }
    
    /**
     * 處理編碼後的視頻塊
     * @param {EncodedVideoChunk} chunk - 編碼視頻塊
     */
    async handleEncodedVideoChunk(chunk) {
      // 將編碼數據轉換為可傳輸的格式
      const metadataSize = 13; // 1 byte for key frame flag + 8 bytes for timestamp + 4 bytes for size
      const buffer = new ArrayBuffer(metadataSize);
      const view = new DataView(buffer);
      
      // 添加元數據
      view.setUint8(0, chunk.type === 'key' ? 1 : 0); // 幀類型
      view.setBigUint64(1, BigInt(chunk.timestamp), false); // 時間戳
      view.setUint32(9, chunk.byteLength, false); // 數據長度
      
      // 複製數據
      const chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);
      
      const fullData = new Uint8Array(buffer.byteLength + chunkData.byteLength);
      fullData.set(new Uint8Array(buffer), 0);
      fullData.set(chunkData, buffer.byteLength);
      
      // 發送到所有 WebTransport 連接
      for (const [userId, transport] of this.webTransports.entries()) {
        try {
          const stream = await transport.createUnidirectionalStream();
          const writer = stream.getWriter();
          
          // 寫入流類型 (1 = 視頻)
          await writer.write(new Uint8Array([1]));
          
          // 寫入數據
          await writer.write(fullData);
          await writer.close();
        } catch (error) {
          console.error(`發送視頻數據到用戶 ${userId} 失敗:`, error);
        }
      }
    }
    
    /**
     * 處理編碼後的音頻塊
     * @param {EncodedAudioChunk} chunk - 編碼音頻塊
     */
    async handleEncodedAudioChunk(chunk) {
      // 將編碼數據轉換為可傳輸的格式
      const metadataSize = 12; // 8 bytes for timestamp + 4 bytes for size
      const buffer = new ArrayBuffer(metadataSize);
      const view = new DataView(buffer);
      
      // 添加元數據
      view.setBigUint64(0, BigInt(chunk.timestamp), false); // 時間戳
      view.setUint32(8, chunk.byteLength, false); // 數據長度
      
      // 複製數據
      const chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);
      
      const fullData = new Uint8Array(buffer.byteLength + chunkData.byteLength);
      fullData.set(new Uint8Array(buffer), 0);
      fullData.set(chunkData, buffer.byteLength);
      
      // 發送到所有 WebTransport 連接
      for (const [userId, transport] of this.webTransports.entries()) {
        try {
          const stream = await transport.createUnidirectionalStream();
          const writer = stream.getWriter();
          
          // 寫入流類型 (0 = 音頻)
          await writer.write(new Uint8Array([0]));
          
          // 寫入數據
          await writer.write(fullData);
          await writer.close();
        } catch (error) {
          console.error(`發送音頻數據到用戶 ${userId} 失敗:`, error);
        }
      }
    }
    
    /**
     * 發送控制消息
     * @param {string} type - 消息類型
     * @param {boolean} value - 消息值
     * @param {string} targetUserId - 目標用戶 ID (可選，默認發送給所有用戶)
     */
    async sendControlMessage(type, value, targetUserId = null) {
      let messageType;
      switch (type) {
        case 'mute':
          messageType = 1;
          break;
        case 'video':
          messageType = 2;
          break;
        case 'connected':
          messageType = 3;
          break;
        default:
          console.warn(`未知的控制消息類型: ${type}`);
          return;
      }
      
      // 創建數據報
      const data = new Uint8Array(2);
      data[0] = messageType;
      data[1] = value ? 1 : 0;
      
      // 發送到特定用戶或所有用戶
      if (targetUserId && this.webTransports.has(targetUserId)) {
        try {
          const transport = this.webTransports.get(targetUserId);
          const writer = transport.datagrams.writable.getWriter();
          await writer.write(data);
          writer.releaseLock();
        } catch (error) {
          console.error(`發送控制消息到用戶 ${targetUserId} 失敗:`, error);
        }
      } else {
        // 發送到所有用戶
        for (const [userId, transport] of this.webTransports.entries()) {
          try {
            const writer = transport.datagrams.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
          } catch (error) {
            console.error(`發送控制消息到用戶 ${userId} 失敗:`, error);
          }
        }
      }
    }
    
    /**
     * 創建 WebRTC 對等連接
     * @param {string} userId - 用戶 ID
     */
    createPeerConnection(userId) {
      if (!this.features.webRTC) return;
      
      try {
        const configuration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        };
        
        const pc = new RTCPeerConnection(configuration);
        this.peerConnections.set(userId, pc);
        
        // 添加本地媒體軌道
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
          });
        }
        
        // 處理 ICE 候選
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalingMessage({
              type: 'ice-candidate',
              roomId: this.roomId,
              userId: this.userId,
              targetUserId: userId,
              candidate: event.candidate
            });
          }
        };
        
        // 處理連接狀態變化
        pc.onconnectionstatechange = () => {
          console.log(`與用戶 ${userId} 的 WebRTC 連接狀態: ${pc.connectionState}`);
          
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.warn(`與用戶 ${userId} 的 WebRTC 連接已斷開或失敗`);
            this.peerConnections.delete(userId);
          }
          
          // 調用回調
          if (this.onConnectionStateChange) {
            this.onConnectionStateChange(userId, pc.connectionState);
          }
        };
        
        // 處理遠程媒體軌道
        pc.ontrack = (event) => {
          console.log(`收到來自用戶 ${userId} 的媒體軌道`);
          
          const stream = new MediaStream();
          event.streams[0].getTracks().forEach(track => {
            stream.addTrack(track);
          });
          
          // 調用回調
          if (this.onRemoteStream) {
            this.onRemoteStream(userId, stream);
          }
        };
        
        console.log(`已創建與用戶 ${userId} 的 WebRTC 連接`);
        return pc;
      } catch (error) {
        console.error(`創建與用戶 ${userId} 的 WebRTC 連接失敗:`, error);
        return null;
      }
    }
    
    /**
     * 創建 WebRTC 提議
     * @param {string} userId - 用戶 ID
     */
    async createOffer(userId) {
      if (!this.features.webRTC) return;
      
      const pc = this.peerConnections.get(userId);
      if (!pc) {
        console.warn(`找不到與用戶 ${userId} 的 WebRTC 連接`);
        return;
      }
      
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this.sendSignalingMessage({
          type: 'offer',
          roomId: this.roomId,
          userId: this.userId,
          targetUserId: userId,
          offer: pc.localDescription
        });
        
        console.log(`已向用戶 ${userId} 發送 WebRTC 提議`);
      } catch (error) {
        console.error(`創建 WebRTC 提議失敗:`, error);
      }
    }
    
    /**
     * 處理 WebRTC 提議
     * @param {string
            // js/connection.js 的剩餘部分

  /**
   * 處理 WebRTC 提議
   * @param {string} userId - 用戶 ID
   * @param {RTCSessionDescription} offer - 提議
   */
  async handleOffer(userId, offer) {
    if (!this.features.webRTC) return;
    
    try {
      // 如果沒有與該用戶的連接，創建一個
      let pc = this.peerConnections.get(userId);
      if (!pc) {
        pc = this.createPeerConnection(userId);
      }
      
      if (!pc) {
        console.error(`無法處理來自用戶 ${userId} 的提議: 無法創建連接`);
        return;
      }
      
      // 設置遠程描述
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // 創建應答
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      // 發送應答
      this.sendSignalingMessage({
        type: 'answer',
        roomId: this.roomId,
        userId: this.userId,
        targetUserId: userId,
        answer: pc.localDescription
      });
      
      console.log(`已處理來自用戶 ${userId} 的提議並發送應答`);
    } catch (error) {
      console.error(`處理來自用戶 ${userId} 的提議時出錯:`, error);
    }
  }
  
  /**
   * 處理 WebRTC 應答
   * @param {string} userId - 用戶 ID
   * @param {RTCSessionDescription} answer - 應答
   */
  async handleAnswer(userId, answer) {
    if (!this.features.webRTC) return;
    
    const pc = this.peerConnections.get(userId);
    if (!pc) {
      console.warn(`找不到與用戶 ${userId} 的 WebRTC 連接`);
      return;
    }
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`已處理來自用戶 ${userId} 的應答`);
    } catch (error) {
      console.error(`處理來自用戶 ${userId} 的應答時出錯:`, error);
    }
  }
  
  /**
   * 處理 ICE 候選
   * @param {string} userId - 用戶 ID
   * @param {RTCIceCandidate} candidate - ICE 候選
   */
  async handleIceCandidate(userId, candidate) {
    if (!this.features.webRTC) return;
    
    const pc = this.peerConnections.get(userId);
    if (!pc) {
      console.warn(`找不到與用戶 ${userId} 的 WebRTC 連接`);
      return;
    }
    
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`已處理來自用戶 ${userId} 的 ICE 候選`);
    } catch (error) {
      console.error(`處理來自用戶 ${userId} 的 ICE 候選時出錯:`, error);
    }
  }
  
  /**
   * 切換靜音狀態
   * @param {boolean} isMuted - 是否靜音
   */
  toggleMute(isMuted) {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isMuted;
      });
    }
    
    // 發送控制消息
    if (this.connectionStrategy === 'webtransport') {
      this.sendControlMessage('mute', isMuted);
    }
    
    console.log(`本地音頻已${isMuted ? '靜音' : '取消靜音'}`);
  }
  
  /**
   * 切換視頻狀態
   * @param {boolean} isVideoOff - 是否關閉視頻
   */
  toggleVideo(isVideoOff) {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isVideoOff;
      });
    }
    
    // 發送控制消息
    if (this.connectionStrategy === 'webtransport') {
      this.sendControlMessage('video', isVideoOff);
    }
    
    console.log(`本地視頻已${isVideoOff ? '關閉' : '開啟'}`);
  }
}
