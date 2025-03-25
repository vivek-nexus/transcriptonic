const timeFormat = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(message.type)

    if (message.type == "new_meeting_started") {
        // Saving current tab id, to download transcript when this tab is closed
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0].id
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        })
    }

    if (message.type == "meeting_ended") {
        // Invalidate tab id since transcript is downloaded, prevents double downloading of transcript from tab closed event listener
        chrome.storage.local.set({ meetingTabId: null }, function () {
            console.log("Meeting tab id cleared")
        })
        downloadAndPostWebhook()

    }

    if (message.type == "download_transcript_at_index") {
        // Download the requested item
        downloadTranscript(message.index, false)
    }

    if (message.type == "retry_webhook_at_index") {
        // Handle webhook retry
        postTranscriptToWebhook(message.index)
            .then(() => {
                sendResponse({ success: true })
            })
            .catch(error => {
                console.error("Webhook retry failed:", error)
                sendResponse({ success: false, error: error.message })
            })
    }

    if (message.type == "recover_last_transcript_and_download") {
        downloadAndPostWebhook()
    }
    return true
})

// Download transcript if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabid) {
    chrome.storage.local.get(["meetingTabId"], function (data) {
        if (tabid == data.meetingTabId) {
            console.log("Successfully intercepted tab close")

            // Clearing meetingTabId to prevent misfires of onRemoved until next meeting actually starts
            chrome.storage.local.set({ meetingTabId: null }, function () {
                console.log("Meeting tab id cleared for next meeting")
            })

            downloadAndPostWebhook()
        }
    })
})

// Download transcripts, post webhook if URL is enabled and available 
function downloadAndPostWebhook() {
    chrome.storage.local.get(["transcript", "chatMessages"], function (resultLocal) {
        if ((resultLocal.transcript != "") || (resultLocal.chatMessages != "")) {
            processTranscript().then(() => {
                chrome.storage.local.get(["recentTranscripts"], function (resultLocal) {
                    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting"], function (resultSync) {
                        // Download the last transcript
                        const lastIndex = resultLocal.recentTranscripts.length - 1
                        downloadTranscript(lastIndex, (resultSync.webhookUrl && resultSync.autoPostWebhookAfterMeeting) ? true : false)

                        // Post the last transcript to webhook if auto-post is enabled and available
                        if (resultSync.autoPostWebhookAfterMeeting && resultSync.webhookUrl) {
                            postTranscriptToWebhook(lastIndex).catch(error => {
                                console.error("Webhook post failed:", error)
                            })
                        }
                    })
                })
            })
        }
    })
}

// Process transcript and chat messages of the meeting that just ended from storage, format them into strings, and save as a new entry in recentTranscripts (keeping last 10)
function processTranscript() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            "userName",
            "transcript",
            "chatMessages",
            "meetingTitle",
            "meetingStartTimestamp"
        ], function (result) {
            // Format transcript entries into string
            let transcriptString = ""
            if (result.transcript.length > 0) {
                result.transcript.forEach(transcriptBlock => {
                    const personName = transcriptBlock.personName === "You" ? result.userName : transcriptBlock.personName
                    transcriptString += `${personName} (${transcriptBlock.timestamp})\n`
                    transcriptString += transcriptBlock.personTranscript
                    transcriptString += "\n\n"
                })
            }

            // Format chat messages into string
            let chatMessagesString = ""
            if (result.chatMessages.length > 0) {
                result.chatMessages.forEach(chatBlock => {
                    const personName = chatBlock.personName === "You" ? result.userName : chatBlock.personName
                    chatMessagesString += `${personName} (${chatBlock.timestamp})\n`
                    chatMessagesString += chatBlock.chatMessageText
                    chatMessagesString += "\n\n"
                })
            }

            // Create new transcript entry
            const newTranscriptEntry = {
                meetingTitle: result.meetingTitle || "Google Meet call",
                meetingStartTimestamp: result.meetingStartTimestamp,
                meetingEndTimestamp: Date.now(),
                transcript: transcriptString,
                chatMessages: chatMessagesString,
                webhookPostStatus: "new"
            }

            // Get existing recent transcripts and update
            chrome.storage.local.get(["recentTranscripts"], function (storageData) {
                let recentTranscripts = storageData.recentTranscripts || []
                recentTranscripts.push(newTranscriptEntry)

                // Keep only last 10 transcripts
                if (recentTranscripts.length > 10) {
                    recentTranscripts = recentTranscripts.slice(-10)
                }

                // Save updated recent transcripts
                chrome.storage.local.set({ recentTranscripts: recentTranscripts }, function () {
                    console.log("Recent transcripts updated")
                    resolve()
                })
            })
        })
    })
}



