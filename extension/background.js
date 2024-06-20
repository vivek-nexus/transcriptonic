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
    if (message.type == "download") {
        // Invalidate tab id since transcript is downloaded, prevents double downloading of transcript from tab closed event listener
        chrome.storage.local.set({ meetingTabId: null }, function () {
            console.log("Meeting tab id cleared")
        })
        downloadTranscript()
    }
    return true
})

// Download transcript if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabid) {
    chrome.storage.local.get(["meetingTabId"], function (data) {
        if (tabid == data.meetingTabId) {
            console.log("Successfully intercepted tab close")
            downloadTranscript()
            // Clearing meetingTabId to prevent misfires of onRemoved until next meeting actually starts
            chrome.storage.local.set({ meetingTabId: null }, function () {
                console.log("Meeting tab id cleared for next meeting")
            })
        }
    })
})

function downloadTranscript() {
    chrome.storage.local.get(["userName", "transcript", "chatMessages", "meetingTitle", "meetingStartTimeStamp"], function (result) {
        if (result.userName && result.transcript && result.chatMessages) {
            // Create file name if values or provided, use default otherwise
            const fileName = result.meetingTitle && result.meetingStartTimeStamp ? `TranscripTonic/Transcript-${result.meetingTitle} at ${result.meetingStartTimeStamp}.txt` : `TranscripTonic/Transcript.txt`

            // Create an array to store lines of the text file
            const lines = []

            // Iterate through the transcript array and format each entry
            result.transcript.forEach(entry => {
                lines.push(`${entry.personName} (${entry.timeStamp})`)
                lines.push(entry.personTranscript)
                // Add an empty line between entries
                lines.push("")
            })
            lines.push("")
            lines.push("")

            if (result.chatMessages.length > 0) {
                // Iterate through the chat messages array and format each entry
                lines.push("---------------")
                lines.push("CHAT MESSAGES")
                lines.push("---------------")
                result.chatMessages.forEach(entry => {
                    lines.push(`${entry.personName} (${entry.timeStamp})`)
                    lines.push(entry.chatMessageText)
                    // Add an empty line between entries
                    lines.push("")
                })
                lines.push("")
                lines.push("")
            }

            // Add branding
            lines.push("---------------")
            lines.push("Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)")
            lines.push("---------------")


            // Join the lines into a single string, replace "You" with userName from storage
            const textContent = lines.join("\n").replace(/You \(/g, result.userName + " (")

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
                }).catch((error) => {
                    console.log(error)
                    chrome.downloads.download({
                        url: dataUrl,
                        filename: "TranscripTonic/Transcript.txt",
                        conflictAction: "uniquify"
                    })
                    console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
                })
            }

            // Read the blob and download as text file
            reader.readAsDataURL(blob)
        }
        else
            console.log("No transcript found")
    })
}