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
const role = 1;
let userIdentity;
let sessionKey;

zmClient.init('US-en', 'CDN');

function getSignature() {
  const btn = document.querySelector('#getSignature');
  btn.textContent = 'Joining Session...';
  btn.disabled = true;
  document.querySelector('#error').style.display = 'none';

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
      document.querySelector('#error').style.display = 'block';
      setTimeout(() => leaveSession(), 1000);
    } else {
      document.querySelector('#session').style.display = 'flex';
      document.querySelector('#landing').style.display = 'none';
    }
  } catch (err) {
    console.error(err);
    const btn = document.querySelector('#getSignature');
    btn.textContent = 'Join Session';
    btn.disabled = false;
  }
}

async function startVideo() {
  const btn = document.querySelector('#startVideo');
  btn.textContent = 'Starting Video...';
  btn.disabled = true;

  try {
    await zmStream.startVideo({ mirrored: true, hd: true });
    const container = document.querySelector('#self-view-container');
    container.innerHTML = '';

    const userId = zmClient.getCurrentUserInfo().userId;
    const videoEl = await zmStream.attachVideo(userId, container, { mirrored: true, hd: true, fill: true });
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';

    document.querySelector('#self-view-name').style.display = 'none';
    btn.style.display = 'none';
    document.querySelector('#stopVideo').style.display = 'inline-block';
  } catch (err) {
    console.error(err);
  } finally {
    btn.textContent = 'Start Video';
    btn.disabled = false;
  }
}

async function stopVideo() {
  try {
    const userId = zmClient.getCurrentUserInfo().userId;
    await zmStream.stopVideo();
    await zmStream.detachVideo(userId);

    const container = document.querySelector('#self-view-container');
    container.innerHTML = '';
    document.querySelector('#self-view-name').style.display = 'block';
    document.querySelector('#startVideo').style.display = 'inline-block';
    document.querySelector('#stopVideo').style.display = 'none';
  } catch (err) {
    console.error(err);
  }
}

function startAudio() {
  if ((window.safari && audioDecode && audioEncode) || !window.safari) {
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
  document.querySelector('#self-view-name').style.display = 'block';
  document.querySelector('#participant-name').textContent = '⏳ Waiting for participant to join...';

  const btn = document.querySelector('#getSignature');
  btn.textContent = 'Join Session';
  btn.disabled = false;

  document.querySelector('#startVideo').style.display = 'inline-block';
  document.querySelector('#startAudio').style.display = 'inline-block';
  document.querySelector('#landing').style.display = 'flex';
}

// Audio encode/decode events
zmClient.on('media-sdk-change', payload => {
  const { action, type, result } = payload;
  if (type === 'audio' && result === 'success') {
    if (action === 'encode') audioEncode = true;
    else if (action === 'decode') audioDecode = true;
  }
});

// Remote participant video
zmClient.on('peer-video-state-change', async payload => {
  const container = document.querySelector('#participant-container');

  if (!zmStream) return;

  if (payload.action === 'Start') {
    container.innerHTML = '';
    const videoEl = await zmStream.attachVideo(payload.userId, container, { hd: true, fill: true });
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
    document.querySelector('#participant-name').style.display = 'none';
  } else if (payload.action === 'Stop') {
    await zmStream.detachVideo(payload.userId);
    container.innerHTML = '';
    document.querySelector('#participant-name').style.display = 'block';
  }
});

zmClient.on('user-added', payload => {
  if (zmClient.getAllUser().length < 3 && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
    document.querySelector('#participant-name').textContent = payload[0].displayName;
  }
});

zmClient.on('user-removed', payload => {
  if (zmClient.getAllUser().length < 2 && payload.length && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
    document.querySelector('#participant-name').textContent = 'Participant left...';
  }
});

zmClient.on('active-share-change', payload => console.log(payload));
