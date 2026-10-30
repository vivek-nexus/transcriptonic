/** @type {ContentScriptState | null} */
let currentLiveMeetingState = null
let liveSnapshotListenerInstalled = false

/**
 * @description State Factory: Returns a pristine, isolated meeting state block.
 * @param {MeetingSoftware} meetingSoftware
 * @param {Platform} platform
 * @returns {ContentScriptState}
 */
function createContentScriptState(meetingSoftware, platform) {
    /** @type {ContentScriptState} */
    const state = {
        meetingSoftware: meetingSoftware,
        platform: platform,
        userName: "You",
        transcript: [],
        chatMessages: [],
        liveCommentNotes: [],
        stateTranscriptBlock: {
            timestamp: "",
            mutationTargetElement: null,
            personName: "",
            transcriptTextBuffer: "",

        },
        // Left unset until the platform's "meeting started" detection actually confirms
        // the user has joined (see googleMeetRoutines()/teamsMeetingRoutines()/
        // zoomMeetingRoutines()). Stamping "now" here would make renderFab()'s initial
        // storage read (which runs before that detection resolves) start the FAB's live
        // timer immediately — including while still on the pre-join lobby screen.
        meetingStartTimestamp: null,
        meetingTitle: document.title,
        transcriptTargetNode: null,
        transcriptObserver: null,
        chatMessagesTargetNode: null,
        chatMessagesObserver: null,
        isTranscriptDomErrorCaptured: false,
        isChatMessagesDomErrorCaptured: false,
        hasMeetingStarted: false,
        hasMeetingEnded: false,
        zoomIframe: null,
        extensionStatusJSON: {
            status: 200,
            message: "<strong>Tape is running</strong> <br /> Do not turn off captions"
        }
    }
    currentLiveMeetingState = state
    if (!liveSnapshotListenerInstalled) {
        chrome.runtime.onMessage.addListener((message, _sender, respond) => {
            const active = currentLiveMeetingState
            if (message.type === "get_live_snapshot" && active?.hasMeetingStarted && !active.hasMeetingEnded) {
                respond(getLiveSnapshot(active, message.mode))
            }
        })
        liveSnapshotListenerInstalled = true
    }
    return state
}

// Store caption deltas with arrival times: block timestamps alone cannot represent
// a 15-second window when the same speaker talks for several minutes.
/** @type {WeakMap<ContentScriptState, {key: string, text: string, entries: (TranscriptBlock & {blockKey: string, offset: number})[]}>} */
const liveRewindBuffers = new WeakMap()

/** @param {ContentScriptState} state @param {number} [now] */
function trackLiveCaption(state, now = Date.now()) {
    const block = state.stateTranscriptBlock
    const buffer = liveRewindBuffers.get(state) || { key: "", text: "", entries: [] }
    const key = block.personName + "\n" + block.timestamp
    const text = block.transcriptTextBuffer
    let delta = text
    let offset = 0
    if (key === buffer.key) {
        let prefix = 0
        while (prefix < text.length && prefix < buffer.text.length && text[prefix] === buffer.text[prefix]) prefix++
        offset = prefix
        // A caption correction replaces the old suffix, rather than presenting both
        // the incorrect and corrected words as if the speaker said them twice.
        if (prefix < buffer.text.length) {
            buffer.entries = buffer.entries.flatMap(entry => {
                if (entry.blockKey !== key) return [entry]
                const kept = entry.transcriptText.slice(0, Math.max(0, prefix - entry.offset))
                return kept ? [{ ...entry, transcriptText: kept }] : []
            })
        }
        delta = text.slice(prefix)
    }
    if (delta) buffer.entries.push({
        blockKey: key,
        offset,
        personName: block.personName === "You" ? state.userName : block.personName,
        timestamp: new Date(now).toISOString(),
        transcriptText: delta,
    })
    buffer.key = key
    buffer.text = text
    buffer.entries = buffer.entries.filter(entry => Date.parse(entry.timestamp) >= now - 15000)
    liveRewindBuffers.set(state, buffer)
}

/** @param {ContentScriptState} state @param {"rewind" | "recap"} mode @param {number} [now] */
function getLiveSnapshot(state, mode, now = Date.now()) {
    trackLiveCaption(state, now)
    const block = state.stateTranscriptBlock
    /** @type {TranscriptBlock[]} */
    const transcript = []
    if (mode === "rewind") {
        let previousKey = ""
        for (const entry of liveRewindBuffers.get(state)?.entries || []) {
            if (entry.blockKey === previousKey && transcript.length) {
                transcript[transcript.length - 1].transcriptText += entry.transcriptText
            } else {
                transcript.push({ personName: entry.personName, timestamp: entry.timestamp, transcriptText: entry.transcriptText })
            }
            previousKey = entry.blockKey
        }
        for (const entry of transcript) entry.transcriptText = entry.transcriptText.trim()
    } else {
        transcript.push(...state.transcript)
        if (block.transcriptTextBuffer.trim()) transcript.push({
            personName: block.personName === "You" ? state.userName : block.personName,
            timestamp: block.timestamp,
            transcriptText: block.transcriptTextBuffer,
        })
    }
    return {
        meetingSoftware: state.meetingSoftware,
        meetingTitle: state.meetingTitle,
        meetingStartTimestamp: state.meetingStartTimestamp,
        meetingEndTimestamp: new Date(now).toISOString(),
        transcript: transcript.filter(entry => entry.transcriptText.trim()),
        chatMessages: [],
        webhookPostStatus: "new",
    }
}

