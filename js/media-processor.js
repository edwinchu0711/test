/**
 * 媒體處理類，負責處理媒體流的編碼、解碼和處理
 */
class MediaProcessor {
    constructor() {
      // 檢查 WebCodecs API 支持
      this.hasWebCodecs = typeof VideoEncoder !== 'undefined' && 
                          typeof VideoDecoder !== 'undefined' && 
                          typeof AudioEncoder !== 'undefined' && 
                          typeof AudioDecoder !== 'undefined';
      
      // 檢查 MediaStreamTrackProcessor API 支持
      this.hasTrackProcessor = typeof MediaStreamTrackProcessor !== 'undefined';
      
      // 檢查 MediaStreamTrackGenerator API 支持
      this.hasTrackGenerator = typeof MediaStreamTrackGenerator !== 'undefined';
      
      // 視頻編碼器配置
      this.videoEncoderConfig = {
        codec: 'vp8',
        width: 1280,
        height: 720,
        bitrate: 2_000_000, // 2 Mbps
        framerate: 30
      };
      
      // 音頻編碼器配置
      this.audioEncoderConfig = {
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000 // 128 kbps
      };
      
      // 編碼器
      this.videoEncoder = null;
      this.audioEncoder = null;
      
      // 解碼器
      this.videoDecoder = null;
      this.audioDecoder = null;
      
      // 軌道處理器
      this.videoTrackProcessor = null;
      this.audioTrackProcessor = null;
      
      // 軌道生成器映射 (userId -> generator)
      this.videoTrackGenerators = new Map();
      this.audioTrackGenerators = new Map();
      
      // 編碼回調
      this.onEncodedVideoChunk = null;
      this.onEncodedAudioChunk = null;
      
      // 初始化狀態
      this.initialized = false;
    }
    
    /**
     * 初始化媒體處理器
     * @returns {Promise<boolean>} - 是否初始化成功
     */
    async init() {
      if (!this.hasWebCodecs || !this.hasTrackProcessor || !this.hasTrackGenerator) {
        console.error('瀏覽器不支持必要的 API');
        return false;
      }
      
      try {
        // 初始化視頻編碼器
        this.videoEncoder = new VideoEncoder({
          output: chunk => {
            if (this.onEncodedVideoChunk) {
              this.onEncodedVideoChunk(chunk);
            }
          },
          error: error => {
            console.error('視頻編碼錯誤:', error);
          }
        });
        
        await this.videoEncoder.configure(this.videoEncoderConfig);
        
        // 初始化音頻編碼器
        this.audioEncoder = new AudioEncoder({
          output: chunk => {
            if (this.onEncodedAudioChunk) {
              this.onEncodedAudioChunk(chunk);
            }
          },
          error: error => {
            console.error('音頻編碼錯誤:', error);
          }
        });
        
        await this.audioEncoder.configure(this.audioEncoderConfig);
        
        this.initialized = true;
        console.log('媒體處理器初始化成功');
        return true;
      } catch (error) {
        console.error('初始化媒體處理器失敗:', error);
        return false;
      }
    }
    
