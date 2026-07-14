// @ts-check
/// <reference path="../../types/chrome.d.ts" />
/// <reference path="../../types/index.js" />

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
        pulseStatus()
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
 * @param {ContentScriptState} state
 */
function pushBufferToTranscript(state) {
    state.transcript.push({
        "personName": state.stateTranscriptBlock.personName === "You" ? state.userName : state.stateTranscriptBlock.personName,
        "timestamp": state.stateTranscriptBlock.timestamp,
        "transcriptText": state.stateTranscriptBlock.transcriptTextBuffer
    })
    overWriteChromeStorage(state, ["transcript"], false)
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

