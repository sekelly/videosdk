const VideoSDK = window.WebVideoSDK.default;

let zmClient = VideoSDK.createClient();
let zmStream;
let audioDecode;
let audioEncode;

/
// scripts.js
const signatureEndpoint = 'https://l1sgnx6bek.execute-api.us-east-1.amazonaws.com/latest';
let sessionName = '';
let sessionPasscode = '';
let userName = 'Participant' + Math.floor(Math.random() * 100);
let role = 1;
let userIdentity;
let sessionKey;

function getSignature() {
    document.querySelector('#getSignature').textContent = 'Joining Session...';
    document.querySelector('#getSignature').disabled = true;
    document.querySelector('#error').style.display = 'none';

    fetch(signatureEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionName: document.getElementById('sessionName').value || sessionName,
            role: role,
            userIdentity: userIdentity,
            sessionKey: sessionKey
        }),
    })
    .then((response) => response.json())
    .then((data) => joinSession(data.signature))
    .catch((error) => console.error(error));
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
      document.querySelector('#error').style.display = 'block';
      setTimeout(() => leaveSession(), 1000);
    } else {
      document.querySelector('#session').style.display = 'flex';
      document.querySelector('#landing').style.display = 'none';
    }
  } catch (error) {
    console.error(error);
  }
}

// ✅ Self view using attachVideo()
async function startVideo() {
  const startButton = document.querySelector('#startVideo');
  startButton.textContent = 'Starting Video...';
  startButton.disabled = true;

  try {
    await zmStream.startVideo({ mirrored: true, hd: true });

    const container = document.querySelector('#self-view-container');
    const userId = zmClient.getCurrentUserInfo().userId;

    // Clear previous video elements
    container.innerHTML = '';

    const videoElement = await zmStream.attachVideo(userId, container, {
      mirrored: true,
      hd: true,
      fill: true, // eliminates black bars
    });

    container.appendChild(videoElement);
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';

    document.querySelector('#self-view-name').style.display = 'none';
    startButton.style.display = 'none';
    document.querySelector('#stopVideo').style.display = 'inline-block';
  } catch (error) {
    console.error('Error starting video:', error);
  } finally {
    startButton.textContent = 'Start Video';
    startButton.disabled = false;
  }
}

async function stopVideo() {
  try {
    const userId = zmClient.getCurrentUserInfo().userId;
    await zmStream.stopVideo();
    await zmStream.detachVideo(userId);

    document.querySelector('#self-view-container').innerHTML = '';
    document.querySelector('#self-view-name').style.display = 'block';
    document.querySelector('#startVideo').style.display = 'inline-block';
    document.querySelector('#stopVideo').style.display = 'none';
  } catch (error) {
    console.error('Error stopping video:', error);
  }
}

function startAudio() {
  const isSafari = window.safari !== undefined;

  if (isSafari) {
    console.log('desktop safari');
    if (audioDecode && audioEncode) {
      zmStream.startAudio();
      document.querySelector('#startAudio').style.display = 'none';
      document.querySelector('#muteAudio').style.display = 'inline-block';
    } else {
      console.log('desktop safari audio init has not finished');
    }
  } else {
    console.log('not desktop safari');
    zmStream.startAudio();
    document.querySelector('#startAudio').style.display = 'none';
    document.querySelector('#muteAudio').style.display = 'inline-block';
  }
}

function muteAudio() {
  zmStream.muteAudio();
  document.querySelector('#muteAudio').style.display = 'none';
  document.querySelector('#unmuteAudio').style.display = 'inline-block';
}

function unmuteAudio() {
  zmStream.unmuteAudio();
  document.querySelector('#muteAudio').style.display = 'inline-block';
  document.querySelector('#unmuteAudio').style.display = 'none';
}

function leaveSession() {
  zmClient.leave();

  document.querySelector('#session').style.display = 'none';
  document.querySelector('#muteAudio').style.display = 'none';
  document.querySelector('#unmuteAudio').style.display = 'none';
  document.querySelector('#stopVideo').style.display = 'none';
  document.querySelector('#self-view-container').innerHTML = '';
  document.querySelector('#participant-container').innerHTML = '';

  document.querySelector('#startVideo').style.display = 'inline-block';
  document.querySelector('#startAudio').style.display = 'inline-block';
  document.querySelector('#self-view-name').style.display = 'block';

  document.querySelector('#participant-name').textContent = '⏳ Waiting for participant to join...';
  document.querySelector('#getSignature').textContent = 'Join Session';
  document.querySelector('#getSignature').disabled = false;
  document.querySelector('#startVideo').textContent = 'Start Video';
  document.querySelector('#startVideo').disabled = false;

  document.querySelector('#landing').style.display = 'flex';
}

zmClient.on('media-sdk-change', (payload) => {
  console.log(payload);
  const { action, type, result } = payload;
  if (type === 'audio' && result === 'success') {
    if (action === 'encode') audioEncode = true;
    else if (action === 'decode') audioDecode = true;
  }
});

// ✅ Remote participant view using attachVideo()
zmClient.on('peer-video-state-change', async (payload) => {
  try {
    const container = document.querySelector('#participant-container');

    if (payload.action === 'Start') {
      container.innerHTML = '';

      const videoElement = await zmStream.attachVideo(payload.userId, container, {
        hd: true,
        fill: true,
      });

      container.appendChild(videoElement);
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';

      document.querySelector('#participant-name').style.display = 'none';
    } else if (payload.action === 'Stop') {
      await zmStream.detachVideo(payload.userId);
      container.innerHTML = '';
      document.querySelector('#participant-name').style.display = 'block';
    }
  } catch (error) {
    console.error('Error handling peer video:', error);
  }
});

zmClient.on('user-added', (payload) => {
  if (zmClient.getAllUser().length < 3) {
    if (payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = payload[0].displayName;
    }
  }
});

zmClient.on('user-removed', (payload) => {
  if (zmClient.getAllUser().length < 2) {
    if (payload.length && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = 'Participant left...';
    }
  }
});

zmClient.on('active-share-change', (payload) => console.log(payload));