    /**
     * 處理本地媒體流
     * @param {MediaStream} stream - 本地媒體流
     */
    processLocalStream(stream) {
      if (!this.initialized) {
        console.warn('媒體處理器尚未初始化');
        return;
      }
      
      try {
        // 獲取視頻軌道
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          // 創建視頻軌道處理器
          this.videoTrackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
          
          // 處理視頻幀
          const videoReader = this.videoTrackProcessor.readable.getReader();
          this.processVideoFrames(videoReader);
          
          console.log('開始處理本地視頻流');
        }
        
        // 獲取音頻軌道
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          // 創建音頻軌道處理器
          this.audioTrackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
          
          // 處理音頻幀
          const audioReader = this.audioTrackProcessor.readable.getReader();
          this.processAudioFrames(audioReader);
          
          console.log('開始處理本地音頻流');
        }
      } catch (error) {
        console.error('處理本地媒體流失敗:', error);
      }
    }
    
    /**
     * 處理視頻幀
     * @param {ReadableStreamDefaultReader} reader - 視頻幀讀取器
     */
    async processVideoFrames(reader) {
      try {
        while (true) {
          const { value: frame, done } = await reader.read();
          if (done) break;
          
          // 編碼視頻幀
          if (this.videoEncoder && this.videoEncoder.state === 'configured') {
            const keyFrame = this.videoEncoder.encodeQueueSize === 0;
            this.videoEncoder.encode(frame, { keyFrame });
          }
          
          // 釋放幀
          frame.close();
        }
      } catch (error) {
        console.error('處理視頻幀時出錯:', error);
      }
    }
    
    /**
     * 處理音頻幀
     * @param {ReadableStreamDefaultReader} reader - 音頻幀讀取器
     */
    async processAudioFrames(reader) {
      try {
        while (true) {
          const { value: frame, done } = await reader.read();
          if (done) break;
          
          // 編碼音頻幀
          if (this.audioEncoder && this.audioEncoder.state === 'configured') {
            this.audioEncoder.encode(frame);
          }
          
          // 釋放幀
          frame.close();
        }
      } catch (error) {
        console.error('處理音頻幀時出錯:', error);
      }
    }
    
    /**
     * 為用戶創建軌道生成器
     * @param {string} userId - 用戶 ID
     * @returns {MediaStream} - 包含生成軌道的媒體流
     */
    createTrackGeneratorsForUser(userId) {
      if (!this.hasTrackGenerator) return null;
      
      try {
        // 創建新的媒體流
        const remoteStream = new MediaStream();
        
        // 創建視頻軌道生成器
        const videoGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
        this.videoTrackGenerators.set(userId, videoGenerator);
        remoteStream.addTrack(videoGenerator);
        
        // 創建音頻軌道生成器
        const audioGenerator = new MediaStreamTrackGenerator({ kind: 'audio' });
        this.audioTrackGenerators.set(userId, audioGenerator);
        remoteStream.addTrack(audioGenerator);
        
        // 初始化解碼器
        this.initVideoDecoder(userId);
        this.initAudioDecoder(userId);
        
        console.log(`為用戶 ${userId} 創建了軌道生成器`);
        return remoteStream;
      } catch (error) {
        console.error(`為用戶 ${userId} 創建軌道生成器失敗:`, error);
        return null;
      }
    }
    
    /**
     * 處理接收到的視頻數據
     * @param {string} userId - 用戶 ID
     * @param {Uint8Array} data - 視頻數據
     */
    handleReceivedVideoData(userId, data) {
      if (!this.initialized || !this.videoDecoder) return;
      
      try {
        // 解析元數據
        const view = new DataView(data.buffer);
        const isKeyFrame = view.getUint8(0) === 1;
        const timestamp = Number(view.getBigUint64(1, false));
        const size = view.getUint32(9, false);
        
        // 提取視頻數據
        const chunkData = data.slice(13);
        
        // 創建編碼視頻塊
        const chunk = new EncodedVideoChunk({
          type: isKeyFrame ? 'key' : 'delta',
          timestamp,
          data: chunkData
        });
        
        // 解碼視頻塊
        this.videoDecoder.decode(chunk);
      } catch (error) {
        console.error(`處理來自用戶 ${userId} 的視頻數據時出錯:`, error);
      }
    }
    
    /**
     * 處理接收到的音頻數據
     * @param {string} userId - 用戶 ID
     * @param {Uint8Array} data - 音頻數據
     */
    handleReceivedAudioData(userId, data) {
      if (!this.initialized || !this.audioDecoder) return;
      
      try {
        // 解析元數據
        const view = new DataView(data.buffer);
        const timestamp = Number(view.getBigUint64(0, false));
        const size = view.getUint32(8, false);
        
        // 提取音頻數據
        const chunkData = data.slice(12);
        
        // 創建編碼音頻塊
        const chunk = new EncodedAudioChunk({
          type: 'key', // 音頻塊通常都是關鍵幀
          timestamp,
          data: chunkData
        });
        
        // 解碼音頻塊
        this.audioDecoder.decode(chunk);
      } catch (error) {
        console.error(`處理來自用戶 ${userId} 的音頻數據時出錯:`, error);
      }
    }
    
    /**
     * 初始化視頻解碼器
     * @param {string} userId - 用戶 ID
     */
    async initVideoDecoder(userId) {
      if (!this.hasWebCodecs) return;
      
      try {
        this.videoDecoder = new VideoDecoder({
          output: frame => {
            // 獲取該用戶的視頻軌道生成器
            const generator = this.videoTrackGenerators.get(userId);
            if (generator) {
              const writer = generator.writable.getWriter();
              writer.write(frame).then(() => {
                writer.releaseLock();
              }).catch(error => {
                console.error(`寫入視頻幀到用戶 ${userId} 的生成器失敗:`, error);
                writer.releaseLock();
              });
            } else {
              // 如果沒有生成器，釋放幀
              frame.close();
            }
          },
          error: error => {
            console.error('視頻解碼錯誤:', error);
          }
        });
        
        await this.videoDecoder.configure({
          codec: this.videoEncoderConfig.codec,
          codedWidth: this.videoEncoderConfig.width,
          codedHeight: this.videoEncoderConfig.height
        });
        
        console.log(`為用戶 ${userId} 初始化視頻解碼器`);
      } catch (error) {
        console.error(`初始化用戶 ${userId} 的視頻解碼器失敗:`, error);
      }
    }
    
    /**
     * 初始化音頻解碼器
     * @param {string} userId - 用戶 ID
     */
    async initAudioDecoder(userId) {
      if (!this.hasWebCodecs) return;
      
      try {
        this.audioDecoder = new AudioDecoder({
          output: frame => {
            // 獲取該用戶的音頻軌道生成器
            const generator = this.audioTrackGenerators.get(userId);
            if (generator) {
              const writer = generator.writable.getWriter();
              writer.write(frame).then(() => {
                writer.releaseLock();
              }).catch(error => {
                console.error(`寫入音頻幀到用戶 ${userId} 的生成器失敗:`, error);
                writer.releaseLock();
              });
            } else {
              // 如果沒有生成器，釋放幀
              frame.close();
            }
          },
          error: error => {
            console.error('音頻解碼錯誤:', error);
          }
        });
        
        await this.audioDecoder.configure({
          codec: this.audioEncoderConfig.codec,
          sampleRate: this.audioEncoderConfig.sampleRate,
          numberOfChannels: this.audioEncoderConfig.numberOfChannels
        });
        
        console.log(`為用戶 ${userId} 初始化音頻解碼器`);
      } catch (error) {
        console.error(`初始化用戶 ${userId} 的音頻解碼器失敗:`, error);
      }
    }
    
    /**
     * 清理用戶相關資源
     * @param {string} userId - 用戶 ID
     */
    cleanupUser(userId) {
      // 移除軌道生成器
      this.videoTrackGenerators.delete(userId);
      this.audioTrackGenerators.delete(userId);
      
      console.log(`清理用戶 ${userId} 的媒體資源`);
    }
    
    /**
     * 釋放所有資源
     */
    dispose() {
      // 關閉編碼器
      if (this.videoEncoder) {
        try {
          this.videoEncoder.close();
        } catch (e) {
          console.error('關閉視頻編碼器時出錯:', e);
        }
      }
      
      if (this.audioEncoder) {
        try {
          this.audioEncoder.close();
        } catch (e) {
          console.error('關閉音頻編碼器時出錯:', e);
        }
      }
      
      // 關閉解碼器
      if (this.videoDecoder) {
        try {
          this.videoDecoder.close();
        } catch (e) {
          console.error('關閉視頻解碼器時出錯:', e);
        }
      }
      
      if (this.audioDecoder) {
        try {
          this.audioDecoder.close();
        } catch (e) {
          console.error('關閉音頻解碼器時出錯:', e);
        }
      }
      
      // 清理生成器
      this.videoTrackGenerators.clear();
      this.audioTrackGenerators.clear();
      
      console.log('媒體處理器資源已釋放');
    }
  }
  