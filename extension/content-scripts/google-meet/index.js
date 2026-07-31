initGoogleMeet()

function initGoogleMeet() {
    // Attempt to recover last meeting, if any. Abort if it takes more than 15 seconds to prevent current meeting getting messed up.
    Promise.race([
        recoverLastMeeting(),
        new Promise((_, reject) =>
            setTimeout(() => reject({ errorCode: "016", errorMessage: "Recovery timed out" }), 15000)
        )
    ]).catch((error) => {
        const parsedError = /** @type {ErrorObject} */ (error)
        if ((parsedError.errorCode !== "013") && (parsedError.errorCode !== "014")) {
            console.error(parsedError.errorMessage)
        }
    }).finally(() => {
        // Initialise new state for current meeting
        const state = createContentScriptState("Google Meet", "google_meet")
        // Push fresh state to chrome storage
        overWriteChromeStorage(state, ["meetingSoftware", "meetingStartTimestamp", "meetingTitle", "transcript", "chatMessages"], false)

        checkExtensionStatus(state).finally(() => {
            console.log("Extension status " + state.extensionStatusJSON.status)

            // Enable extension functions only if status is 200
            if (state.extensionStatusJSON.status === 200) {
                googleMeetRoutines(state)
            }
            else {
                // Show downtime message as extension status is 400
                showNotificationGoogleMeet(state.extensionStatusJSON)
            }
        })
    })
}

/**
 * @param {ContentScriptState} state
 */
function googleMeetRoutines(state) {
    renderFab()

    // NON CRITICAL DOM DEPENDENCY
    captureUserName(state)

    // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
    waitForElement(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CALL_END).then(() => {
        console.log("Meeting started")
        /** @type {ExtensionMessage} */
        const message = {
            type: "new_meeting_started"
        }
        chrome.runtime.sendMessage(message, function () { })
        state.hasMeetingStarted = true
        // Update meeting startTimestamp
        state.meetingStartTimestamp = new Date().toISOString()
        overWriteChromeStorage(state, ["meetingStartTimestamp"], false)


        //*********** MEETING START ROUTINES **********//
        updateMeetingTitle(state)

        // **** REGISTER TRANSCRIPT AND CHAT MESSAGES LISTENERS **** //

        // REGISTER TRANSCRIPT LISTENER
        // Wait for captions icon to be visible. When user is waiting in meeting lobbing for someone to let them in, the call end icon is visible, but the captions icon is still not visible.
        waitForElement(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CAPTIONS)
            .then(() => {
                // CRITICAL DOM DEPENDENCY
                const captionsButton = selectElements(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CAPTIONS)[0]

                // Click captions icon for non manual operation modes. Async operation.
                chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
                    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                    if (resultSync.operationMode === "manual") {
                        console.log("Manual mode selected, leaving transcript off")
                    }
                    else {
                        captionsButton.click()
                    }
                })

                // Allow DOM to be updated. Once updated, next "then" block will be executed.
                return waitForElement(SELECTORS_GOOGLE_MEET.TRANSCRIPT_REGION)
                    .then(targetNode => (targetNode))
            })
            .then((targetNode) => {
                if (targetNode) {
                    // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
                    state.transcriptTargetNode = targetNode
                    // Initial attach and monitor every 2s
                    startTranscriptMonitor(state)

                    // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
                    chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
                        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                        if (resultSync.operationMode === "manual") {
                            showNotificationGoogleMeet({ status: 400, message: "<strong>TranscripTonic is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
                        }
                        else {
                            showNotificationGoogleMeet(state.extensionStatusJSON)
                        }
                    })
                }
                else {
                    throw new Error("Transcript element not found in DOM")
                }
            })
            .catch((err) => {
                console.error(err)
                state.isTranscriptDomErrorCaptured = true
                showNotificationGoogleMeet(extensionStatusJSON_bug)

                logError(state, "001", err)
            })


        // REGISTER CHAT MESSAGES LISTENER
        // Wait for chat icon to be visible. When user is waiting in meeting lobbing for someone to let them in, the call end icon is visible, but the chat icon is still not visible.
        waitForElement(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CHAT)
            .then(() => {
                const chatMessagesButton = selectElements(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CHAT)[0]
                // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
                chatMessagesButton.click()

                // Allow DOM to be updated. Once updated, next "then" block will be executed.
                return waitForElement(SELECTORS_GOOGLE_MEET.CHAT_LIVE_REGION)
                    .then(targetNode => ({ targetNode, chatMessagesButton }))
            })
            .then(({ targetNode, chatMessagesButton }) => {
                // Click again to close the chat messages 
                chatMessagesButton.click()
                // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
                state.chatMessagesTargetNode = targetNode

                // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
                if (state.chatMessagesTargetNode) {
                    state.chatMessagesObserver = new MutationObserver((mutations) =>
                        chatMessagesMutationCallback(state, mutations)
                    )
                    state.chatMessagesObserver.observe(state.chatMessagesTargetNode, mutationConfig)
                }
                else {
                    throw new Error("Chat messages element not found in DOM")
                }
            })
            .catch((err) => {
                console.error(err)
                state.isChatMessagesDomErrorCaptured = true
                showNotificationGoogleMeet(extensionStatusJSON_bug)

                logError(state, "003", err)
            })

        //*********** MEETING END ROUTINES **********//
        try {
            // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
            selectElements(SELECTORS_GOOGLE_MEET.GOOGLE_SYMBOLS, SELECTORS_GOOGLE_MEET.TEXT_CALL_END)[0].parentElement.parentElement.addEventListener("click", () => {
                // To suppress further errors
                state.hasMeetingEnded = true

                if (state.transcriptObserver) {
                    state.transcriptObserver.disconnect()
                }
                if (state.chatMessagesObserver) {
                    state.chatMessagesObserver.disconnect()
                }

                // Push any data in the buffer variables to the transcript array. Needed to handle one or more speaking when meeting ends.
                pushBufferToTranscript(state)
                // Save to chrome storage and send message to download transcript from background script
                overWriteChromeStorage(state, ["transcript", "chatMessages"], true)

                unmountFab()
            })
        } catch (err) {
            console.error(err)
            showNotificationGoogleMeet(extensionStatusJSON_bug)

            logError(state, "004", err)
        }
    })
}

