window.addEventListener('load', () => {
  if (!window.WebVideoSDK) {
    console.error('Zoom Video SDK not loaded!');
    return;
  }

  const VideoSDK = window.WebVideoSDK.default;
  let zmClient = VideoSDK.createClient();
  let zmStream;
  let audioDecode;
  let audioEncode;

  const signatureEndpoint = 'https://l1sgnx6bek.execute-api.us-east-1.amazonaws.com/latest';
  let sessionName = '';
  let sessionPasscode = '';
  let userName = 'Participant' + Math.floor(Math.random() * 100);
  let role = 1;
  let userIdentity;
  let sessionKey;

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

  // --- Functions ---
  function getSignature() {
    getSignatureBtn.textContent = 'Joining Session...';
    getSignatureBtn.disabled = true;
    document.getElementById('error').style.display = 'none';

    fetch(signatureEndpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        sessionName: document.getElementById('sessionName').value || sessionName,
        role, userIdentity, sessionKey
      })
    })
    .then(res => res.json())
    .then(data => joinSession(data.signature))
    .catch(err => {
      console.error(err);
      getSignatureBtn.textContent = 'Join Session';
      getSignatureBtn.disabled = false;
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

      if (zmClient.getAllUser().length > 4) {
        document.getElementById('error').style.display = 'block';
        setTimeout(() => leaveSession(), 1000);
      } else {
        document.getElementById('session').style.display = 'flex';
        document.getElementById('landing').style.display = 'none';
      }

    } catch (err) {
      console.error(err);
      getSignatureBtn.textContent = 'Join Session';
      getSignatureBtn.disabled = false;
    }
  }

  async function startVideo() {
    startVideoBtn.textContent = 'Starting Video...';
    startVideoBtn.disabled = true;

    try {
      await zmStream.startVideo({ mirrored:true, hd:true });
      const container = document.getElementById('self-view-container');
      const userId = zmClient.getCurrentUserInfo().userId;

      container.innerHTML = '';
      const videoEl = await zmStream.attachVideo(userId, container, { mirrored:true, hd:true, fill:true });
      videoEl.style.width='100%';
      videoEl.style.height='100%';
      videoEl.style.objectFit='cover';
      container.appendChild(videoEl);

      document.getElementById('self-view-name').style.display='none';
      startVideoBtn.style.display='none';
      stopVideoBtn.style.display='inline-block';
    } catch(err) {
      console.error(err);
    } finally {
      startVideoBtn.textContent='Start Video';
      startVideoBtn.disabled=false;
    }
  }

  async function stopVideo() {
    try {
      const userId = zmClient.getCurrentUserInfo().userId;
      await zmStream.stopVideo();
      await zmStream.detachVideo(userId);

      document.getElementById('self-view-container').innerHTML='';
      document.getElementById('self-view-name').style.display='block';
      startVideoBtn.style.display='inline-block';
      stopVideoBtn.style.display='none';
    } catch(err) { console.error(err); }
  }

  function startAudio() {
    const isSafari = window.safari !== undefined;
    if(isSafari) {
      if(audioDecode && audioEncode){
        zmStream.startAudio();
        startAudioBtn.style.display='none';
        muteAudioBtn.style.display='inline-block';
      }
    } else {
      zmStream.startAudio();
      startAudioBtn.style.display='none';
      muteAudioBtn.style.display='inline-block';
    }
  }

  function muteAudio() { zmStream.muteAudio(); muteAudioBtn.style.display='none'; unmuteAudioBtn.style.display='inline-block'; }
  function unmuteAudio() { zmStream.unmuteAudio(); muteAudioBtn.style.display='inline-block'; unmuteAudioBtn.style.display='none'; }

  function leaveSession() {
    zmClient.leave();
    document.getElementById('session').style.display='none';
    document.getElementById('self-view-container').innerHTML='';
    document.getElementById('participant-container').innerHTML='';
    startVideoBtn.style.display='inline-block';
    startAudioBtn.style.display='inline-block';
    document.getElementById('self-view-name').style.display='block';
    getSignatureBtn.textContent='Join Session';
    getSignatureBtn.disabled=false;
    document.getElementById('landing').style.display='flex';
  }

  zmClient.on('media-sdk-change', (payload) => {
    const {action,type,result} = payload;
    if(type==='audio' && result==='success'){
      if(action==='encode') audioEncode=true;
      else if(action==='decode') audioDecode=true;
    }
  });

  zmClient.on('peer-video-state-change', async (payload) => {
    try {
      const container = document.getElementById('participant-container');
      if(payload.action==='Start'){
        container.innerHTML='';
        const videoEl = await zmStream.attachVideo(payload.userId, container, { hd:true, fill:true });
        videoEl.style.width='100%';
        videoEl.style.height='100%';
        videoEl.style.objectFit='cover';
        container.appendChild(videoEl);
        document.getElementById('participant-name').style.display='none';
      } else if(payload.action==='Stop'){
        await zmStream.detachVideo(payload.userId);
        container.innerHTML='';
        document.getElementById('participant-name').style.display='block';
      }
    } catch(err){ console.error(err); }
  });

  zmClient.on('user-added', (payload)=>{
    if(zmClient.getAllUser().length<3 && payload[0].userId!==zmClient.getCurrentUserInfo().userId){
      document.getElementById('participant-name').textContent=payload[0].displayName;
    }
  });

  zmClient.on('user-removed', (payload)=>{
    if(zmClient.getAllUser().length<2 && payload.length && payload[0].userId!==zmClient.getCurrentUserInfo().userId){
      document.getElementById('participant-name').textContent='Participant left...';
    }
  });

  zmClient.on('active-share-change', payload=>console.log(payload));
});
