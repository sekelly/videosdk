const VideoSDK = window.WebVideoSDK.default
let zmClient = VideoSDK.createClient()
let zmStream
let audioDecode
let audioEncode
// setup your signature endpoint here: https://github.com/zoom/videosdk-sample-signature-node.js
let signatureEndpoint = 'https://l1sgnx6bek.execute-api.us-east-1.amazonaws.com/latest'
let sessionName = ''
let sessionPasscode = ''
let userName = 'Participant' + Math.floor(Math.random() * 100)
let role = 1
let userIdentity
let sessionKey

zmClient.init('US-en', 'CDN')

function getSignature() {
  document.querySelector('#getSignature').textContent = 'Joining Session...'
  document.querySelector('#getSignature').disabled = true
  document.querySelector('#error').style.display = 'none'
  fetch(signatureEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionName: document.getElementById('sessionName').value || sessionName,
      role: role,
      userIdentity: userIdentity,
      sessionKey: sessionKey
    })
  }).then((response) => {
    return response.json()
  }).then((data) => {
    joinSession(data.signature)
  }).catch((error) => {
    console.log(error)
  })
}

function joinSession(signature) {
  zmClient.join(document.getElementById('sessionName').value || sessionName, signature, document.getElementById('userName').value || userName, document.getElementById('sessionPasscode').value || sessionPasscode).then((data) => {
    zmStream = zmClient.getMediaStream()
    console.log(zmClient.getSessionInfo())
    if(zmClient.getAllUser().length > 4) {
      document.querySelector('#error').style.display = 'block'
      setTimeout(() => {
        leaveSession()
      }, 1000)
    } else {
      document.querySelector('#session').style.display = 'flex'
      document.querySelector('#landing').style.display = 'none'
    }
  }).catch((error) => {
    console.log(error)
  })
}

// FIXED: Updated startVideo function with proper element checking
function startVideo() {
  document.querySelector('#startVideo').textContent = 'Starting Video...'
  document.querySelector('#startVideo').disabled = true
  
  // Check if video element exists
  const videoElement = document.querySelector('#self-view-video')
  if (!videoElement) {
    console.error('Video element not found!')
    document.querySelector('#startVideo').textContent = 'Start Video'
    document.querySelector('#startVideo').disabled = false
    return
  }
  
  console.log('Video element found:', videoElement)
  
  // Start video without videoElement option (this removes the deprecation warning)
  zmStream.startVideo({ mirrored: true, hd: true }).then(() => {
    console.log('Video started, now attaching to element...')
    
    // Use attachVideo for self-view (required for certain browsers)
    zmStream.attachVideo(zmClient.getCurrentUserInfo().userId, videoElement).then(() => {
      console.log('Video attached successfully')
      videoElement.style.display = 'block'
      document.querySelector('#self-view-name').style.display = 'none'
      document.querySelector('#startVideo').style.display = 'none'
      document.querySelector('#stopVideo').style.display = 'inline-block'
      document.querySelector('#startVideo').textContent = 'Start Video'
      document.querySelector('#startVideo').disabled = false
    }).catch((error) => {
      console.error('Error attaching video:', error)
      document.querySelector('#startVideo').textContent = 'Start Video'
      document.querySelector('#startVideo').disabled = false
    })
  }).catch((error) => {
    console.error('Error starting video:', error)
    document.querySelector('#startVideo').textContent = 'Start Video'
    document.querySelector('#startVideo').disabled = false
  })
}

