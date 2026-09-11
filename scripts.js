const VideoSDK = window.WebVideoSDK.default
// Video_90P=0, 180P=1, 360P=2, 720P=3 (720p is the max a web client can render)
const VideoQuality = window.WebVideoSDK.VideoQuality || { Video_360P: 2, Video_720P: 3 }

let zmClient = VideoSDK.createClient()
let zmStream
let recordingClient
let audioDecode
let audioEncode

// IMPORTANT: point this at YOUR OWN deployment of https://github.com/zoom/videosdk-sample-signature-node.js
// Recording is billed to and stored in the Video SDK account that owns the SDK key used to sign the JWT.
// Zoom's public demo endpoint below signs with Zoom's key, so recording won't work / won't land in your account.
let signatureEndpoint = 'https://videosdk-sample-signature-node-js.vercel.app/'
let sessionName = ''
let sessionPasscode = ''
let userName = 'Participant' + Math.floor(Math.random() * 100)
let role = 1
let userIdentity
let sessionKey

// Users whose video is currently attached, so we never attach twice or detach something that isn't there
const attached = new Set()
// Serialize attach/detach per user so a fast Start -> Stop -> Start can't run out of order
const pending = new Map()

const selfContainer = () => document.querySelector('#self-view-container')
const participantContainer = () => document.querySelector('#participant-container')

// enforceMultipleVideos: lets the WebAssembly renderer show more than one video without
// SharedArrayBuffer (GitHub Pages can't send COOP/COEP headers, and the old origin-trial token expired in March 2024)
zmClient.init('en-US', 'Global', {
  patchJsMedia: true,
  enforceMultipleVideos: true,
  leaveOnPageUnload: true
})

function getSignature() {
  document.querySelector('#getSignature').textContent = 'Joining Session...'
  document.querySelector('#getSignature').disabled = true
  document.querySelector('#error').style.display = 'none'

  fetch(signatureEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionName: document.getElementById('sessionName').value || sessionName,
      role: role,
      userIdentity: userIdentity,
      sessionKey: sessionKey,
      cloudRecordingOption: 1,   // 1 = separate video file per user (plus the combined recording)
      cloudRecordingElection: 1  // 1 = record this user's own video individually
    })
  }).then((response) => response.json())
    .then((data) => {
      if (!data.signature) throw new Error('Signature endpoint error: ' + JSON.stringify(data))
      joinSession(data.signature)
    })
    .catch((error) => {
      console.log(error)
      resetJoinButton()
    })
}

function resetJoinButton() {
  document.querySelector('#getSignature').textContent = 'Join Session'
  document.querySelector('#getSignature').disabled = false
}

function joinSession(signature) {
  zmClient.join(
    document.getElementById('sessionName').value || sessionName,
    signature,
    document.getElementById('userName').value || userName,
    document.getElementById('sessionPasscode').value || sessionPasscode
  ).then(() => {
    zmStream = zmClient.getMediaStream()
    console.log(zmClient.getSessionInfo())

    if (zmClient.getAllUser().length > 4) {
      document.querySelector('#error').style.display = 'block'
      setTimeout(() => leaveSession(), 1000)
      return
    }

    document.querySelector('#session').style.display = 'flex'
    document.querySelector('#landing').style.display = 'none'

    // Render anyone who already had video on before we joined
    renderExistingVideos()

    recordingClient = zmClient.getRecordingClient()
    updateRecordingUI()
    const diag = recordingDiagnostics()
    if (diag.isHost && diag.canStartRecording === false) {
      toast('Cloud recording is not enabled for the Video SDK account that signed this session.')
    }
  }).catch((error) => {
    console.log(error)
    resetJoinButton()
  })
}

function peerQuality() {
  // Ask for 720p only when this browser can actually handle it; otherwise 360p keeps video smooth
  return zmStream && zmStream.isSupportHDVideo && zmStream.isSupportHDVideo()
    ? VideoQuality.Video_720P
    : VideoQuality.Video_360P
}

