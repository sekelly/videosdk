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

  // Buttons
  const startVideoBtn = document.querySelector('#startVideo');
  const stopVideoBtn = document.querySelector('#stopVideo');
  const startAudioBtn = document.querySelector('#startAudio');
  const muteAudioBtn = document.querySelector('#muteAudio');
  const unmuteAudioBtn = document.querySelector('#unmuteAudio');
  const getSignatureBtn = document.querySelector('#getSignature');
  const leaveBtn = document.querySelector('#leave');

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
    document.querySelector('#error').style.display = 'none';

    try {
      const res = await fetch(signatureEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionName: document.getElementById('sessionName').value || sessionName,
          role,
          userIdentity,
          sessionKey
        })
      });

      const data = await res.json();
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
        document.getElementById('sessionName').value || sessionName,
        signature,
        document.getElementById('userName').value || userName,
        document.getElementById('sessionPasscode').value || sessionPasscode
      );

      zmStream = zmClient.getMediaStream();
      console.log(zmClient.getSessionInfo());

      document.querySelector('#session').style.display = 'flex';
      document.querySelector('#landing').style.display = 'none';
    } catch (err) {
      console.error(err);
      getSignatureBtn.textContent = 'Join Session';
      getSignatureBtn.disabled = false;
    }
  }

  // === VIDEO FUNCTIONS ===
  async function startVideo() {
    startVideoBtn.textContent = 'Starting Video...';
    startVideoBtn.disabled = true;
    const selfVideoEl = document.querySelector('#self-view-video');

    try {
      await zmStream.startVideo({ mirrored: true, hd: true });
      await zmStream.attachVideo(selfVideoEl, zmClient.getCurrentUserInfo().userId, { fit: 'cover', mirrored: true });

      selfVideoEl.style.display = 'block';
      document.querySelector('#self-view-name').style.display = 'none';
      startVideoBtn.style.display = 'none';
      stopVideoBtn.style.display = 'inline-block';
    } catch (err) {
      console.error('Error starting video:', err);
    } finally {
      startVideoBtn.textContent = 'Start Video';
      startVideoBtn.disabled = false;
    }
  }

  async function stopVideo() {
    try {
      await zmStream.stopVideo();
      const selfVideoEl = document.querySelector('#self-view-vide
