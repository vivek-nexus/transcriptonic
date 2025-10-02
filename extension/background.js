// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

/** @type {Intl.DateTimeFormatOptions} */
const timeFormat = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
}


chrome.runtime.onMessage.addListener(function (messageUnTyped, sender, sendResponse) {
    const message = /** @type {ExtensionMessage} */ (messageUnTyped)
    console.log(message.type)

    if (message.type === "new_meeting_started") {
        // Saving current tab id, to download transcript when this tab is closed
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0].id
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        })
    }

    if (message.type === "meeting_ended") {
        processLastMeeting()
            .then(() => {
                /** @type {ExtensionResponse} */
                const response = { success: true }
                sendResponse(response)
            })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)

                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
            .finally(() => {
                // Invalidate tab id since transcript is downloaded, prevents double downloading of transcript from tab closed event listener
                clearTabIdAndApplyUpdate()
            })
    }

    if (message.type === "download_transcript_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Download the requested item
            downloadTranscript(message.index, false)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010
                    const parsedError = /** @type {ErrorObject} */ (error)

                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "retry_webhook_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Handle webhook retry
            postTranscriptToWebhook(message.index)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch(error => {
                    // Fails with error codes: 009, 010, 011, 012
                    const parsedError = /** @type {ErrorObject} */ (error)

                    console.error("Webhook retry failed:", parsedError)
                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "recover_last_meeting") {
        recoverLastMeeting().then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)

                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }
    return true
})

// Download last meeting if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    chrome.storage.local.get(["meetingTabId"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

        if (tabId === resultLocal.meetingTabId) {
            console.log("Successfully intercepted tab close")

            processLastMeeting().finally(() => {
                // Clearing meetingTabId to prevent misfires of onRemoved until next meeting actually starts
                clearTabIdAndApplyUpdate()
            })
        }
    })
})

// Listen for extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
    // Check if there is an active meeting
    chrome.storage.local.get(["meetingTabId"], function (resultUntyped) {
        const result = /** @type {ResultLocal} */ (resultUntyped)

        if (result.meetingTabId) {
            // There is an active meeting, defer the update
            chrome.storage.local.set({ isDeferredUpdatedAvailable: true }, function () {
                console.log("Deferred update flag set")
            })
        } else {
            // No active meeting, apply the update immediately. Meeting tab id is invalidated only post meeting operations are done, so no race conditions.
            console.log("No active meeting, applying update immediately")
            chrome.runtime.reload()
        }
    })
})

// Download transcripts, post webhook if URL is enabled and available
// Fails if transcript is empty or webhook request fails or if no meetings in storage
/** @throws error codes: 009, 010, 011, 012, 013, 014 */
function processLastMeeting() {
    return new Promise((resolve, reject) => {
        pickupLastMeetingFromStorage()
            .then(() => {
                chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                    const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting"], function (resultSyncUntyped) {
                        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                        // Create an array of promises to execute in parallel
                        /** @type {Promise<any>[]} */
                        const promises = []

                        // Meeting index to download and post webhook
                        // @ts-ignore - Because this line exists in the resolved promise from pickupLastMeetingFromStorage, which clearly means that at least one meeting exists and resultLocal.meetings cannot be undefined.
                        const lastIndex = resultLocal.meetings.length - 1

                        // Promise to download transcript
                        promises.push(
                            downloadTranscript(
                                lastIndex,
                                // Just for anonymous analytics
                                resultSync.webhookUrl && resultSync.autoPostWebhookAfterMeeting ? true : false
                            )
                        )

                        // Promise to post webhook if enabled
                        if (resultSync.autoPostWebhookAfterMeeting && resultSync.webhookUrl) {
                            promises.push(postTranscriptToWebhook(lastIndex))
                        }

                        // Execute all promises in parallel
                        Promise.all(promises)
                            .then(() => {
                                resolve("Meeting processing and download/webhook posting complete")
                            })
                            .catch(error => {
                                // Fails with error codes: 009, 010, 011, 012
                                const parsedError = /** @type {ErrorObject} */ (error)
                                console.error("Operation failed:", parsedError.errorMessage)
                                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                            })
                    })
                })
            })
            .catch((error) => {
                // Fails with error codes: 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)
                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
            })
    })
}

