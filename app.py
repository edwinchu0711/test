import os
import numpy as np
import cv2
import tensorflow as tf
from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model

# 定義字符集
CHARACTERS = '0123456789'
char_to_idx = {char: idx for idx, char in enumerate(CHARACTERS)}
idx_to_char = {idx: char for char, idx in char_to_idx.items()}

app = Flask(__name__)

# 解碼預測結果
def decode_predictions(predictions):
    results = []
    input_length = np.ones((predictions.shape[0],)) * predictions.shape[1]
    decoded = tf.keras.backend.ctc_decode(predictions, input_length=input_length)[0][0]
    for sequence in decoded:
        results.append(''.join([idx_to_char[idx] for idx in sequence.numpy() if idx != -1]))
    return results

# 預處理驗證碼圖片
def preprocess_image(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)  # 灰度讀取
    image = cv2.resize(image, (124, 24))  # 調整大小
    image = image / 255.0  # 正規化
    image = image[..., np.newaxis]  # 增加通道維度
    return np.expand_dims(image, axis=0)  # 增加批次維度

# 加載模型
model_path = 'model.keras'  # Railway 會用這個模型
if not os.path.exists(model_path):
    raise FileNotFoundError(f"模型文件 {model_path} 未找到，請確保模型已保存。")
model = load_model(model_path)

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"error": "請上傳圖片"}), 400

    file = request.files['image']
    file_path = "temp.png"
    file.save(file_path)

    image = preprocess_image(file_path)
    predictions = model.predict(image)
    result = decode_predictions(predictions)

    return jsonify({"captcha": result[0]})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