function queue(userId, task) {
  const prev = pending.get(userId) || Promise.resolve()
  const next = prev.then(task, task).catch((error) => console.log('video render error', userId, error))
  pending.set(userId, next)
  return next
}

function attachUser(userId, container, quality) {
  return queue(userId, async () => {
    if (!zmStream || attached.has(userId)) return
    const element = await zmStream.attachVideo(userId, quality)
    container.appendChild(element)
    attached.add(userId)
  })
}

function detachUser(userId) {
  return queue(userId, async () => {
    if (!zmStream || !attached.has(userId)) return
    const elements = await zmStream.detachVideo(userId)
    ;(Array.isArray(elements) ? elements : [elements]).forEach((el) => el && el.remove())
    attached.delete(userId)
  })
}

function showParticipant(on) {
  participantContainer().style.display = on ? 'block' : 'none'
  document.querySelector('#participant-name').style.display = on ? 'none' : 'block'
}

function renderExistingVideos() {
  const selfId = zmClient.getCurrentUserInfo().userId
  zmClient.getAllUser().forEach((user) => {
    if (user.userId !== selfId && user.bVideoOn) {
      attachUser(user.userId, participantContainer(), peerQuality()).then(() => showParticipant(true))
    }
  })
}

function startVideo() {
  document.querySelector('#startVideo').textContent = 'Starting Video...'
  document.querySelector('#startVideo').disabled = true

  const hd = zmStream.isSupportHDVideo ? zmStream.isSupportHDVideo() : false

  zmStream.startVideo({ mirrored: true, hd: hd })
    .then(() => attachUser(zmClient.getCurrentUserInfo().userId, selfContainer(), hd ? VideoQuality.Video_720P : VideoQuality.Video_360P))
    .then(() => {
      document.querySelector('#self-view-name').style.display = 'none'
      document.querySelector('#startVideo').style.display = 'none'
      document.querySelector('#stopVideo').style.display = 'inline-block'
    })
    .catch((error) => console.log(error))
    .finally(() => {
      document.querySelector('#startVideo').textContent = 'Start Video'
      document.querySelector('#startVideo').disabled = false
    })
}

function stopVideo() {
  const selfId = zmClient.getCurrentUserInfo().userId
  zmStream.stopVideo()
    .then(() => detachUser(selfId))
    .catch((error) => console.log(error))

  document.querySelector('#self-view-name').style.display = 'block'
  document.querySelector('#startVideo').style.display = 'inline-block'
  document.querySelector('#stopVideo').style.display = 'none'
}

function startAudio() {
  var isSafari = window.safari !== undefined

  if (isSafari && !(audioDecode && audioEncode)) {
    console.log('desktop safari audio init has not finished')
    return
  }
  zmStream.startAudio()
  document.querySelector('#startAudio').style.display = 'none'
  document.querySelector('#muteAudio').style.display = 'inline-block'
}

function muteAudio() {
  zmStream.muteAudio()
  document.querySelector('#muteAudio').style.display = 'none'
  document.querySelector('#unmuteAudio').style.display = 'inline-block'
}

function unmuteAudio() {
  zmStream.unmuteAudio()
  document.querySelector('#muteAudio').style.display = 'inline-block'
  document.querySelector('#unmuteAudio').style.display = 'none'
}

// ---------- Cloud recording ----------
// Only the host or a manager can control recording, and the Video SDK account that owns
// the SDK key must have cloud recording enabled (Cloud Recording Storage Plan).

function isHostOrManager() {
  return !!(zmClient.isHost && zmClient.isHost()) || !!(zmClient.isManager && zmClient.isManager())
}

function canControlRecording() {
  return !!recordingClient && isHostOrManager() && recordingClient.canStartRecording()
}

// Call recordingDiagnostics() in the browser console to see why recording is or isn't available
function recordingDiagnostics() {
  const info = {
    signatureEndpoint: signatureEndpoint,
    isHost: !!(zmClient.isHost && zmClient.isHost()),
    isManager: !!(zmClient.isManager && zmClient.isManager()),
    canStartRecording: recordingClient ? recordingClient.canStartRecording() : 'no recording client',
    cloudRecordingStatus: recordingClient ? recordingClient.getCloudRecordingStatus() : 'no recording client',
    sessionInfo: zmClient.getSessionInfo()
  }
  console.table(info)
  return info
}
window.recordingDiagnostics = recordingDiagnostics