/**
 * @description Fetches extension status from GitHub and saves to chrome storage. Defaults to 200, if remote server is unavailable.
 * @param {ContentScriptState} state
 */
function checkExtensionStatus(state) {
    return new Promise((resolve, reject) => {
        // Set default value as 200
        state.extensionStatusJSON = {
            status: 200,
            message: state.meetingSoftware ? NOTIFICATION_PLATFORM_CONFIGS[state.platform].notificationText : ""
        }

        // https://stackoverflow.com/a/42518434
        fetch(
            state.meetingSoftware ? NOTIFICATION_PLATFORM_CONFIGS[state.platform].statusUrl : "",
            { cache: "no-store" }
        )
            .then((response) => response.json())
            .then((result) => {
                const minVersion = result.minVersion

                // Disable extension if version is below the min version
                if (!meetsMinVersion(chrome.runtime.getManifest().version, minVersion)) {
                    state.extensionStatusJSON.status = 400
                    state.extensionStatusJSON.message = `<strong>Tape is not running</strong> <br /> Please update to v${minVersion} by following <a href="https://github.com/pawisssh/tape#installation" target="_blank">these instructions</a>`
                }
                else {
                    // Update status based on response
                    state.extensionStatusJSON.status = result.status
                    state.extensionStatusJSON.message = result.message
                    state.extensionStatusJSON.showBetaMessage = (result.showBetaMessage === true)
                }

                console.log("Extension status fetched and saved")
                resolve("Extension status fetched and saved")
            })
            .catch((err) => {
                console.error(err)
                reject("Could not fetch extension status")

                logError(state, "008", err)
            })
    })
}

/**
 * @description Overwrite state to chrome storage
 * @param {ContentScriptState} state
 * @param {Array<"meetingSoftware"  | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages" | "liveCommentNotes">} keys
 * @param {boolean} sendDownloadMessage
 */
function overWriteChromeStorage(state, keys, sendDownloadMessage) {
    const objectToSave = {}
    if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = state.meetingSoftware
    if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle
    if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp
    if (keys.includes("transcript")) objectToSave.transcript = state.transcript
    if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages
    if (keys.includes("liveCommentNotes")) objectToSave.liveCommentNotes = state.liveCommentNotes

    chrome.storage.local.set(objectToSave, function () {
        if (sendDownloadMessage) {
            /** @type {ExtensionMessage} */
            const message = { type: "meeting_ended" }
            chrome.runtime.sendMessage(message, (responseUntyped) => {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                if ((!response.success)) {
                    const parsedError = /** @type {ErrorObject} */ (response.message)
                    if (parsedError.errorCode === "010") {
                        console.error(parsedError.errorMessage)
                    }
                }
            })
        }
    })
}

/**
 * @description Attempts to recover last meeting to the best possible extent.
 */
function recoverLastMeeting() {
    return new Promise((resolve, reject) => {
        /** @type {ExtensionMessage} */
        const message = {
            type: "recover_last_meeting",
        }
        chrome.runtime.sendMessage(message, function (responseUntyped) {
            const response = /** @type {ExtensionResponse} */ (responseUntyped)
            if (response.success) {
                resolve("Last meeting recovered successfully or recovery not needed")
            }
            else {
                reject(response.message)
            }
        })
    })
}

/**
 * @description Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
 * @param {string} selector
 * @param {string | RegExp} [text]
 * @param {HTMLIFrameElement | null} iframe
 */
