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

        processTranscript().then(() => {
            chrome.storage.local.get(["recentTranscripts"], function (result) {
                downloadTranscript(result.recentTranscripts.length - 1)
            })
        })
    }
    if (message.type == "download_transcript_at_index") {
        downloadTranscript(message.index) // Download the requested item
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

            processTranscript().then(() => {
                chrome.storage.local.get(["recentTranscripts"], function (result) {
                    downloadTranscript(result.recentTranscripts.length - 1)
                })
            })
        }
    })
})

// Process transcript and chat messages of the meeting that just ended from storage, format them into strings, and save as a new entry in recentTranscripts (keeping last 5)
function processTranscript() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            "userName",
            "transcript",
            "chatMessages",
            "meetingTitle",
            "meetingStartTimeStamp"
        ], function (result) {
            // Format transcript entries into string
            let transcriptString = ""
            if (result.transcript.length > 0) {
                result.transcript.forEach(entry => {
                    const personName = entry.personName === "You" ? result.userName : entry.personName
                    transcriptString += `${personName} (${entry.timeStamp})\n`
                    transcriptString += entry.personTranscript
                    transcriptString += "\n\n"
                })
            }

            // Format chat messages into string
            let chatMessagesString = ""
            if (result.chatMessages.length > 0) {
                result.chatMessages.forEach(entry => {
                    const personName = entry.personName === "You" ? result.userName : entry.personName
                    chatMessagesString += `${personName} (${entry.timeStamp})\n`
                    chatMessagesString += entry.chatMessageText
                    chatMessagesString += "\n\n"
                })
            }

            // Create new transcript entry
            const newTranscriptEntry = {
                meetingTitle: result.meetingTitle || 'Meeting',
                meetingStartTimeStamp: result.meetingStartTimeStamp,
                transcript: transcriptString,
                chatMessages: chatMessagesString
            }

            // Get existing recent transcripts and update
            chrome.storage.local.get(["recentTranscripts"], function (storageData) {
                let recentTranscripts = storageData.recentTranscripts || []
                recentTranscripts.push(newTranscriptEntry)

                // Keep only last 5 transcripts
                if (recentTranscripts.length > 5) {
                    recentTranscripts = recentTranscripts.slice(-5)
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

function downloadTranscript(index) {
    chrome.storage.local.get(["recentTranscripts"], function (result) {
        if (!result.recentTranscripts || !result.recentTranscripts[index]) {
            console.log("No transcript found at index:", index)
            return
        }

        const transcriptEntry = result.recentTranscripts[index]

        // Create file name if values are provided, use default otherwise
        const fileName = transcriptEntry.meetingTitle && transcriptEntry.meetingStartTimeStamp
            ? `TranscripTonic/Transcript-${transcriptEntry.meetingTitle} at ${transcriptEntry.meetingStartTimeStamp}.txt`
            : `TranscripTonic/Transcript.txt`

        // Create an array to store lines of the text file
        const lines = []

        if (transcriptEntry.transcript) {
            lines.push(transcriptEntry.transcript)
            lines.push("") // Add extra newline for file formatting
            lines.push("") // Add extra newline for file formatting
        }

        if (transcriptEntry.chatMessages) {
            lines.push("---------------")
            lines.push("CHAT MESSAGES")
            lines.push("---------------")
            lines.push(transcriptEntry.chatMessages)
            lines.push("") // Add extra newline for file formatting
            lines.push("") // Add extra newline for file formatting
        }

        // Add branding
        lines.push("---------------")
        lines.push("Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)")
        lines.push("---------------")

        // Join the lines into a single string
        const textContent = lines.join("\n")

        // Create a blob containing the text content
        const blob = new Blob([textContent], { type: "text/plain" })

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
                console.log("Transcript downloaded to TranscripTonic directory")
                // Increment anonymous transcript generated count to a Google sheet
                fetch(`https://script.google.com/macros/s/AKfycbwBdD_OLFWXW2DS5n81ToaxhUU3PPDdFYgs_ttxmUtvhUSthKpffxOp9dJFhqSLS14/exec?version=${chrome.runtime.getManifest().version}`, {
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
                fetch(`https://script.google.com/macros/s/AKfycbwBdD_OLFWXW2DS5n81ToaxhUU3PPDdFYgs_ttxmUtvhUSthKpffxOp9dJFhqSLS14/exec?version=${chrome.runtime.getManifest().version}`, {
                    mode: "no-cors"
                })
            })
        }

        // Read the blob and download as text file
        reader.readAsDataURL(blob)
    })
}