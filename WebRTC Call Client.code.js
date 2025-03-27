const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');

const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

let localStream;

// Get user media (camera and microphone)
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
  });

// Handle incoming remote stream
peerConnection.ontrack = event => {
  remoteVideo.srcObject = event.streams[0];
};

// Signaling logic (using WebSocket)
const signalingSocket = new WebSocket('ws://your-signaling-server.com');

signalingSocket.onmessage = async message => {
  const data = JSON.parse(message.data);

  if (data.offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify({ answer }));
  } else if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
};

peerConnection.onicecandidate = event => {
  if (event.candidate) {
    signalingSocket.send(JSON.stringify({ candidate: event.candidate }));
  }
};

// Start call
startCallButton.onclick = async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  signalingSocket.send(JSON.stringify({ offer }));
};

// End call
endCallButton.onclick = () => {
  peerConnection.close();
  signalingSocket.close();
};