document.addEventListener('DOMContentLoaded', () => {
  if (!window.WebVideoSDK) {
    console.error('Zoom Video SDK not loaded!');
    return;
  }

  const VideoSDK = window.WebVideoSDK.default;
  const zmClient = VideoSDK.createClient();
  let zmStream;
  let audioDecode = false;
  let audioEncode = false;

  const signatureEndpoint = 'https://l1sgnx6bek.execute-api.us-east-1.amazonaws.com/latest';
  let sessionName = '';
  let sessionPasscode = '';
  let userName = 'Participant' + Math.floor(Math.random() * 100);
  let role = 1;
  let userIdentity;
  let sessionKey;

  zmClient.init('US-en', 'CDN');

  // ===== Buttons =====
  const getSigBtn = document.querySelector('#getSignature');
  const startVideoBtn = document.querySelector('#startVideo');
  const stopVideoBtn = document.querySelector('#stopVideo');
  const startAudioBtn = document.querySelector('#startAudio');
  const muteAudioBtn = document.querySelector('#muteAudio');
  const unmuteAudioBtn = document.querySelector('#unmuteAudio');
  const leaveBtn = document.querySelector('#leave');

  getSigBtn.onclick = getSignature;
  startVideoBtn.onclick = startVideo;
  stopVideoBtn.onclick = stopVideo;
  startAudioBtn.onclick = startAudio;
  muteAudioBtn.onclick = muteAudio;
  unmuteAudioBtn.onclick = unmuteAudio;
  leaveBtn.onclick = leaveSession;

  // ===== Get Signature =====
  function getSignature() {
    getSigBtn.textContent = 'Joining Session...';
    getSigBtn.disabled = true;
    document.querySelector('#error').style.display = 'none';

    fetch(signatureEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionName: document.getElementById('sessionName').value || sessionName,
        role,
        userIdentity,
        sessionKey
      }),
    })
      .then(res => res.json())
      .then(data => joinSession(data.signature))
      .catch(err => {
        console.error(err);
        getSigBtn.textContent = 'Join Session';
        getSigBtn.disabled = false;
      });
  }

  // ===== Join Session =====
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
      getSigBtn.textContent = 'Join Session';
      getSigBtn.disabled = false;
    }
  }

  // ===== Video =====
  async function startVideo() {
    startVideoBtn.textContent = 'Starting Video...';
    startVideoBtn.disabled = true;

    const selfVideo = document.querySelector('#self-view-video');

    try {
      await zmStream.startVideo({ mirrored: true, hd: true });

      // Attach self-view using attachVideo (cover removes black bars)
      await zmStream.attachVideo(selfVideo, zmClient.getCurrentUserInfo().userId, {
        fit: 'cover',
        mirrored: true
      });

      selfVideo.style.display = 'block';
      document.querySelector('#self-view-name').style.display = 'none';

      startVideoBtn.style.display = 'none';
      stopVideoBtn.style.display = 'inline-block';
    } catch (err) {
      console.error(err);
    } finally {
      startVideoBtn.textContent = 'Start Video';
      startVideoBtn.disabled = false;
    }
  }

  async function stopVideo() {
    try {
      const selfVideo = document.querySelector('#self-view-video');
      await zmStream.stopVideo();
      await zmStream.detachVideo(selfVideo, zmClient.getCurrentUserInfo().userId);

      selfVideo.style.display = 'none';
      document.querySelector('#self-view-name').style.display = 'block';

      startVideoBtn.style.display = 'inline-block';
      stopVideoBtn.style.display = 'none';
    } catch (err) {
      console.error(err);
    }
  }

  // ===== Audio =====
  function startAudio() {
    const isSafari = window.safari !== undefined;

    if (isSafari && !(audioDecode && audioEncode)) {
      console.log('Safari audio not ready');
      return;
    }

    zmStream.startAudio();
    startAudioBtn.style.display = 'none';
    muteAudioBtn.style.display = 'inline-block';
  }

  function muteAudio() {
    zmStream.muteAudio();
    muteAudioBtn.style.display = 'none';
    unmuteAudioBtn.style.display = 'inline-block';
  }

  function unmuteAudio() {
    zmStream.unmuteAudio();
    muteAudioBtn.style.display = 'inline-block';
    unmuteAudioBtn.style.display = 'none';
  }

  // ===== Leave Session =====
  async function leaveSession() {
    await zmClient.leave();

    document.querySelector('#session').style.display = 'none';
    document.querySelector('#self-view-video').style.display = 'none';
    document.querySelector('#participant-canvas').style.display = 'none';
    document.querySelector('#self-view-name').style.display = 'block';

    startVideoBtn.style.display = 'inline-block';
    startAudioBtn.style.display = 'inline-block';

    document.querySelector('#participant-name').textContent = '⏳ Waiting for participant to join...';
    getSigBtn.textContent = 'Join Session';
    getSigBtn.disabled = false;
    startVideoBtn.textContent = 'Start Video';
    startVideoBtn.disabled = false;

    document.querySelector('#landing').style.display = 'flex';
  }

  // ===== SDK Event Listeners =====
  zmClient.on('media-sdk-change', (payload) => {
    const { action, type, result } = payload;
    if (type === 'audio' && result === 'success') {
      if (action === 'encode') audioEncode = true;
      else if (action === 'decode') audioDecode = true;
    }
  });

  zmClient.on('peer-video-state-change', async (payload) => {
    const participantCanvas = document.querySelector('#participant-canvas');
    if (!zmStream) return;

    if (payload.action === 'Start') {
      await zmStream.attachVideo(participantCanvas, payload.userId, { fit: 'cover' });
      participantCanvas.style.display = 'block';
      document.querySelector('#participant-name').style.display = 'none';
    } else if (payload.action === 'Stop') {
      await zmStream.detachVideo(participantCanvas, payload.userId);
      participantCanvas.style.display = 'none';
      document.querySelector('#participant-name').style.display = 'block';
    }
  });

  zmClient.on('user-added', (payload) => {
    if (zmClient.getAllUser().length < 3) {
      const otherUser = payload.find(u => u.userId !== zmClient.getCurrentUserInfo().userId);
      if (otherUser) document.querySelector('#participant-name').textContent = otherUser.displayName;
    }
  });

  zmClient.on('user-removed', (payload) => {
    if (zmClient.getAllUser().length < 2) {
      const otherUser = payload.find(u => u.userId !== zmClient.getCurrentUserInfo().userId);
      if (otherUser) document.querySelector('#participant-name').textContent = 'Participant left...';
    }
  });

  zmClient.on('active-share-change', (payload) => console.log(payload));
});