async function waitForElement(selector, text, iframe = null) {
    // If an iframe is provided, use its content document; otherwise, default to top-level document
    const targetDoc = iframe ? /** @type {Document} */ (iframe.contentDocument) : document

    if (text) {
        // loops for every animation frame change, until the required element is found
        while (!Array.from(targetDoc.querySelectorAll(selector)).find(element => element.textContent === text)) {
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
    }
    else {
        // loops for every animation frame change, until the required element is found
        while (!targetDoc.querySelector(selector)) {
            await new Promise((resolve) => requestAnimationFrame(resolve))
        }
    }
    return targetDoc.querySelector(selector)
}

/**
 * @description Single, flat polling monitor that handles initial attachment and all re-attachments.
 * @param {ContentScriptState} state
 */
function startTranscriptMonitor(state) {
    state.transcriptTargetNode = null
    /**
     * @type {number | undefined}
     */
    let monitorInterval = undefined

    // Call immediately
    transcriptMonitor()
    // Start monitoring
    monitorInterval = setInterval(transcriptMonitor, 2000)

    function transcriptMonitor() {
        if (state.hasMeetingEnded) {
            clearInterval(monitorInterval)
            return
        }

        let activeNode

        switch (state.platform) {
            case "google_meet":
                activeNode = document.querySelector(SELECTORS_GOOGLE_MEET.TRANSCRIPT_REGION)
                break
            case "teams":
                activeNode = document.querySelector(SELECTORS_TEAMS.CAPTIONS_REGION)
                break
            case "zoom":
                const iframe = /** @type {Document} */ (/** @type {HTMLIFrameElement} */(document.querySelector(SELECTORS_ZOOM.IFRAME))?.contentDocument)
                activeNode = iframe.querySelector(SELECTORS_ZOOM.TRANSCRIPT_CONTAINER)
                break
            default:
                break
        }

        if (!activeNode) {
            return
        }

        // If the active node is new, replaced, or disconnected, re-attach the observer
        if (!state.transcriptTargetNode || activeNode !== state.transcriptTargetNode || !state.transcriptTargetNode.isConnected) {
            if (!state.transcriptTargetNode) {
                console.log("Captions region detected. Attaching observer...")
            }
            else if (activeNode !== state.transcriptTargetNode) {
                console.log("Captions region replaced. Re-attaching observer...")
            }

            // Flush any in-flight buffer to prevent losing text on transitions
            pushBufferToTranscript(state)
            state.stateTranscriptBlock.personName = ""
            state.stateTranscriptBlock.transcriptTextBuffer = ""
            state.stateTranscriptBlock.timestamp = ""

            if (state.transcriptObserver) {
                state.transcriptObserver.disconnect()
            }

            state.transcriptTargetNode = activeNode
            state.transcriptObserver = new MutationObserver((mutations) => {
                switch (state.platform) {
                    case "google_meet":
                        transcriptMutationCallbackGoogleMeet(state, mutations)
                        break
                    case "teams":
                        transcriptMutationCallbackTeams(state, mutations)
                        break
                    case "zoom":
                        transcriptMutationCallbackZoom(state, mutations)
                        break
                    default:
                        break
                }
            })
            state.transcriptObserver.observe(activeNode, mutationConfig)

            // If specified, hide the whole transcript node
            chrome.storage.sync.get(["hideCaptions"], function (resultSyncUntyped) {
                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                if ((resultSync.hideCaptions === true) && (state.transcriptTargetNode)) {
                    if (state.platform === "teams") {
                        waitForElement(SELECTORS_TEAMS.CAPTIONS_REGION_WRAPPER).then((element) => {
                            element?.setAttribute("style", `height:40px`)
                        })
                        waitForElement(SELECTORS_TEAMS.CAPTIONS_REGION).then((element) => {
                            element?.setAttribute("style", `opacity:0`)
                        })
                    }
                    else {
                        state.transcriptTargetNode.setAttribute("style", `opacity:0; height:0px`)
                    }
                }
            })
        }
    }
}

/**
 * @param {ContentScriptState} state
 */
function broadcastLiveBuffer(state) {
    trackLiveCaption(state)
    liveMeetingPanel?.refresh()
    /** @type {ExtensionMessage} */
    const message = {
        type: "broadcast_live_buffer",
        stateTranscriptBlock: {
            mutationTargetElement: null,
            personName: state.stateTranscriptBlock.personName,
            timestamp: state.stateTranscriptBlock.timestamp,
            transcriptTextBuffer: state.stateTranscriptBlock.transcriptTextBuffer
        }
    }
    chrome.runtime.sendMessage(message, () => { })
}

/**
 * @param {ContentScriptState} state
 */
function pushBufferToTranscript(state) {
    trackLiveCaption(state)
    if ((state.stateTranscriptBlock.personName !== "") && (state.stateTranscriptBlock.transcriptTextBuffer !== "")) {
        state.transcript.push({
            "personName": state.stateTranscriptBlock.personName === "You" ? state.userName : state.stateTranscriptBlock.personName,
            "timestamp": state.stateTranscriptBlock.timestamp,
            "transcriptText": state.stateTranscriptBlock.transcriptTextBuffer
        })
        overWriteChromeStorage(state, ["transcript"], false)
    }
}

/**
 * @description Waits and grabs meeting title from document title
 * @param {ContentScriptState} state
 */
function updateMeetingTitle(state) {
    setTimeout(() => {
        // NON CRITICAL DOM DEPENDENCY
        state.meetingTitle = document.title
        overWriteChromeStorage(state, ["meetingTitle"], false)
    }, 5000)
}

function pulseStatus() {
    const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `
    /** @type {HTMLDivElement | null}*/
    let activityStatus = document.querySelector(`#tape-status`)
    if (!activityStatus) {
        let html = document.querySelector("html")
        activityStatus = document.createElement("div")
        activityStatus.setAttribute("id", "tape-status")
        activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
        html?.appendChild(activityStatus)
    }
    else {
        activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
    }

    setTimeout(() => {
        activityStatus.style.cssText = `background-color: transparent; ${statusActivityCSS}`
    }, 3000)
}

/** @type {(() => void) | null} */
let fabResizeHandler = null

/** Handle for the FAB's live elapsed-timer interval, shared between renderFab() and unmountFab(). */
let fabTimerIntervalId = null

/**
 * @description Formats elapsed seconds since `startIso` as zero-padded H:MM:SS (e.g. "0:00:23", "1:04:12").
 * @param {string} startIso
 */
function formatElapsedTime(startIso) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000))
    const h = Math.floor(elapsedSeconds / 3600)
    const m = Math.floor((elapsedSeconds % 3600) / 60)
    const s = elapsedSeconds % 60
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0")
    return `${h}:${pad(m)}:${pad(s)}`
}