function downloadTranscript(index, webhookEnabled) {
    chrome.storage.local.get(["recentTranscripts"], function (result) {
        if (result.recentTranscripts && result.recentTranscripts[index]) {
            const transcript = result.recentTranscripts[index]

            // Sanitise meeting title to prevent invalid file name errors
            // https://stackoverflow.com/a/78675894
            const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
            const sanitisedMeetingTitle = transcript.meetingTitle.replaceAll(invalidFilenameRegex, "_")

            // Format timestamp for human-readable filename
            const timestamp = new Date(transcript.meetingStartTimestamp)
            const formattedTimestamp = timestamp.toLocaleString("default", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }).replace(/[\/:]/g, "-")

            const fileName = `TranscripTonic/Transcript-${sanitisedMeetingTitle} at ${formattedTimestamp}.txt`

            // Format transcript content
            let content = transcript.transcript
            content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
            content += transcript.chatMessages

            // Add branding
            content += "\n\n---------------\n"
            content += "Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)"
            content += "\n---------------"

            const blob = new Blob([content], { type: "text/plain" })

            // Read the blob as a data URL
            const reader = new FileReader()

            // Download once blob is read
            reader.onload = function (event) {
                const dataUrl = event.target.result

                // Create a download with Chrome Download API
                chrome.downloads.download({
                    url: dataUrl,
                    filename: fileName,
                    conflictAction: "uniquify"
                }).then(() => {
                    console.log("Transcript downloaded")
                    // Increment anonymous transcript generated count to a Google sheet
                    fetch(`https://script.google.com/macros/s/AKfycbzUk-q3N8_BWjwE90g9HXs5im1pYFriydKi1m9FoxEmMrWhK8afrHSmYnwYcw6AkH14eg/exec?version=${chrome.runtime.getManifest().version}&webhookEnabled=${webhookEnabled}`, {
                        mode: "no-cors"
                    })
                }).catch((err) => {
                    console.error(err)
                    chrome.downloads.download({
                        url: dataUrl,
                        filename: "TranscripTonic/Transcript.txt",
                        conflictAction: "uniquify"
                    })
                    console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
                    // Logs anonymous errors to a Google sheet for swift debugging   
                    fetch(`https://script.google.com/macros/s/AKfycbxiyQSDmJuC2onXL7pKjXgELK1vA3aLGZL5_BLjzCp7fMoQ8opTzJBNfEHQX_QIzZ-j4Q/exec?version=${chrome.runtime.getManifest().version}&code=009&error=${encodeURIComponent(err)}`, { mode: "no-cors" })
                    // Increment anonymous transcript generated count to a Google sheet
                    fetch(`https://script.google.com/macros/s/AKfycbzUk-q3N8_BWjwE90g9HXs5im1pYFriydKi1m9FoxEmMrWhK8afrHSmYnwYcw6AkH14eg/exec?version=${chrome.runtime.getManifest().version}&webhookEnabled=${webhookEnabled}`, {
                        mode: "no-cors"
                    })
                })
            }

            // Read the blob and download as text file
            reader.readAsDataURL(blob)
        }
    })
}

// Post transcript to webhook
function postTranscriptToWebhook(index) {
    return new Promise((resolve, reject) => {
        // Get webhook URL and recent transcripts
        chrome.storage.local.get(["recentTranscripts"], function (resultLocal) {
            chrome.storage.sync.get(["webhookUrl"], function (resultSync) {
                if (!resultSync.webhookUrl) {
                    reject(new Error("No webhook URL configured"))
                    return
                }

                if (!resultLocal.recentTranscripts || !resultLocal.recentTranscripts[index]) {
                    reject(new Error("Transcript not found"))
                    return
                }

                const transcript = resultLocal.recentTranscripts[index]
                // LocaleString included for no-code automation consumption and ISO timestamp included for code consumption
                const webhookData = {
                    meetingTitle: transcript.meetingTitle,
                    meetingStartTimestampLocaleString: new Date(transcript.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                    meetingStartTimestampISOString: new Date(transcript.meetingStartTimestamp).toISOString(),
                    meetingEndTimestampLocaleString: new Date(transcript.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
                    meetingEndTimestampISOString: new Date(transcript.meetingEndTimestamp).toISOString(),
                    transcript: transcript.transcript,
                    chatMessages: transcript.chatMessages
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
                        throw new Error("Webhook request failed")
                    }
                }).then(() => {
                    // Update success status
                    resultLocal.recentTranscripts[index].webhookPostStatus = "successful"
                    chrome.storage.local.set({ recentTranscripts: resultLocal.recentTranscripts }, function () {
                        resolve()
                    })
                }).catch(error => {
                    console.error(error)
                    // Update failure status
                    resultLocal.recentTranscripts[index].webhookPostStatus = "failed"
                    chrome.storage.local.set({ recentTranscripts: resultLocal.recentTranscripts }, function () {
                        // Create notification and open webhooks page
                        chrome.notifications.create({
                            type: "basic",
                            iconUrl: "icon.png",
                            title: "Could not post webhook",
                            message: "Click to view status and retry or check URL"
                        }, function (notificationId) {
                            // Handle notification click
                            chrome.notifications.onClicked.addListener(function (clickedNotificationId) {
                                if (clickedNotificationId === notificationId) {
                                    chrome.tabs.create({ url: "webhooks.html" })
                                }
                            })
                        })

                        reject(error)
                    })
                })
            })
        })
    })
}