/**
 * @throws error codes: 013, 014
 */
// Process transcript and chat messages of the meeting that just ended from storage, format them into strings, and save as a new entry in meetings (keeping last 10)
function pickupLastMeetingFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([
            "meetingSoftware",
            "meetingTitle",
            "meetingStartTimestamp",
            "transcript",
            "chatMessages",
        ], function (resultUntyped) {
            const result = /** @type {ResultLocal} */ (resultUntyped)

            if (result.meetingStartTimestamp) {
                if ((result.transcript.length > 0) || (result.chatMessages.length > 0)) {
                    // Create new transcript entry
                    /** @type {Meeting} */
                    const newMeetingEntry = {
                        meetingSoftware: result.meetingSoftware ? result.meetingSoftware : "",
                        meetingTitle: result.meetingTitle,
                        meetingStartTimestamp: result.meetingStartTimestamp,
                        meetingEndTimestamp: new Date().toISOString(),
                        transcript: result.transcript,
                        chatMessages: result.chatMessages,
                        webhookPostStatus: "new"
                    }

                    // Get existing recent meetings and add the new meeting
                    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                        let meetings = resultLocal.meetings || []
                        meetings.push(newMeetingEntry)

                        // Keep only last 10 transcripts
                        if (meetings.length > 10) {
                            meetings = meetings.slice(-10)
                        }

                        // Save updated recent transcripts
                        chrome.storage.local.set({ meetings: meetings }, function () {
                            console.log("Last meeting picked up")
                            resolve("Last meeting picked up")
                        })
                    })
                }
                else {
                    reject({ errorCode: "014", errorMessage: "Empty transcript and empty chatMessages" })
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}



/**
 * @param {number} index
 * @param {boolean} isWebhookEnabled
 * @throws error codes: 009, 010
 */
function downloadTranscript(index, isWebhookEnabled) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.meetings && resultLocal.meetings[index]) {
                const meeting = resultLocal.meetings[index]

                // Sanitise meeting title to prevent invalid file name errors
                // https://stackoverflow.com/a/78675894
                const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
                let sanitisedMeetingTitle = "Meeting"
                if (meeting.meetingTitle) {
                    sanitisedMeetingTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
                }
                else if (meeting.title) {
                    sanitisedMeetingTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
                }

                // Format timestamp for human-readable filename and sanitise to prevent invalid filenames
                const timestamp = new Date(meeting.meetingStartTimestamp)
                const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[\/:]/g, "-")

                const prefix = meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"

                const fileName = `TranscripTonic/${prefix}-${sanitisedMeetingTitle} at ${formattedTimestamp} on.txt`


                // Format transcript and chatMessages content
                let content = getTranscriptString(meeting.transcript)
                content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
                content += getChatMessagesString(meeting.chatMessages)

                // Add branding
                content += "\n\n---------------\n"
                content += "Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)"
                content += "\n---------------"

                if (isFirefox()) {
                    // Firefox: use message passing to meetings.html for download
                    sendDownloadToMeetingsPage(fileName, content, resolve, reject);
                } else {
                    // Chrome: use downloads API
                    const blob = new Blob([content], { type: "text/plain" })

                    // Read the blob as a data URL
                    const reader = new FileReader()

                    // Read the blob
                    reader.readAsDataURL(blob)

                    // Download as text file, once blob is read
                    reader.onload = function (event) {
                        if (event.target?.result) {
                            const dataUrl = event.target.result

                            // Create a download with Chrome Download API
                            chrome.downloads.download({
                                // @ts-ignore
                                url: dataUrl,
                                filename: fileName,
                                conflictAction: "uniquify"
                            }).then(() => {
                                console.log("Transcript downloaded")
                                resolve("Transcript downloaded successfully")

                                // Increment anonymous transcript generated count to a Google sheet
                                fetch(`https://script.google.com/macros/s/AKfycbxgUPDKDfreh2JIs8pIC-9AyQJxq1lx9Q1qI2SVBjJRvXQrYCPD2jjnBVQmds2mYeD5nA/exec?version=${chrome.runtime.getManifest().version}&isWebhookEnabled=${isWebhookEnabled}&meetingSoftware=${meeting.meetingSoftware}`, {
                                    mode: "no-cors"
                                })
                            }).catch((err) => {
                                console.error(err)
                                chrome.downloads.download({
                                    // @ts-ignore
                                    url: dataUrl,
                                    filename: "TranscripTonic/Transcript.txt",
                                    conflictAction: "uniquify"
                                })
                                console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
                                resolve("Transcript downloaded successfully with default file name")

                                // Logs anonymous errors to a Google sheet for swift debugging   
                                fetch(`https://script.google.com/macros/s/AKfycbwN-bVkVv3YX4qvrEVwG9oSup0eEd3R22kgKahsQ3bCTzlXfRuaiO7sUVzH9ONfhL4wbA/exec?version=${chrome.runtime.getManifest().version}&code=009&error=${encodeURIComponent(err)}&meetingSoftware=${meeting.meetingSoftware}`, { mode: "no-cors" })

                                // Increment anonymous transcript generated count to a Google sheet
                                fetch(`https://script.google.com/macros/s/AKfycbxgUPDKDfreh2JIs8pIC-9AyQJxq1lx9Q1qI2SVBjJRvXQrYCPD2jjnBVQmds2mYeD5nA/exec?version=${chrome.runtime.getManifest().version}&isWebhookEnabled=${isWebhookEnabled}&meetingSoftware=${meeting.meetingSoftware}`, {
                                    mode: "no-cors"
                                })
                            })
                        }
                        else {
                            reject({ errorCode: "009", errorMessage: "Failed to read blob" })
                        }
                    }
                }
            }
            else {
                reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
            }
        })
    })
}