/**
 * @param {HTMLElement} fab
 * @param {string} startIso
 */
function startFabTimer(fab, startIso) {
    // Every meeting tab's content script resets the shared meetingStartTimestamp to null
    // on load. new Date(null) is the Unix epoch, so ignore it and keep the current timer.
    if (!startIso || Number.isNaN(new Date(startIso).getTime())) return
    if (fabTimerIntervalId) clearInterval(fabTimerIntervalId)
    const timerText = fab.querySelector("#fab-timer-text")
    const tick = () => {
        if (!timerText) return
        timerText.textContent = formatElapsedTime(startIso)
        // The timer grows naturally when the hour gains another digit. Keep a FAB
        // parked at the viewport edge visible when that happens.
        if (fabHasJoined) {
            const rect = fab.getBoundingClientRect()
            if (rect.right > window.innerWidth - 8) fab.style.left = `${Math.max(0, rect.left - (rect.right - window.innerWidth + 8))}px`
        }
    }
    tick()
    fabTimerIntervalId = setInterval(tick, 1000)
}

/**
 * @description Toggles the FAB between its recording and not-recording looks (brand
 * segment color/mark, timer icon, timer text opacity). When switching to not-recording,
 * freezes/stops the live timer at 0:00:00 per the Figma "not record" state.
 * @param {boolean} isRecording
 */
function setFabRecordingState(isRecording) {
    const fab = /** @type {HTMLElement | null} */ (document.querySelector("#tape-fab"))
    if (!fab) return

    const brandSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-brand-segment"))
    const brandMark = /** @type {HTMLImageElement} */ (fab.querySelector("#fab-brand-mark"))
    const timerIcon = /** @type {HTMLImageElement} */ (fab.querySelector("#fab-timer-icon"))
    const timerText = /** @type {HTMLElement} */ (fab.querySelector("#fab-timer-text"))

    if (brandSegment) brandSegment.style.backgroundColor = isRecording ? "#f34f16" : "#a6a6a6"
    if (brandMark) brandMark.src = isRecording ? FAB_BRAND_MARK_URL : FAB_BRAND_MARK_INACTIVE_URL
    if (timerIcon) timerIcon.src = isRecording ? FAB_RECORDING_ICON_URL : FAB_PLAY_ICON_URL
    if (timerText) timerText.style.color = isRecording ? "white" : "rgba(255,255,255,0.38)"

    if (!isRecording) {
        if (fabTimerIntervalId) {
            clearInterval(fabTimerIntervalId)
            fabTimerIntervalId = null
        }
        if (timerText) timerText.textContent = "0:00:00"
    }

    const timerSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-timer-segment"))
    if (timerSegment) {
        if (isRecording) {
            timerSegment.removeAttribute("role")
            timerSegment.removeAttribute("tabindex")
            timerSegment.removeAttribute("aria-label")
            timerSegment.style.cursor = "default"
        }
        else {
            timerSegment.setAttribute("role", "button")
            timerSegment.setAttribute("tabindex", "0")
            timerSegment.setAttribute("aria-label", "Retry starting capture")
            timerSegment.style.cursor = "pointer"
        }
    }
}

/** Guards setFabJoinedState() so the pre-join → joined expand transition only ever
 * fires once — hasMeetingStarted never reverts to false in any platform's state
 * machine, so there's no reverse transition to support. */
let fabHasJoined = false

/**
 * @description One-way transition from the FAB's compact pre-join look (Figma node
 * 2048:28 — just the brand and menu segments) to the full recording look
 * (2043:460). Called once, right where each platform confirms the user has actually
 * joined the meeting (state.hasMeetingStarted = true). Idempotent — a second call is
 * a no-op, mirroring markCaptureFailed()/markCaptureRecovered()'s guard pattern.
 * @param {boolean} hasJoined
 */
