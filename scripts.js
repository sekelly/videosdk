const VideoSDK = window.WebVideoSDK.default;

let zmClient = VideoSDK.createClient();
let zmStream;
let audioDecode;
let audioEncode;

// Signature endpoint
const signatureEndpoint = 'https://l1sgnx6bek.execute-api.us-east-1.amazonaws.com/latest';
let sessionName = '';
let sessionPasscode = '';
let userName = 'Participant' + Math.floor(Math.random() * 100);
let role = 1;
let userIdentity;
let sessionKey;

// Initialize client
zmClient.init('US-en', 'CDN');

// Join session
function getSignature() {
  const btn = document.getElementById('getSignature');
  btn.textContent = 'Joining Session...';
  btn.disabled = true;
  document.getElementById('error').style.display = 'none';

  fetch(signatureEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: document.getElementById('sessionName').value || sessionName,
      role,
      userIdentity,
      sessionKey
    })
  })
    .then(res => res.json())
    .then(data => joinSession(data.signature))
    .catch(err => {
      console.error(err);
      btn.textContent = 'Join Session';
      btn.disabled = false;
    });
}

async function joinSession(signature) {
  try {
    await zmClient.join(
      document.getElementById('sessionName').value || sessionName,
      signature,
      document.getElementById('userName').value || userName,
      document.getElementById('sessionPasscode').value || sessionPasscode
    );

    zmStream = zmClient.getMediaStream();

    console.log(zmClient.getSessionInfo());

    if (zmClient.getAllUser().length > 4) {
      document.getElementById('error').style.display = 'block';
      setTimeout(leaveSession, 1000);
    } else {
      document.getElementById('session').style.display = 'flex';
      document.getElementById('landing').style.display = 'none';
    }
  } catch (error) {
    console.error(error);
    document.getElementById('getSignature').textContent = 'Join Session';
    document.getElementById('getSignature').disabled = false;
  }
}

// Start self video
async function startVideo() {
  const startButton = document.getElementById('startVideo');
  startButton.textContent = 'Starting Video...';
  startButton.disabled = true;

  try {
    await zmStream.startVideo({ mirrored: true, hd: true });
    const container = document.getElementById('self-view-container');
    const userId = zmClient.getCurrentUserInfo().userId;

    container.innerHTML = '';

    const videoEl = await zmStream.attachVideo(userId, container, {
      mirrored: true,
      hd: true,
      fill: true // removes black bars
    });

    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';

    document.getElementById('self-view-name').style.display = 'none';
    startButton.style.display = 'none';
    document.getElementById('stopVideo').style.display = 'inline-block';
  } catch (err) {
    console.error('Error starting video:', err);
  } finally {
    startButton.textContent = 'Start Video';
    startButton.disabled = false;
  }
}

// Stop self video
async function stopVideo() {
  try {
    const userId = zmClient.getCurrentUserInfo().userId;
    await zmStream.stopVideo();
    await zmStream.detachVideo(userId);

    const container = document.getElementById('self-view-container');
    container.innerHTML = '';
    document.getElementById('self-view-name').style.display = 'block';
    document.getElementById('startVideo').style.display = 'inline-block';
    document.getElementById('stopVideo').style.display = 'none';
  } catch (err) {
    console.error('Error stopping video:', err);
  }
}

// Audio controls
function startAudio() {
  const isSafari = window.safari !== undefined;

  if (isSafari) {
    if (audioDecode && audioEncode) {
      zmStream.startAudio();
      document.getElementById('startAudio').style.display = 'none';
      document.getElementById('muteAudio').style.display = 'inline-block';
    } else {
      console.log('Safari audio not initialized yet');
    }
  } else {
    zmStream.startAudio();
    document.getElementById('startAudio').style.display = 'none';
    document.getElementById('muteAudio').style.display = 'inline-block';
  }
}

function muteAudio() {
  zmStream.muteAudio();
  document.getElementById('muteAudio').style.display = 'none';
  document.getElementById('unmuteAudio').style.display = 'inline-block';
}

function unmuteAudio() {
  zmStream.unmuteAudio();
  document.getElementById('muteAudio').style.display = 'inline-block';
  document.getElementById('unmuteAudio').style.display = 'none';
}

// Leave session
function leaveSession() {
  zmClient.leave();

  document.getElementById('session').style.display = 'none';
  document.getElementById('muteAudio').style.display = 'none';
  document.getElementById('unmuteAudio').style.display = 'none';
  document.getElementById('stopVideo').style.display = 'none';
  document.getElementById('self-view-container').innerHTML = '';
  document.getElementById('participant-container').innerHTML = '';

  document.getElementById('startVideo').style.display = 'inline-block';
  document.getElementById('startAudio').style.display = 'inline-block';
  document.getElementById('self-view-name').style.display = 'block';

  document.getElementById('participant-name').textContent = '⏳ Waiting for participant to join...';
  document.getElementById('getSignature').textContent = 'Join Session';
  document.getElementById('getSignature').disabled = false;
}

// Media SDK change
zmClient.on('media-sdk-change', (payload) => {
  const { action, type, result } = payload;
  if (type === 'audio' && result === 'success') {
    if (action === 'encode') audioEncode = true;
    else if (action === 'decode') audioDecode = true;
  }
});

// Remote participant video
zmClient.on('peer-video-state-change', async (payload) => {
  if (!zmStream) return;

  const container = document.getElementById('participant-container');
  if (payload.action === 'Start') {
    container.innerHTML = '';
    const videoEl = await zmStream.attachVideo(payload.userId, container, {
      hd: true,
      fill: true
    });
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
    document.getElementById('participant-name').style.display = 'none';
  } else if (payload.action === 'Stop') {
    await zmStream.detachVideo(payload.userId);
    container.innerHTML = '';
    document.getElementById('participant-name').style.display = 'block';
  }
});

// User join/leave events
zmClient.on('user-added', (payload) => {
  if (zmClient.getAllUser().length < 3) {
    if (payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.getElementById('participant-name').textContent = payload[0].displayName;
    }
  }
});

zmClient.on('user-removed', (payload) => {
  if (zmClient.getAllUser().length < 2) {
    if (payload.length && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.getElementById('participant-name').textContent = 'Participant left...';
    }
  }
});

zmClient.on('active-share-change', (payload) => console.log(payload));
