const VideoSDK = window.WebVideoSDK.default
// Video_90P=0, 180P=1, 360P=2, 720P=3 (720p is the max a web client can render)
const VideoQuality = window.WebVideoSDK.VideoQuality || { Video_360P: 2, Video_720P: 3 }

let zmClient = VideoSDK.createClient()
let zmStream
let audioDecode
let audioEncode

// setup your signature endpoint here: https://github.com/zoom/videosdk-sample-signature-node.js
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
      sessionKey: sessionKey
    })
  }).then((response) => response.json())
    .then((data) => joinSession(data.signature))
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

function clearAllVideo() {
  attached.clear()
  pending.clear()
  selfContainer().innerHTML = ''
  participantContainer().innerHTML = ''
}

function leaveSession() {
  zmClient.leave()
  clearAllVideo()

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