function setFabJoinedState(hasJoined) {
    if (!hasJoined || fabHasJoined) return
    fabHasJoined = true

    const fab = /** @type {HTMLElement | null} */ (document.querySelector("#tape-fab"))
    if (!fab) return

    // Keep the FAB's right edge visually anchored while it grows — otherwise a FAB
    // dragged near the right edge of the screen would spill off-screen as its timer,
    // note, Rewind, and Recap segments expand. The FAB's left/top do not animate,
    // so this shift is instant while the interior segments animate.
    const timerText = /** @type {HTMLElement | null} */ (fab.querySelector("#fab-timer-text"))
    const timerContentWidth = timerText?.scrollWidth ? 28 + timerText.scrollWidth : 108
    const widthDelta = (window.innerWidth > 319 ? timerContentWidth + 20 : 0)
        + (window.innerWidth > 399 ? FAB_NOTE_SEGMENT_WIDTH_PX + 16 : 0)
        + (window.innerWidth > 499 ? (FAB_ASSIST_SEGMENT_WIDTH_PX + 16) * 2 : 0)
    const currentLeft = fab.getBoundingClientRect().left
    const expandedFabWidth = fab.offsetWidth + widthDelta
    const maxLeft = Math.max(0, window.innerWidth - expandedFabWidth)
    fab.style.left = `${Math.max(0, Math.min(currentLeft - widthDelta, maxLeft))}px`

    const noteButton = /** @type {HTMLElement} */ (fab.querySelector("#fab-note-button"))
    if (noteButton) {
        noteButton.removeAttribute("aria-hidden")
        noteButton.setAttribute("tabindex", "0")
        noteButton.style.width = `${FAB_NOTE_SEGMENT_WIDTH_PX}px`
        noteButton.style.padding = "8px"
        noteButton.style.opacity = "1"
        noteButton.style.pointerEvents = "auto"
    }

    const timerSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-timer-segment"))
    if (timerSegment) {
        timerSegment.style.maxWidth = "240px"
        timerSegment.style.padding = "8px 12px 8px 8px"
        timerSegment.style.opacity = "1"
        timerSegment.style.pointerEvents = "auto"
    }

    for (const mode of ["rewind", "recap"]) {
        const button = /** @type {HTMLButtonElement | null} */ (fab.querySelector(`#fab-${mode}-button`))
        if (!button) continue
        button.disabled = false
        button.removeAttribute("aria-hidden")
        button.style.width = `${FAB_ASSIST_SEGMENT_WIDTH_PX}px`
        button.style.padding = "8px"
        button.style.opacity = "1"
        button.style.pointerEvents = "auto"
    }

    const brandSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-brand-segment"))
    if (brandSegment) brandSegment.style.borderRightColor = "transparent"

    // Capture hasn't had a chance to fail yet — the FAB's first post-join look is
    // always "recording"; markCaptureFailed() can still flip it to the not-recording
    // look later exactly as before this state existed.
    setFabRecordingState(true)
}

/**
 * @description Marks capture as failed (idempotent) and flips the FAB to its
 * not-recording look. Called both from the ~15s deadline check and from the
 * narrower DOM-race error paths in each platform's caption-attach chain.
 * @param {ContentScriptState} state
 */
function markCaptureFailed(state) {
    if (state.isTranscriptDomErrorCaptured) return
    state.isTranscriptDomErrorCaptured = true
    setFabRecordingState(false)
}

/**
 * @description Marks capture as recovered (idempotent) and flips the FAB back to
 * its recording look. Called once a caption-attach attempt (initial or retried)
 * actually succeeds.
 * @param {ContentScriptState} state
 */
function markCaptureRecovered(state) {
    if (!state.isTranscriptDomErrorCaptured) return
    state.isTranscriptDomErrorCaptured = false
    setFabRecordingState(true)
}

/**
 * @description Schedules the ~15s deadline used to detect the common "auto-record
 * silently never attaches" case, since waitForElement() polls forever and never
 * times out or rejects on its own. If no transcript target node has been found by
 * the deadline, treats capture as failed.
 * @param {ContentScriptState} state
 */
function scheduleCaptureFailureDeadline(state) {
    setTimeout(() => {
        if (!state.transcriptTargetNode && !state.hasMeetingEnded) {
            markCaptureFailed(state)
        }
    }, 15000)
}

/** Content widths used by the joined FAB segments. setFabJoinedState() includes
 * each segment's horizontal padding when anchoring the expanded FAB. */
const FAB_NOTE_SEGMENT_WIDTH_PX = 48
const FAB_ASSIST_SEGMENT_WIDTH_PX = 48

/**
 * @param {() => void} [onRetryCapture] Called when the user clicks/activates the
 * timer segment to manually retry starting capture (only meaningful while the FAB
 * is in its not-recording look — role/tabindex are only exposed then).
 */