/**
 * @param {number} index
 * @throws error code: 010, 011, 012
 */
function postTranscriptToWebhook(index) {
    return new Promise((resolve, reject) => {
        // Get webhook URL and meetings
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            chrome.storage.sync.get(["webhookUrl", "webhookBodyType"], function (resultSyncUntyped) {
                const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                if (resultSync.webhookUrl) {
                    if (resultLocal.meetings && resultLocal.meetings[index]) {
                        const meeting = resultLocal.meetings[index]

                        /** @type {WebhookBody} */
                        let webhookData
                        if (resultSync.webhookBodyType === "advanced") {
                            webhookData = {
                                webhookBodyType: "advanced",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
                                transcript: meeting.transcript,
                                chatMessages: meeting.chatMessages
                            }
                        }
                        else {
                            webhookData = {
                                webhookBodyType: "simple",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                                transcript: getTranscriptString(meeting.transcript),
                                chatMessages: getChatMessagesString(meeting.chatMessages)
                            }
                        }

                        // Post to webhook
                        fetch(resultSync.webhookUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(webhookData)
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error(`Webhook request failed with HTTP status code ${response.status} ${response.statusText}`)
                            }
                        }).then(() => {
                            // Update success status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "successful"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                resolve("Webhook posted successfully")
                            })
                        }).catch(error => {
                            // Update failure status.
                            // @ts-ignore - Pointless type error about resultLocal.meetings being undefined, which is already checked above.
                            resultLocal.meetings[index].webhookPostStatus = "failed"
                            chrome.storage.local.set({ meetings: resultLocal.meetings }, function () {
                                // Notify user of webhook failure
                                chrome.notifications.create({
                                    type: "basic",
                                    iconUrl: "icon.png",
                                    title: "Could not post webhook!",
                                    message: `Webhook failed: ${error && error.message ? error.message : error}`
                                }, function (notificationId) {
                                    chrome.notifications.onClicked.addListener(function (clickedNotificationId) {
                                        if (clickedNotificationId === notificationId) {
                                            chrome.tabs.create({ url: "meetings.html" })
                                        }
                                    })
                                })
                                reject({ errorCode: "011", errorMessage: error })
                            })
                        })
                    }
                    else {
                        reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
                    }
                }
                else {
                    reject({ errorCode: "012", errorMessage: "No webhook URL configured" })
                }
            })
        })
    })
}


/**
 * Format transcript entries into string
 * @param {TranscriptBlock[] | []} transcript
 */
