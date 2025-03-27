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
    console.log('Local stream added');
  })
  .catch(error => {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera and microphone.');
  });

// Handle incoming remote stream
peerConnection.ontrack = event => {
  if (!remoteVideo.srcObject) {
    remoteVideo.srcObject = event.streams[0];
    console.log('Remote stream added');
  }
};

// Signaling logic (using WebSocket)
const signalingSocket = new WebSocket('ws://aluminum-tremendous-archaeology.glitch.me');

signalingSocket.onopen = () => {
  console.log('WebSocket connection established');
};

signalingSocket.onmessage = async message => {
  console.log('Received message:', message.data);
  const data = JSON.parse(message.data);

  if (data.type === 'offer') {
    console.log('Received offer');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify({ type: 'answer', answer, room: roomName }));
  } else if (data.type === 'answer') {
    console.log('Received answer');
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.type === 'candidate') {
    console.log('Received ICE candidate');
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
};

peerConnection.onicecandidate = event => {
  if (event.candidate) {
    console.log('Sending ICE candidate');
    signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate, room: roomName }));
  }
};

// Join room
joinRoomButton.onclick = () => {
  console.log('Join Room button clicked');
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
  console.log('Start Call button clicked');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  signalingSocket.send(JSON.stringify({ type: 'offer', offer, room: roomName }));
  startCallButton.disabled = true;
  endCallButton.disabled = false;
};

// End call
endCallButton.onclick = () => {
  console.log('End Call button clicked');
  peerConnection.close();
  signalingSocket.close();
  startCallButton.disabled = false;
  endCallButton.disabled = true;
  remoteVideo.srcObject = null;
  alert('Call ended.');
};
