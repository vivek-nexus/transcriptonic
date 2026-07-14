/**
 * @description Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the parents.
 * @param {string} selector
 * @param {string | RegExp} text
 */
function selectElements(selector, text) {
    var elements = document.querySelectorAll(selector)
    return Array.prototype.filter.call(elements, function (element) {
        return RegExp(text).test(element.textContent)
    })
}

/**
 * @description Shows a responsive notification of specified type and message
 * @param {ExtensionStatusJSON} extensionStatusJSON
 */
function showNotificationGoogleMeet(extensionStatusJSON) {
    // Banner CSS
    let html = document.querySelector("html")
    let obj = document.createElement("div")
    let logo = document.createElement("img")
    let text = document.createElement("p")

    logo.setAttribute(
        "src",
        LOGO_URL
    )
    logo.setAttribute("height", "32px")
    logo.setAttribute("width", "32px")
    logo.style.cssText = "border-radius: 4px"

    // Remove banner after 5s
    setTimeout(() => {
        obj.style.display = "none"
    }, 5000)

    if (extensionStatusJSON.status === 200) {
        obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
    }
    else {
        obj.style.cssText = `color: orange; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
    }

    obj.prepend(text)
    obj.prepend(logo)
    if (html)
        html.append(obj)
}

/**
 * @description Grabs updated meeting title, if available
 * @param {ContentScriptState} state
 */
function updateMeetingTitleGoogleMeet(state) {
    waitForElement(SELECTORS_GOOGLE_MEET.MEETING_TITLE).then((element) => {
        const meetingTitleElement = /** @type {HTMLDivElement} */ (element)
        meetingTitleElement?.setAttribute("contenteditable", "true")
        meetingTitleElement.title = "Edit meeting title for TranscripTonic"
        meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`

        meetingTitleElement?.addEventListener("input", handleMeetingTitleElementChange)

        // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
        setTimeout(() => {
            handleMeetingTitleElementChange()
            if (location.pathname === `/${meetingTitleElement.innerText}`) {
                showNotification({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
            }
        }, 7000)

        function handleMeetingTitleElementChange() {
            state.meetingTitle = meetingTitleElement.innerText
            overWriteChromeStorage(state, ["meetingTitle"], false)
        }
    })
}

/**
 * @description Attempt to get username before meeting starts. Abort interval if valid username is found or if meeting starts and default to "You"
 * @param {ContentScriptState} state
 */
function captureUserName(state) {
    waitForElement(SELECTORS_GOOGLE_MEET.USER_NAME).then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
            if (!state.hasMeetingStarted) {
                const capturedUserName = document.querySelector(SELECTORS_GOOGLE_MEET.USER_NAME)?.textContent
                if (capturedUserName) {
                    state.userName = capturedUserName
                    clearInterval(captureUserNameInterval)
                }
            }
            else {
                clearInterval(captureUserNameInterval)
            }
        }, 100)
    })
}

/**
 * @description Pushes object to array only if it doesn't already exist.
 * @param {ContentScriptState} state
 * @param {ChatMessage} chatBlock
 */
function pushUniqueChatBlock(state, chatBlock) {
    const isExisting = state.chatMessages.some(item =>
        (item.personName === chatBlock.personName) &&
        (item.chatMessageText === chatBlock.chatMessageText)
    )
    if (!isExisting) {
        console.log(chatBlock)
        state.chatMessages.push(chatBlock)
        overWriteChromeStorage(state, ["chatMessages"], false)
    }
}

// Re attaches the transcript observer. Used at startup and whenever Meet replaces the captions region (CC toggle / language change).
/** 
 * @param {ContentScriptState} state
 * @param {Element} node 
*/
function handleTranscriptObserver(state, node) {
    // Flush any in-flight buffer so text captured before the discontinuity is preserved and not merged with the post-reattach captions.

    if ((state.stateTranscriptBlock.personName !== "") && (state.buffer.transcriptTextBuffer !== "")) {
        pushBufferToTranscript(state)
    }
    state.stateTranscriptBlock.personName = ""
    state.stateTranscriptBlock.transcriptTextBuffer = ""
    state.stateTranscriptBlock.timestamp = ""

    if (state.transcriptObserver) {
        state.transcriptObserver.disconnect()
    }
    state.transcriptTargetNode = node
    state.transcriptObserver = new MutationObserver((mutations) => transcriptMutationCallback(state, mutations))
    state.transcriptObserver.observe(node, mutationConfig)

    // Meet detaches/replaces the captions region when the user toggles CC off/on (and sometimes on caption language change). Poll for that case and re-attach, otherwise the observer goes silent for the rest of the meeting.
    const captionsReattachInterval = setInterval(() => {
        if (state.hasMeetingEnded) {
            clearInterval(captionsReattachInterval)
            return
        }
        const currentNode = document.querySelector(SELECTORS_GOOGLE_MEET.TRANSCRIPT_REGION)
        if (!currentNode) {
            return
        }
        if (!state.transcriptTargetNode || currentNode !== state.transcriptTargetNode || !state.transcriptTargetNode.isConnected) {
            console.log("TranscripTonic: captions region replaced, re-attaching observer")
            handleTranscriptObserver(state, currentNode)
        }
    }, 2000)
}