// FIXED: Updated stopVideo function with proper error handling
function stopVideo() {
  const videoElement = document.querySelector('#self-view-video')
  
  if (!videoElement) {
    console.error('Video element not found during stop!')
    return
  }
  
  // Detach video before stopping
  zmStream.detachVideo(zmClient.getCurrentUserInfo().userId).then(() => {
    console.log('Video detached successfully')
    zmStream.stopVideo()
    videoElement.style.display = 'none'
    document.querySelector('#self-view-name').style.display = 'block'
    document.querySelector('#startVideo').style.display = 'inline-block'
    document.querySelector('#stopVideo').style.display = 'none'
  }).catch((error) => {
    console.error('Error detaching video:', error)
    // Fallback: still stop video even if detach fails
    zmStream.stopVideo()
    videoElement.style.display = 'none'
    document.querySelector('#self-view-name').style.display = 'block'
    document.querySelector('#startVideo').style.display = 'inline-block'
    document.querySelector('#stopVideo').style.display = 'none'
  })
}

function startAudio() {
  var isSafari = window.safari !== undefined
  if(isSafari) {
    console.log('desktop safari')
    if(audioDecode && audioEncode){
      zmStream.startAudio()
      document.querySelector('#startAudio').style.display = 'none'
      document.querySelector('#muteAudio').style.display = 'inline-block'
    } else {
      console.log('desktop safari audio init has not finished')
    }
  } else {
    console.log('not desktop safari')
    zmStream.startAudio()
    document.querySelector('#startAudio').style.display = 'none'
    document.querySelector('#muteAudio').style.display = 'inline-block'
  }
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

function leaveSession() {
  zmClient.leave()
  document.querySelector('#session').style.display = 'none'
  document.querySelector('#muteAudio').style.display = 'none'
  document.querySelector('#unmuteAudio').style.display = 'none'
  document.querySelector('#stopVideo').style.display = 'none'
  
  const videoElement = document.querySelector('#self-view-video')
  if (videoElement) {
    videoElement.style.display = 'none'
  }
  
  document.querySelector('#participant-canvas').style.display = 'none'
  document.querySelector('#startVideo').style.display = 'inline-block'
  document.querySelector('#startAudio').style.display = 'inline-block'
  document.querySelector('#self-view-name').style.display = 'block'
  document.querySelector('#participant-name').textContent = '⏳ Waiting for participant to join...'
  document.querySelector('#getSignature').textContent = 'Join Session'
  document.querySelector('#getSignature').disabled = false
  document.querySelector('#startVideo').textContent = 'Start Video'
  document.querySelector('#startVideo').disabled = false
  document.querySelector('#landing').style.display = 'flex'
}

zmClient.on('media-sdk-change', (payload) => {
  console.log(payload)
  const { action, type, result } = payload
  if (type === 'audio' && result === 'success') {
    if (action === 'encode') {
      audioEncode = true
    } else if (action === 'decode') {
      audioDecode = true
    }
  }
})

zmClient.on('peer-video-state-change', (payload) => {
  var interval
  function ifZmStream() {
    if(zmStream) {
      clearInterval(interval)
      if(payload.action === 'Start') {
        zmStream.renderVideo(document.querySelector('#participant-canvas'), payload.userId, 1920, 1080, 0, 0, 3).then(() => {
          document.querySelector('#participant-canvas').style.display = 'block'
          document.querySelector('#participant-name').style.display = 'none'
        })
      } else if(payload.action === 'Stop') {
        zmStream.stopRenderVideo(document.querySelector('#participant-canvas'), payload.userId).then(() => {
          document.querySelector('#participant-canvas').style.display = 'none'
          document.querySelector('#participant-name').style.display = 'block'
        })
      }
    }
  }
  interval = setInterval(ifZmStream, 1000)
})

zmClient.on('user-added', (payload) => {
  if(zmClient.getAllUser().length < 3) {
    if(payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = payload[0].displayName
    }
  }
})

zmClient.on('user-removed', (payload) => {
  if(zmClient.getAllUser().length < 2) {
    if(payload.length && payload[0].userId !== zmClient.getCurrentUserInfo().userId) {
      document.querySelector('#participant-name').textContent = 'Participant left...'
    }
  }
})

zmClient.on('active-share-change', (payload) => {
  console.log(payload)
})