function renderFab(onRetryCapture) {
    const responsiveStyle = document.createElement("style")
    responsiveStyle.id = "tape-fab-responsive"
    responsiveStyle.textContent = `
        @media (max-width: 499px) {
            #tape-fab #fab-rewind-button,
            #tape-fab #fab-recap-button { display: none !important; }
        }
        @media (max-width: 399px) {
            #tape-fab #fab-note-button { display: none !important; }
        }
        @media (max-width: 319px) {
            #tape-fab #fab-timer-segment { display: none !important; }
        }
    `
    document.documentElement.appendChild(responsiveStyle)
    const fabCss = `
        position: fixed;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        height: 40px;
        width: auto;
        border-radius: 8px;
        z-index: 100;
        display: flex;
        align-items: center;
        box-shadow: 0px 8px 12px rgba(0,0,0,0.24);
        cursor: grab;
        border: none;
        padding: 0;
        overflow: hidden;
        visibility: hidden;
    `

    const html = document.querySelector("html")
    const fab = document.createElement("div")
    fab.id = "tape-fab"
    fab.title = "Tape"
    fab.style.cssText = fabCss

    // Default look is the pre-join "not yet joined" state (Figma node 2048:28): just
    // the brand segment (light bg, idle dark logo, hairline right divider) and the menu
    // segment. The timer, note, Rewind, and Recap segments start collapsed
    // (zero width/padding/opacity, non-interactive) — setFabJoinedState(true) expands
    // them once the platform's real "meeting started" signal fires. Keeping a single
    // persistent DOM tree (rather than swapping in a second markup tree) lets every
    // existing handler below (click/keydown wiring, setFabRecordingState and startFabTimer)
    // keep targeting these same elements.
    fab.innerHTML = `
        <div id="fab-brand-segment" role="button" tabindex="0" aria-label="Open Tape" style="background-color: #f6f6f6; height: 100%; display: flex; align-items: center; padding: 8px 12px; flex-shrink: 0; cursor: pointer; border-right: 1px solid rgba(0,0,0,0.12); transition: border-color 200ms ease;">
            <img id="fab-brand-mark" src="${FAB_BRAND_MARK_IDLE_URL}" alt="" draggable="false" style="width: 44px; height: 20px; object-fit: contain; display: block;" />
        </div>

        <div id="fab-timer-segment" style="background-color: black; height: 100%; display: flex; align-items: center; gap: 4px; padding: 0; flex-shrink: 0; width: max-content; max-width: 0; opacity: 0; overflow: hidden; pointer-events: none; transition: max-width 240ms ease, padding 240ms ease, opacity 200ms ease;">
            <img id="fab-timer-icon" src="${FAB_RECORDING_ICON_URL}" alt="" draggable="false" style="width: 24px; height: 24px; display: block; flex-shrink: 0;" />
            <span id="fab-timer-text" style="color: white; font-weight: 700; font-size: 20px; line-height: 28px; white-space: nowrap; font-variant-numeric: tabular-nums; display: inline-block; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">0:00:00</span>
        </div>

        <button id="fab-rewind-button" disabled aria-hidden="true" aria-label="Rewind the last 15 seconds" title="Recall the last 15 seconds" style="appearance:none; box-sizing:content-box; height:100%; width:0; margin:0; border:0; border-radius:0; padding:0; background:#f6f6f6; display:flex; align-items:center; justify-content:center; flex-shrink:0; opacity:0; overflow:hidden; pointer-events:none; cursor:pointer; transition:width 240ms ease, padding 240ms ease, opacity 200ms ease;"><img src="${FAB_REWIND_ICON_URL}" alt="" draggable="false" style="width:24px; height:24px; display:block; flex-shrink:0;" /></button>
        <button id="fab-recap-button" disabled aria-hidden="true" aria-label="Recap the meeting so far" title="Summarize the meeting so far" style="appearance:none; box-sizing:content-box; height:100%; width:0; margin:0; border:0; border-radius:0; padding:0; background:#f6f6f6; display:flex; align-items:center; justify-content:center; flex-shrink:0; opacity:0; overflow:hidden; pointer-events:none; cursor:pointer; transition:width 240ms ease, padding 240ms ease, opacity 200ms ease;"><img src="${FAB_RECAP_ICON_URL}" alt="" draggable="false" style="width:24px; height:24px; display:block; flex-shrink:0;" /></button>

        <div id="fab-note-button" role="button" tabindex="-1" aria-hidden="true" aria-label="Add a note" title="Add a note" style="background-color: #f6f6f6; width: 0; height: 100%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0; overflow: hidden; pointer-events: none; cursor: pointer; transition: width 240ms ease, padding 240ms ease, opacity 200ms ease;">
            <img src="${FAB_NOTE_ICON_URL}" alt="" draggable="false" style="width: 24px; height: 24px; display: block; flex-shrink: 0;" />
        </div>

        <div id="fab-menu-button" role="button" tabindex="0" aria-label="Settings" title="Settings" style="background-color: #f6f6f6; width: 48px; height: 100%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 8px; cursor: pointer;">
            <img src="${FAB_MENU_ICON_URL}" alt="" draggable="false" style="width: 24px; height: 24px; display: block;" />
        </div>
    `

    html?.appendChild(fab)
    positionFab(fab)
    makeFabDraggable(fab)
    fabResizeHandler = () => {
        const rect = fab.getBoundingClientRect()
        const position = getFabViewportPosition(rect, window.innerWidth, window.innerHeight)
        fab.style.left = `${position.left}px`
        fab.style.top = `${position.top}px`
    }
    window.addEventListener("resize", fabResizeHandler)

    const brandSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-brand-segment"))
    const timerSegment = /** @type {HTMLElement} */ (fab.querySelector("#fab-timer-segment"))
    const noteButton = /** @type {HTMLElement} */ (fab.querySelector("#fab-note-button"))
    const menuButton = /** @type {HTMLElement} */ (fab.querySelector("#fab-menu-button"))

    function openLivePanel() {
        toggleLiveMeetingPanel(fab)
    }

    for (const mode of ["rewind", "recap"]) {
        const button = /** @type {HTMLButtonElement | null} */ (fab.querySelector(`#fab-${mode}-button`))
        button?.addEventListener("mouseenter", () => { button.style.filter = "brightness(0.95)" })
        button?.addEventListener("mouseleave", () => { button.style.filter = "none" })
        button?.addEventListener("click", (event) => {
            event.stopPropagation()
            toggleLiveMeetingPanel(fab, /** @type {"rewind" | "recap"} */ (mode))
        })
    }

    brandSegment.addEventListener("click", openLivePanel)
    brandSegment.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openLivePanel()
        }
    })

    noteButton.addEventListener("mouseenter", () => { noteButton.style.filter = "brightness(0.95)" })
    noteButton.addEventListener("mouseleave", () => { noteButton.style.filter = "none" })
    noteButton.addEventListener("click", (e) => {
        e.stopPropagation()
        toggleLiveMeetingPanel(fab, "note")
    })
    noteButton.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            toggleLiveMeetingPanel(fab, "note")
        }
    })

    // Only meaningful in the not-recording look (setFabRecordingState toggles the
    // role/tabindex that make this segment focusable) — onRetryCapture itself also
    // no-ops while already recording, via its own isTranscriptDomErrorCaptured guard.
    timerSegment.addEventListener("click", (e) => {
        e.stopPropagation()
        onRetryCapture?.()
    })
    timerSegment.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            onRetryCapture?.()
        }
    })

    // Transcript opens in-page so the same controls work in installed web apps.
    for (const trigger of [brandSegment, ...fab.querySelectorAll("#fab-rewind-button, #fab-recap-button")]) {
        trigger.setAttribute("aria-haspopup", "dialog")
        trigger.setAttribute("aria-controls", "tape-live-panel")
        trigger.setAttribute("aria-expanded", "false")
    }
    menuButton.setAttribute("aria-haspopup", "menu")
    menuButton.setAttribute("aria-controls", "tape-fab-menu")
    menuButton.setAttribute("aria-expanded", "false")
    menuButton.addEventListener("mouseenter", () => { menuButton.style.filter = "brightness(0.95)" })
    menuButton.addEventListener("mouseleave", () => { menuButton.style.filter = "none" })
    menuButton.addEventListener("click", (e) => { e.stopPropagation(); toggleFabMenu(fab) })
    menuButton.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            toggleFabMenu(fab)
        }
    })

    // 1. Initial storage query on load
    chrome.storage.local.get(["meetingStartTimestamp"], (resultUntyped) => {
        const result = /** @type {ResultLocal} */ (resultUntyped)
        if (result.meetingStartTimestamp) startFabTimer(fab, result.meetingStartTimestamp)
    })

    // 2. Storage event listener for ongoing updates
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.meetingStartTimestamp) {
            startFabTimer(fab, changes.meetingStartTimestamp.newValue)
        }
    })
}

