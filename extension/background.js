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
                console.log("Saved transcript and meta data, downloading now")
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
        if (result.transcript && result.transcript.length > 0) {
            const fileName = result.meetingTitle && result.meetingStartTimeStamp ? `Transcripto/Transcript-${result.meetingTitle} at ${result.meetingStartTimeStamp}.txt` : `Transcripto/Transcript.txt`

            // Create an array to store lines of the text file
            const lines = [];

            // Iterate through the transcript array and format each entry
            result.transcript.forEach(entry => {
                lines.push(entry.personName);
                lines.push(entry.personTranscript);
                lines.push(''); // Add an empty line between entries
            });

            lines.push("---")
            lines.push("Transcript saved using Transcripto Chrome extension")

            // Join the lines into a single string
            const textContent = lines.join('\n');

            // Create a Blob from the text content
            const blob = new Blob([textContent], { type: 'text/plain' });

            // Create a download
            // Use Chrome Download API
            chrome.downloads.download({
                url: 'data:text/plain;base64,' + btoa(textContent),
                filename: fileName,
                conflictAction: 'uniquify' // Automatically rename the file if it already exists
            });
            console.log("Transcript downloaded to Transcripto directory")
        }
        else
            console.log("No transcript found")
    })
}