function toast(message, type) {
  const el = document.querySelector('#toast')
  el.textContent = message
  el.className = type || ''
  el.style.display = 'block'
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { el.style.display = 'none' }, 7000)
}

function setDisplay(id, show) {
  document.querySelector(id).style.display = show ? 'inline-block' : 'none'
}

function updateRecordingUI(state) {
  state = state || (recordingClient ? recordingClient.getCloudRecordingStatus() : 'Stopped')
  const isRecording = state === 'Recording'
  const isPaused = state === 'Paused'
  const controls = canControlRecording()

  setDisplay('#startRecording', controls && !isRecording && !isPaused)
  setDisplay('#pauseRecording', controls && isRecording)
  setDisplay('#resumeRecording', controls && isPaused)
  setDisplay('#stopRecording', controls && (isRecording || isPaused))

  // Everyone (not just the host) sees the notice while recording is on
  const indicator = document.querySelector('#recording-indicator')
  indicator.style.display = isRecording || isPaused ? 'flex' : 'none'
  indicator.classList.toggle('paused', isPaused)
  document.querySelector('#recording-label').textContent = isPaused ? 'PAUSED' : 'REC'
}

function recordingAction(buttonId, busyText, action) {
  const button = document.querySelector(buttonId)
  const original = button.textContent
  button.textContent = busyText
  button.disabled = true
  Promise.resolve()
    .then(() => {
      if (!recordingClient) throw new Error('Not in a session')
      if (!isHostOrManager()) throw new Error('Only the host or a manager can control recording')
      return action()
    })
    .then((result) => {
      // These methods resolve with an Error object instead of rejecting in some cases
      if (result instanceof Error) throw result
    })
    .catch((error) => {
      console.log('recording error', error)
      alertRecordingError(error)
    })
    .finally(() => {
      button.textContent = original
      button.disabled = false
      updateRecordingUI()
    })
}

function alertRecordingError(error) {
  const reason = (error && (error.reason || error.message || error.type || JSON.stringify(error))) || 'Unknown error'
  toast('Recording failed: ' + reason)
}

function startRecording() {
  recordingAction('#startRecording', 'Starting...', () => recordingClient.startCloudRecording())
}

function pauseRecording() {
  recordingAction('#pauseRecording', 'Pausing...', () => recordingClient.pauseCloudRecording())
}

function resumeRecording() {
  recordingAction('#resumeRecording', 'Resuming...', () => recordingClient.resumeCloudRecording())
}

function stopRecording() {
  recordingAction('#stopRecording', 'Stopping...', () => recordingClient.stopCloudRecording())
}

// Individual (per-user) recording consent.
// When the host starts per-user recording, the SDK sends state 'Ask' to participants,
// who must accept or decline. The prompt is built here so no HTML changes are needed.
function showConsentPrompt() {
  if (document.querySelector('#recording-consent')) return
  const bar = document.createElement('div')
  bar.id = 'recording-consent'
  bar.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:30;' +
    'max-width:90vw;padding:20px 24px;border-radius:20px;background:#ffffff;color:#073B4C;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;font-size:15px'
  bar.innerHTML =
    '<p style="margin:0 0 14px">The host wants to record your video individually. Do you consent?</p>' +
    '<button class="primary" id="consent-accept">Accept</button>' +
    '<button class="leave" id="consent-decline">Decline</button>'
  document.body.appendChild(bar)

  const respond = (accept) => {
    bar.remove()
    const call = accept ? recordingClient.acceptIndividualRecording() : recordingClient.declineIndividualRecording()
    Promise.resolve(call)
      .then((result) => {
        if (result instanceof Error) throw result
        toast(accept ? 'You accepted individual recording' : 'You declined individual recording', 'info')
      })
      .catch((error) => alertRecordingError(error))
  }
  bar.querySelector('#consent-accept').onclick = () => respond(true)
  bar.querySelector('#consent-decline').onclick = () => respond(false)
}