/**
 * @description Callback function to execute when transcription mutations are observed.
 * @param {ContentScriptState} state
 * @param {MutationRecord[]} mutationsList
 */
function transcriptMutationCallbackGoogleMeet(state, mutationsList) {
    mutationsList.forEach((mutation) => {
        try {
            if (mutation.type === "characterData") {
                const mutationTargetElement = mutation.target.parentElement
                const transcriptUIBlocks = [...mutationTargetElement?.parentElement?.parentElement?.children || []]
                const isLastButSecondElement = transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement ? true : false

                // Pick up only last second element (the last and last but one are non transcript elements), since Meet mutates previous blocks to make minor corrections. Picking them up leads to repetitive transcript blocks in the result.
                if (isLastButSecondElement) {
                    const currentPersonName = mutationTargetElement?.previousSibling?.textContent
                    const currentTranscriptText = mutationTargetElement?.textContent

                    if (currentPersonName && currentTranscriptText) {
                        // Starting fresh in a meeting or resume from no active transcript
                        if (!state.stateTranscriptBlock.mutationTargetElement) {
                            state.stateTranscriptBlock.mutationTargetElement = mutation.target.parentElement
                            state.stateTranscriptBlock.personName = currentPersonName
                            state.stateTranscriptBlock.timestamp = new Date().toISOString()
                            state.stateTranscriptBlock.transcriptTextBuffer = currentTranscriptText
                        }
                        // Some prior transcript buffer exists
                        else {
                            // New person started speaking 
                            if (state.stateTranscriptBlock.mutationTargetElement !== mutation.target.parentElement) {
                                // Push previous person's transcript as a block
                                pushBufferToTranscript(state)

                                // Update stateTranscriptBlock for next mutation and store transcript block timestamp
                                state.stateTranscriptBlock.mutationTargetElement = mutation.target.parentElement
                                state.stateTranscriptBlock.personName = currentPersonName
                                state.stateTranscriptBlock.timestamp = new Date().toISOString()
                                state.stateTranscriptBlock.transcriptTextBuffer = currentTranscriptText
                            }
                            // Same person speaking more
                            else {
                                // When the same person speaks for more than 30 min (approx), Meet drops very long transcript for current person and starts over, which is detected by current transcript string being significantly smaller than the previous one
                                // TO VERIFY IF NEEDED
                                if ((currentTranscriptText.length - state.stateTranscriptBlock.transcriptTextBuffer.length) < -250) {
                                    // Push the long transcript
                                    pushBufferToTranscript(state)

                                    // Store transcript block timestamp for next transcript block of same person
                                    state.stateTranscriptBlock.mutationTargetElement = mutation.target.parentElement
                                    state.stateTranscriptBlock.timestamp = new Date().toISOString()
                                }

                                // Update stateTranscriptBlock for next mutation
                                state.stateTranscriptBlock.transcriptTextBuffer = currentTranscriptText
                            }
                        }
                    }
                    // No people found in transcript DOM
                    else {
                        // No transcript yet or the last person stopped speaking(and no one has started speaking next)
                        console.log("No active transcript")
                        // Push data in the buffer variables to the transcript array
                        pushBufferToTranscript(state)
                        // Update stateTranscriptBlock for the next person in the next mutation
                        state.stateTranscriptBlock.mutationTargetElement = null
                        state.stateTranscriptBlock.personName = ""
                        state.stateTranscriptBlock.transcriptTextBuffer = ""
                    }
                }
            }

            // Rendered by the side panel
            broadcastLiveBuffer(state)
        } catch (err) {
            console.error(err)
            if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) {
                console.log(reportErrorMessage)
                showNotificationGoogleMeet(extensionStatusJSON_bug)

                logError(state, "005", err)
            }
            state.isTranscriptDomErrorCaptured = true
        }
    })
}