/**
 * @description Places the FAB at its last dragged position (persisted in
 * chrome.storage.local as `fabPosition`, clamped in case the viewport has since
 * shrunk), or otherwise converts its default CSS-centered/right-anchored layout
 * position into explicit left/top pixels — done synchronously right after the FAB is
 * appended (before any paint), so there's no visible flash and makeFabDraggable() has
 * a concrete left/top to drag from instead of the default's top:50%/right:8px.
 * @param {HTMLElement} fab
 */
function positionFab(fab) {
    const applyDefaultPosition = () => {
        const rect = fab.getBoundingClientRect()
        fab.style.left = `${rect.left}px`
        fab.style.top = `${rect.top}px`
        fab.style.right = "auto"
        fab.style.transform = "none"
    }

    chrome.storage.local.get(["fabPosition"], (resultUntyped) => {
        const result = /** @type {ResultLocal} */ (resultUntyped)
        const stored = result.fabPosition
        if (stored) {
            const maxLeft = Math.max(0, window.innerWidth - fab.offsetWidth)
            const maxTop = Math.max(0, window.innerHeight - fab.offsetHeight)
            fab.style.left = `${Math.max(0, Math.min(stored.left, maxLeft))}px`
            fab.style.top = `${Math.max(0, Math.min(stored.top, maxTop))}px`
            fab.style.right = "auto"
            fab.style.transform = "none"
        }
        else {
            applyDefaultPosition()
        }
        // Only reveal once positioned — chrome.storage.local.get() is async, so without
        // this the FAB would flash at its default position for a frame before jumping
        // to a restored one. renderFab() mounts it with visibility:hidden for this reason.
        fab.style.visibility = "visible"
    })
}

/**
 * @description Free 2D dragging — the FAB can be moved to any position on screen
 * (previously vertical-only, permanently pinned to the right edge). Tracks both axes
 * from the FAB's actual rendered position (positionFab() has already converted its
 * layout to explicit left/top pixels by the time this attaches), clamps to keep it
 * fully inside the viewport, and persists the dropped position to chrome.storage.local
 * so it's restored (via positionFab()) on the next meeting/reload.
 * @param {HTMLElement} fab
 */
