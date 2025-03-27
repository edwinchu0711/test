const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinRoomButton = document.getElementById('joinRoom');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');
const roomInput = document.getElementById('roomInput');

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

let localStream;
let roomName = null;

// Get user media (camera and microphone)
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
  })
  .catch(error => {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera and microphone.');
  });

// Handle incoming remote stream
peerConnection.ontrack = event => {
  if (!remoteVideo.srcObject) {
    remoteVideo.srcObject = event.streams[0];
  }
};

// Signaling logic (using WebSocket)
const signalingSocket = new WebSocket('wss://superficial-obsidian-harp.glitch.me');

signalingSocket.onmessage = async message => {
  const data = JSON.parse(message.data);

  if (data.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify({ type: 'answer', answer, room: roomName }));
  } else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.type === 'candidate') {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
};

peerConnection.onicecandidate = event => {
  if (event.candidate) {
    signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate, room: roomName }));
  }
};

// Join room
joinRoomButton.onclick = () => {
  roomName = roomInput.value.trim();
  if (!roomName) {
    alert('Please enter a room name.');
    return;
  }
  signalingSocket.send(JSON.stringify({ type: 'join', room: roomName }));
  console.log(`Joined room: ${roomName}`);
  joinRoomButton.disabled = true;
  roomInput.disabled = true;
  startCallButton.disabled = false;
};

// Start call
startCallButton.onclick = async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  signalingSocket.send(JSON.stringify({ type: 'offer', offer, room: roomName }));
  startCallButton.disabled = true;
  endCallButton.disabled = false;
};

// End call
endCallButton.onclick = () => {
  peerConnection.close();
  signalingSocket.close();
  startCallButton.disabled = false;
  endCallButton.disabled = true;
  remoteVideo.srcObject = null;
  alert('Call ended.');
};
