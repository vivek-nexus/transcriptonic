chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(message.type)
    if (message.type == "save_and_download") {
        chrome.storage.local.set(
            {
                transcript: message.transcript,
                meetingTitle: message.meetingTitle,
                meetingStartTimeStamp: message.meetingStartTimeStamp
            },
            function () {
                console.log("Saved transcript and meta data, downloading now if non empty")
                if (message.transcript.length > 0)
                    downloadTranscript()
            })
    }
    if (message.type == "download") {
        downloadTranscript()
    }
    return true
})

function downloadTranscript() {
    chrome.storage.local.get(["transcript", "meetingTitle", "meetingStartTimeStamp"], function (result) {
        if (result.transcript) {
            // Create file name if values or provided, use default otherwise
            const fileName = result.meetingTitle && result.meetingStartTimeStamp ? `TranscripTonic/Transcript-${result.meetingTitle} at ${result.meetingStartTimeStamp}.txt` : `TranscripTonic/Transcript.txt`

            // Create an array to store lines of the text file
            const lines = []

            // Iterate through the transcript array and format each entry
            result.transcript.forEach(entry => {
                lines.push(`${entry.personName} (${entry.timeStamp})`)
                lines.push(entry.personTranscript)
                lines.push('') // Add an empty line between entries
            })

            // Add branding
            lines.push("---")
            lines.push("Transcript saved using TranscripTonic Chrome extension (https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag)")


            // Join the lines into a single string
            const textContent = lines.join('\n');

            // Create a download with Chrome Download API
            chrome.downloads.download({
                url: 'data:text/plain;base64,' + encodeUnicodeString(textContent),
                filename: fileName,
                conflictAction: 'uniquify'
            }).then(() => {
                console.log("Transcript downloaded to TranscripTonic directory")
            }).catch((error) => {
                console.log(error)
                chrome.downloads.download({
                    url: 'data:text/plain;base64,' + encodeUnicodeString(textContent),
                    filename: "TranscripTonic/Transcript.txt",
                    conflictAction: 'uniquify'
                })
                console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
            })
        }
        else
            console.log("No transcript found")
    })
}

// Thanks to @ifTNT(https://github.com/vivek-nexus/transcriptonic/pull/4)
// Encodes string to UTF 8, before passing non latin unicode character input to btoa()
function encodeUnicodeString(text) {
    const utf8Bytes = new TextEncoder().encode(text)
    const binaryString = String.fromCodePoint(...utf8Bytes)
    return btoa(binaryString)
}