function makeFabDraggable(fab) {
    let isDragging = false
    let startX = 0
    let startY = 0
    let initialLeft = 0
    let initialTop = 0
    let hasMoved = false
    let newLeft = 0
    let newTop = 0

    const onPointerDown = (e) => {
        isDragging = true
        hasMoved = false

        const point = e.touches ? e.touches[0] : e
        startX = point.clientX
        startY = point.clientY
        const rect = fab.getBoundingClientRect()
        initialLeft = rect.left
        initialTop = rect.top
        newLeft = initialLeft
        newTop = initialTop

        // Attach movement listeners to document so fast drags aren't lost
        document.addEventListener("mousemove", onPointerMove)
        document.addEventListener("mouseup", onPointerUp)
        document.addEventListener("touchmove", onPointerMove, { passive: false })
        document.addEventListener("touchend", onPointerUp)
    }

    const onPointerMove = (e) => {
        if (!isDragging) return

        const point = e.touches ? e.touches[0] : e
        const deltaX = point.clientX - startX
        const deltaY = point.clientY - startY

        // Threshold (3px) to differentiate click from drag
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            hasMoved = true
            if (e.cancelable) e.preventDefault() // Prevent scrolling on touch
        }

        // Bound position inside the visible viewport, on both axes
        const maxLeft = window.innerWidth - fab.offsetWidth
        const maxTop = window.innerHeight - fab.offsetHeight
        newLeft = Math.max(0, Math.min(initialLeft + deltaX, maxLeft))
        newTop = Math.max(0, Math.min(initialTop + deltaY, maxTop))

        fab.style.left = `${newLeft}px`
        fab.style.top = `${newTop}px`
    }

    const onPointerUp = () => {
        isDragging = false
        document.removeEventListener("mousemove", onPointerMove)
        document.removeEventListener("mouseup", onPointerUp)
        document.removeEventListener("touchmove", onPointerMove)
        document.removeEventListener("touchend", onPointerUp)

        if (hasMoved) {
            chrome.storage.local.set({ fabPosition: { left: newLeft, top: newTop } })
        }
    }

    fab.addEventListener("mousedown", onPointerDown)
    fab.addEventListener("touchstart", onPointerDown, { passive: true })

    // Block the 'click' event if the user dragged the button
    fab.addEventListener("click", (e) => {
        if (hasMoved) {
            e.stopImmediatePropagation()
            e.preventDefault()
            hasMoved = false
        }
    }, true) // Capture phase ensures it runs before the side-panel click handler
}

function unmountFab() {
    if (fabResizeHandler) window.removeEventListener("resize", fabResizeHandler)
    fabResizeHandler = null
    liveMeetingPanel?.destroy()
    liveMeetingPanel = null
    fabMenu?.destroy()
    fabMenu = null
    currentLiveMeetingState = null
    document.querySelector("#tape-fab-responsive")?.remove()
    if (fabTimerIntervalId) {
        clearInterval(fabTimerIntervalId)
        fabTimerIntervalId = null
    }
    // Teams re-injects into the same page (module scope persists) for back-to-back
    // meetings in one tab, without a full reload — reset the one-way join-transition
    // guard so the next meeting's FAB starts pre-join again instead of skipping
    // straight to the recording look because setFabJoinedState() already fired once.
    fabHasJoined = false
    const fab = document.querySelector("#tape-fab")
    if (fab) {
        fab.remove()
    }
}

/**
   * @description Logs active transcript to console
   * @param {ContentScriptState} state
   */
function logTranscriptToConsole(state) {
    if (state.stateTranscriptBlock.transcriptTextBuffer.length > 125) {
        console.log(state.stateTranscriptBlock.transcriptTextBuffer.slice(0, 50) + "   ...   " + state.stateTranscriptBlock.transcriptTextBuffer.slice(-50))
    }
    else {
        console.log(state.stateTranscriptBlock.transcriptTextBuffer)
    }
}

/**
   * @description Logs anonymous errors to a Google sheet for swift debugging
   * @param {ContentScriptState} state
   * @param {string} code
   * @param {any} err
   */
function logError(state, code, err) {
    fetch(`${LOG_ERROR_SCRIPT_URL}?version=${chrome.runtime.getManifest().version}&code=${code}&error=${encodeURIComponent(err)}&meetingSoftware=${state.meetingSoftware}`, { mode: "no-cors" })
}

/**
   * @description Checks if the installed extension version meets the minimum required version.
   * @param {string} oldVer
   * @param {string} newVer
   */
function meetsMinVersion(oldVer, newVer) {
    const oldParts = oldVer.split('.')
    const newParts = newVer.split('.')
    for (var i = 0; i < newParts.length; i++) {
        const a = ~~newParts[i] // parse int
        const b = ~~oldParts[i] // parse int
        if (a > b) return false
        if (a < b) return true
    }
    return true
}