function getTranscriptString(transcript) {
    let transcriptString = ""
    if (transcript.length > 0) {
        transcript.forEach(transcriptBlock => {
            transcriptString += `${transcriptBlock.personName} (${new Date(transcriptBlock.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n`
            transcriptString += transcriptBlock.transcriptText
            transcriptString += "\n\n"
        })
        return transcriptString
    }
    return transcriptString
}


/**
 * Format chat messages into string
 * @param {ChatMessage[] | []} chatMessages
 */
function getChatMessagesString(chatMessages) {
    let chatMessagesString = ""
    if (chatMessages.length > 0) {
        chatMessages.forEach(chatMessage => {
            chatMessagesString += `${chatMessage.personName} (${new Date(chatMessage.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n`
            chatMessagesString += chatMessage.chatMessageText
            chatMessagesString += "\n\n"
        })
    }
    return chatMessagesString
}

function clearTabIdAndApplyUpdate() {
    chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting")

        // Check if there's a deferred update
        chrome.storage.local.get(["isDeferredUpdatedAvailable"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.isDeferredUpdatedAvailable) {
                console.log("Applying deferred update")
                chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, function () {
                    chrome.runtime.reload()
                })
            }
        })
    })
}

/** @throws error codes: 009, 010, 011, 012, 013, 014 */
function recoverLastMeeting() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings", "meetingStartTimestamp"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            // Check if user ever attended a meeting
            if (resultLocal.meetingStartTimestamp) {
                /** @type {Meeting | undefined} */
                let lastSavedMeeting
                if ((resultLocal.meetings) && (resultLocal.meetings.length > 0)) {
                    lastSavedMeeting = resultLocal.meetings[resultLocal.meetings.length - 1]
                }

                // Last meeting was not processed for some reason. Need to recover that data, process and download it.
                if ((!lastSavedMeeting) || (resultLocal.meetingStartTimestamp !== lastSavedMeeting.meetingStartTimestamp)) {
                    processLastMeeting().then(() => {
                        resolve("Recovered last meeting to the best possible extent")
                    }).catch((error) => {
                        // Fails with error codes: 009, 010, 011, 013, 014
                        const parsedError = /** @type {ErrorObject} */ (error)
                        reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                    })
                }
                else {
                    resolve("No recovery needed")
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}

function isFirefox() {
    // @ts-ignore - browser is a Firefox-specific global
    return typeof browser !== 'undefined' && /firefox/i.test(navigator.userAgent);
}

/**
 * Firefox-compatible download handler that sends blob to meetings.html
 * @param {string} fileName 
 * @param {string} content 
 * @param {Function} resolve 
 * @param {Function} reject 
 */
function sendDownloadToMeetingsPage(fileName, content, resolve, reject) {
    // Find or open meetings.html, then send the download message
    chrome.tabs.query({}, function (tabs) {
        let meetingsTab = tabs.find(tab => tab.url && tab.url.includes('meetings.html'));
        if (meetingsTab && meetingsTab.id) {
            chrome.tabs.update(meetingsTab.id, { active: true }, function () {
                if (meetingsTab.id) {
                    chrome.tabs.sendMessage(
                        meetingsTab.id,
                        {
                            type: "download_transcript_blob",
                            fileName: fileName,
                            blobContent: content
                        },
                        function (response) {
                            if (response && response.success) {
                                resolve("Transcript downloaded successfully (Firefox)");
                            } else {
                                reject(new Error("Failed to trigger download in Firefox (meetings.html)"));
                            }
                        }
                    );
                }
            });
        } else {
            // Open meetings.html in a new tab
            chrome.tabs.create({ url: chrome.runtime.getURL('meetings.html'), active: true }, function (newTab) {
                // Wait for the tab to load, then send the message
                const listener = function (tabId, changeInfo) {
                    if (tabId === newTab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        if (newTab.id) {
                            chrome.tabs.sendMessage(
                                newTab.id,
                                {
                                    type: "download_transcript_blob",
                                    fileName: fileName,
                                    blobContent: content
                                },
                                function (response) {
                                    if (response && response.success) {
                                        resolve("Transcript downloaded successfully (Firefox)");
                                    } else {
                                        reject(new Error("Failed to trigger download in Firefox (new meetings.html)"));
                                    }
                                }
                            );
                        }
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        }
    });
}