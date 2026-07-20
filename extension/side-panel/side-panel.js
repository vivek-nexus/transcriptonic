const meetingTitle = document.querySelector("#meeting-title")
const container = document.querySelector('#transcript-container')
const SCROLL_THRESHOLD = 50
const LIVE_BLOCK_ID = 'live-transcript-placeholder'

chrome.storage.local.get(["meetingTitle", "transcript"], (result) => {
    if (result.meetingTitle) {
        const titleText = result.meetingTitle
        if (titleText) {
            console.log(result.meetingTitle)
            meetingTitle.innerHTML = titleText
        }
    }

    if (result.transcript) {
        updateTranscriptDOM(result.transcript)
    }
})

// Update on change
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.meetingTitle) {
        const titleText = changes.meetingTitle.newValue
        if (titleText) {
            meetingTitle.innerHTML = titleText
        }
    }

    if (areaName === 'local' && changes.transcript) {
        const newTranscript = changes.transcript.newValue || []
        updateTranscriptDOM(newTranscript)
    }
})


// Live Message Listener
chrome.runtime.onMessage.addListener((messageUnTyped, sender, sendResponse) => {
    const message = /** @type {ExtensionMessage} */ (messageUnTyped)
    if (message.type === "broadcast_live_buffer") {
        if (message.stateTranscriptBlock) {
            renderLiveBuffer(message.stateTranscriptBlock)
        }
    }
})

/**
 * Renders or updates the temporary live block at the absolute bottom
 * @param {StateTranscriptBlock} liveBlock 
 */
function renderLiveBuffer(liveBlock) {
    // If the buffer is empty, don't show an empty block
    if (!liveBlock.transcriptTextBuffer.trim()) return

    const isUserAtBottom =
        (container.scrollHeight - container.scrollTop - container.clientHeight) <= SCROLL_THRESHOLD

    let liveEl = document.getElementById(LIVE_BLOCK_ID)

    if (!liveEl) {
        // Create the live element if it doesn't exist yet
        liveEl = createTranscriptBlockElement(liveBlock)
        liveEl.id = LIVE_BLOCK_ID
        container.appendChild(liveEl)
    } else {
        // Update the existing live element text content safely
        liveEl.querySelector('.speaker-name').textContent = liveBlock.personName
        liveEl.querySelector('.block-text').textContent = liveBlock.transcriptTextBuffer
    }

    if (isUserAtBottom) {
        container.scrollTop = container.scrollHeight
    }
}

/**
 * Appends new blocks dynamically and cleans up the live placeholder
 * @param {TranscriptBlock[]} currentTranscriptArray 
 */
function updateTranscriptDOM(currentTranscriptArray) {
    const liveEl = document.getElementById(LIVE_BLOCK_ID)

    // Exclude the live placeholder from our rendered count calculation
    const currentRenderedCount = liveEl ? container.children.length - 1 : container.children.length

    if (currentTranscriptArray.length <= currentRenderedCount) {
        if (currentTranscriptArray.length === 0) container.innerHTML = ''
        return
    }

    const isUserAtBottom =
        (container.scrollHeight - container.scrollTop - container.clientHeight) <= SCROLL_THRESHOLD

    // REMOVE the live placeholder before appending new solid blocks so the new official block takes its correct chronological place.
    if (liveEl) {
        liveEl.remove()
    }

    const fragment = document.createDocumentFragment()
    const newBlocks = currentTranscriptArray.slice(currentRenderedCount)

    newBlocks.forEach(block => {
        const blockEl = createTranscriptBlockElement(block)
        fragment.appendChild(blockEl)
    })

    container.appendChild(fragment)

    if (isUserAtBottom) {
        container.scrollTop = container.scrollHeight
    }
}

function createTranscriptBlockElement(block) {
    const div = document.createElement('div')
    div.className = 'transcript-block'

    div.innerHTML = `
    <div class="block-header">
      <span class="speaker-name"></span>
      <span class="block-time"></span>
    </div>
    <p class="block-text"></p>
  `

    div.querySelector('.speaker-name').textContent = block.personName

    const timeString = new Date(block.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    })
    div.querySelector('.block-time').textContent = timeString
    div.querySelector('.block-text').textContent = block.transcriptText

    return div
}