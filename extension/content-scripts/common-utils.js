/**
 * @description State Factory: Returns a pristine, isolated meeting state block.
 * @param {MeetingSoftware} meetingSoftware
 * @param {Platform} platform
 * @returns {ContentScriptState}
 */
function createContentScriptState(meetingSoftware, platform) {
    return {
        meetingSoftware: meetingSoftware,
        platform: platform,
        userName: "You",
        transcript: [],
        chatMessages: [],
        stateTranscriptBlock: {
            timestamp: "",
            mutationTargetElement: null,
            personName: "",
            transcriptTextBuffer: "",

        },
        meetingStartTimestamp: new Date().toISOString(),
        meetingTitle: document.title,
        transcriptTargetNode: null,
        transcriptObserver: null,
        chatMessagesTargetNode: null,
        chatMessagesObserver: null,
        isTranscriptDomErrorCaptured: false,
        isChatMessagesDomErrorCaptured: false,
        hasMeetingStarted: false,
        hasMeetingEnded: false,
        extensionStatusJSON: {
            status: 200,
            message: "<strong>TranscripTonic is running</strong> <br /> Do not turn off captions"
        }
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
                    state.extensionStatusJSON.message = `<strong>TranscripTonic is not running</strong> <br /> Please update to v${minVersion} by following <a href="https://github.com/vivek-nexus/transcriptonic/wiki/Manually-update-TranscripTonic" target="_blank">these instructions</a>`
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
 * @param {Array<"meetingSoftware"  | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages">} keys
 * @param {boolean} sendDownloadMessage
 */
function overWriteChromeStorage(state, keys, sendDownloadMessage) {
    const objectToSave = {}
    if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = state.meetingSoftware
    if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle
    if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp
    if (keys.includes("transcript")) objectToSave.transcript = state.transcript
    if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages

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
 * @description Waits until an element matching the selector has the specified computed CSS property value.
 * @param {string} selector - The selector to query (e.g., 'div[role="region"]')
 * @param {string} cssProp - The camelCase or kebab-case CSS property (e.g., 'containerName')
 * @param {string} cssPropValue - The expected value of the CSS property (e.g., 'captions-history')
 */
async function waitForElementByStyle(selector, cssProp, cssPropValue) {
    while (true) {
        const elements = Array.from(document.querySelectorAll(selector))
        const matchedElement = elements.find(element => {
            const computedStyle = window.getComputedStyle(element)
            // Cast the string to a valid key type of CSSStyleDeclaration to satisfy the compiler
            return computedStyle[/** @type {keyof CSSStyleDeclaration} */ (cssProp)] === cssPropValue
        })

        if (matchedElement) {
            return matchedElement
        }

        await new Promise((resolve) => requestAnimationFrame(resolve))
    }
}

/** 
 * @description Single, flat polling monitor that handles initial attachment and all re-attachments.
 * @param {ContentScriptState} state
 */
function startTranscriptMonitor(state) {
    state.transcriptTargetNode = null

    // Call immediately
    transcriptMonitor()
    // Start monitoring
    const monitorInterval = setInterval(transcriptMonitor, 2000)

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
    let activityStatus = document.querySelector(`#transcriptonic-status`)
    if (!activityStatus) {
        let html = document.querySelector("html")
        activityStatus = document.createElement("div")
        activityStatus.setAttribute("id", "transcriptonic-status")
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

function renderFab() {
    const fabCss = `position: fixed;
    top: 50%;
    bottom: 50%;
    right: 8px;
    height: 36px;
    width: 36px;
    border-radius: 36px;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #071f29;
    box-shadow: 0px 0px 4px 0px #2A9ACA;
    cursor: pointer;
    border: none;
  `

    let html = document.querySelector("html")
    const fab = document.createElement("button")
    fab.id = "transcriptonic-fab"
    fab.ariaLabel = "TranscripTonic"
    fab.title = "TranscripTonic"
    fab.style.cssText = `${fabCss}`
    fab.innerHTML = `
        <img src="https://ejnana.github.io/transcripto-status/icon.png" alt="TranscripTonic floating action button" draggable="false" style="width: 20px; height: 20px; object-fit: contain;" />
    `
    html?.appendChild(fab)
    makeVerticallyDraggable(fab)

    fab.addEventListener("click", () => {
        /** @type {ExtensionMessage} */
        const message = { type: "open_side_panel" }
        chrome.runtime.sendMessage(message, () => { })
    })
}

/**
 * @param {HTMLButtonElement} fab
 */
function makeVerticallyDraggable(fab) {
    let isDragging = false
    let startY = 0
    let initialTop = 0
    let hasMoved = false

    const onPointerDown = (e) => {
        isDragging = true
        hasMoved = false

        const clientY = e.touches ? e.touches[0].clientY : e.clientY
        startY = clientY
        initialTop = fab.getBoundingClientRect().top

        // Attach movement listeners to document so fast drags aren't lost
        document.addEventListener("mousemove", onPointerMove)
        document.addEventListener("mouseup", onPointerUp)
        document.addEventListener("touchmove", onPointerMove, { passive: false })
        document.addEventListener("touchend", onPointerUp)
    }

    const onPointerMove = (e) => {
        if (!isDragging) return

        const clientY = e.touches ? e.touches[0].clientY : e.clientY
        const deltaY = clientY - startY

        // Threshold (3px) to differentiate click from drag
        if (Math.abs(deltaY) > 3) {
            hasMoved = true
            if (e.cancelable) e.preventDefault() // Prevent scrolling on touch
        }

        let newTop = initialTop + deltaY

        // Bound vertical position inside the visible viewport
        const maxTop = window.innerHeight - fab.offsetHeight
        newTop = Math.max(0, Math.min(newTop, maxTop))

        fab.style.top = `${newTop}px`
    }

    const onPointerUp = () => {
        isDragging = false
        document.removeEventListener("mousemove", onPointerMove)
        document.removeEventListener("mouseup", onPointerUp)
        document.removeEventListener("touchmove", onPointerMove)
        document.removeEventListener("touchend", onPointerUp)
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
    const fab = document.querySelector("#transcriptonic-fab")
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