function hideConsentPrompt() {
  const bar = document.querySelector('#recording-consent')
  if (bar) bar.remove()
}

// Fires for every participant whenever the recording state changes
zmClient.on('recording-change', (payload) => {
  console.log('recording-change', payload)
  if (payload.state === 'Ask') {
    showConsentPrompt()
    return
  }
  if (payload.state === 'Accept' || payload.state === 'Decline') {
    // Another user's consent response (host sees these) — just log it
    console.log('individual recording consent:', payload)
    return
  }
  hideConsentPrompt()
  updateRecordingUI(payload.state)
  if (payload.state === 'Recording') toast('Cloud recording is on', 'info')
  if (payload.state === 'Stopped') toast('Recording stopped — it will appear in your Video SDK account once processed', 'info')
})

// Host can change hands (e.g. host leaves) — show/hide the controls accordingly
zmClient.on('user-updated', () => {
  if (recordingClient) updateRecordingUI()
})

function clearAllVideo() {
  attached.clear()
  pending.clear()
  selfContainer().innerHTML = ''
  participantContainer().innerHTML = ''
}

function leaveSession() {
  zmClient.leave()
  clearAllVideo()
  recordingClient = null
  hideConsentPrompt()
  updateRecordingUI('Stopped')

  document.querySelector('#session').style.display = 'none'
  document.querySelector('#muteAudio').style.display = 'none'
  document.querySelector('#unmuteAudio').style.display = 'none'
  document.querySelector('#stopVideo').style.display = 'none'
  showParticipant(false)

  document.querySelector('#startVideo').style.display = 'inline-block'
  document.querySelector('#startAudio').style.display = 'inline-block'
  document.querySelector('#self-view-name').style.display = 'block'

  document.querySelector('#participant-name').textContent = '⏳ Waiting for participant to join...'
  resetJoinButton()
  document.querySelector('#startVideo').textContent = 'Start Video'
  document.querySelector('#startVideo').disabled = false

  document.querySelector('#landing').style.display = 'flex'
}

zmClient.on('media-sdk-change', (payload) => {
  console.log(payload)
  const { action, type, result } = payload
  if (type === 'audio' && result === 'success') {
    if (action === 'encode') audioEncode = true
    else if (action === 'decode') audioDecode = true
  }
})

// Replaces the old setInterval polling: act on the event directly, in order, once per user
zmClient.on('peer-video-state-change', (payload) => {
  if (!zmStream) return // joinSession() calls renderExistingVideos() once the stream is ready
  if (payload.userId === zmClient.getCurrentUserInfo().userId) return

  if (payload.action === 'Start') {
    attachUser(payload.userId, participantContainer(), peerQuality()).then(() => showParticipant(true))
  } else if (payload.action === 'Stop') {
    detachUser(payload.userId).then(() => showParticipant(false))
  }
})

// After a network drop the SDK reconnects, but the old video elements are dead — re-attach them
zmClient.on('connection-change', (payload) => {
  console.log('connection-change', payload)
  if (payload.state === 'Reconnecting') {
    clearAllVideo()
  } else if (payload.state === 'Connected' && zmStream) {
    zmStream = zmClient.getMediaStream()
    renderExistingVideos()
    if (zmStream.isCapturingVideo && zmStream.isCapturingVideo()) {
      attachUser(zmClient.getCurrentUserInfo().userId, selfContainer(), VideoQuality.Video_360P)
    }
  }
})

zmClient.on('user-added', (payload) => {
  if (zmClient.getAllUser().length < 3) {
    if (payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = payload[0].displayName
    }
  }
})

zmClient.on('user-removed', (payload) => {
  payload.forEach((user) => {
    if (attached.has(user.userId)) detachUser(user.userId).then(() => showParticipant(false))
  })
  if (zmClient.getAllUser().length < 2) {
    if (payload.length && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = 'Participant left...'
    }
  }
})

zmClient.on('active-share-change', (payload) => {
  console.log(payload)
})
 
    


    
