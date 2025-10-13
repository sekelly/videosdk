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
  let userName = 'Participant' + Math.floor(Math.random() * 100);
  let role = 1;

  zmClient.init('US-en', 'CDN');

  // Buttons
  const getSignatureBtn = document.getElementById('getSignature');
  const startVideoBtn = document.getElementById('startVideo');
  const stopVideoBtn = document.getElementById('stopVideo');
  const startAudioBtn = document.getElementById('startAudio');
  const muteAudioBtn = document.getElementById('muteAudio');
  const unmuteAudioBtn = document.getElementById('unmuteAudio');
  const leaveBtn = document.getElementById('leave');

  getSignatureBtn.onclick = getSignature;
  startVideoBtn.onclick = startVideo;
  stopVideoBtn.onclick = stopVideo;
  startAudioBtn.onclick = startAudio;
  muteAudioBtn.onclick = muteAudio;
  unmuteAudioBtn.onclick = unmuteAudio;
  leaveBtn.onclick = leaveSession;

  async function getSignature() {
    getSignatureBtn.textContent = 'Joining Session...';
    getSignatureBtn.disabled = true;
    document.getElementById('error').style.display = 'none';

    try {
      const response = await fetch(signatureEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionName: document.getElementById('sessionName').value,
          role
        }),
      });
      const data = await response.json();
      await joinSession(data.signature);
    } catch (err) {
      console.error(err);
      getSignatureBtn.textContent = 'Join Session';
      getSignatureBtn.disabled = false;
    }
  }

  async function joinSession(signature) {
    try {
      await zmClient.join(
        document.getElementById('sessionName').value,
        signature,
        document.getElementById('userName').value || userName,
        document.getElementById('sessionPasscode').value
      );

      zmStream = zmClient.getMediaStream();

      document.getElementById('session').style.display = 'flex';
      document.getElementById('landing').style.display = 'none';
    } catch (err) {
      console.error(err);
      document.getElementById('error').style.display = 'block';
      getSignatureBtn.textContent = 'Join Session';
      getSignatureBtn.disabled = false;
    }
  }

  async function startVideo() {
    try {
      await zmStream.startVideo({ mirrored: true, hd: true });
      const selfVideo = document.getElementById('self-view-video');
      await zmStream.attachVideo(zmClient.getCurrentUserInfo().userId, selfVideo, { mirrored: true, fill: true });

      startVideoBtn.style.display = 'none';
      stopVideoBtn.style.display = 'inline-block';
      document.getElementById('self-view-name').style.display = 'none';
    } catch (err) {
      console.error('Error starting video:', err);
    }
  }

  async function stopVideo() {
    try {
      const userId = zmClient.getCurrentUserInfo().userId;
      await zmStream.stopVideo();
      await zmStream.detachVideo(userId);

      document.getElementById('self-view-video').style.display = 'none';
      document.getElementById('self-view-name').style.display = 'block';
      startVideoBtn.style.display = 'inline-block';
      stopVideoBtn.style.display = 'none';
    } catch (err) {
      console.error(err);
    }
  }

  function startAudio() {
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

  async function leaveSession() {
    await zmClient.leave();
    document.getElementById('session').style.display = 'none';
    document.getElementById('landing').style.display = 'flex';
    startVideoBtn.style.display = 'inline-block';
    stopVideoBtn.style.display = 'none';
    startAudioBtn.style.display = 'inline-block';
    muteAudioBtn.style.display = 'none';
    unmuteAudioBtn.style.display = 'none';
    document.getElementById('self-view-video').style.display = 'none';
    document.getElementById('self-view-name').style.display = 'block';
    document.getElementById('participant-name').textContent = '⏳ Waiting for participant to join...';
    getSignatureBtn.textContent = 'Join Session';
    getSignatureBtn.disabled = false;
  }

  // Attach participant video
  zmClient.on('peer-video-state-change', async (payload) => {
    const container = document.getElementById('participant-video');
    if (!zmStream) return;
    try {
      if (payload.action === 'Start') {
        await zmStream.attachVideo(payload.userId, container, { fill: true });
        document.getElementById('participant-name').style.display = 'none';
      } else if (payload.action === 'Stop') {
        await zmStream.detachVideo(payload.userId);
        document.getElementById('participant-name').style.display = 'block';
      }
    } catch (err) {
      console.error('Peer video error:', err);
    }
  });
});