/**
 * @description Callback function to execute when chat messages mutations are observed.
 * @param {ContentScriptState} state
 * @param {MutationRecord[]} mutationsList
 */
function chatMessagesMutationCallback(state, mutationsList) {
    mutationsList.forEach(() => {
        try {
            // CRITICAL DOM DEPENDENCY
            const chatMessagesElement = document.querySelector(SELECTORS_GOOGLE_MEET.CHAT_LIVE_REGION)
            // Attempt to parse messages only if at least one message exists
            if (chatMessagesElement && chatMessagesElement.children.length > 0) {
                // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
                const chatMessageElement = chatMessagesElement.lastChild?.firstChild?.firstChild?.lastChild
                // CRITICAL DOM DEPENDENCY
                const personAndTimestampElement = chatMessageElement?.firstChild
                const personName = personAndTimestampElement?.childNodes.length === 1 ? state.userName : personAndTimestampElement?.firstChild?.textContent
                const timestamp = new Date().toISOString()
                // CRITICAL DOM DEPENDENCY
                const chatMessageText = chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild?.textContent

                if (personName && chatMessageText) {
                    /**@type {ChatMessage} */
                    const chatMessageBlock = {
                        "personName": personName,
                        "timestamp": timestamp,
                        "chatMessageText": chatMessageText
                    }

                    // Lot of mutations fire for each message, pick them only once
                    pushUniqueChatBlock(state, chatMessageBlock)
                }
            }
        }
        catch (err) {
            console.error(err)
            if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
                console.log(reportErrorMessage)
                showNotificationGoogleMeet(extensionStatusJSON_bug)

                logError(state, "006", err)
            }
            state.isChatMessagesDomErrorCaptured = true
        }
    })
}

