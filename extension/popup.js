window.onload = function () {
  const autoModeRadio = document.querySelector('#auto-mode')
  const manualModeRadio = document.querySelector('#manual-mode')
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")

  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined)
      autoModeRadio.checked = true
    else if (result.operationMode == "auto")
      autoModeRadio.checked = true
    else if (result.operationMode == "manual")
      manualModeRadio.checked = true
  })

  autoModeRadio.addEventListener('change', function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { })
  })
  manualModeRadio.addEventListener('change', function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { })
  })
  lastMeetingTranscriptLink.addEventListener("click", () => {
    chrome.storage.local.get(["transcript"], function (result) {
      if (!result.transcript)
        alert("Couldn't find the last meeting's transcript. May be attend one?")
    })
  })
}

downloadTranscript()

function downloadTranscript() {
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")
  // Create an array to store lines of the text file
  const lines = [];
  let transcript = []

  chrome.storage.local.get(["transcript"], function (result) {
    if (result.transcript) {
      transcript = result.transcript
      // Iterate through the transcript array and format each entry
      transcript.forEach(entry => {
        lines.push(entry.personName);
        lines.push(entry.personTranscript);
        lines.push(''); // Add an empty line between entries
      });

      // Join the lines into a single string
      const textContent = lines.join('\n');

      // Create a Blob from the text content
      const blob = new Blob([textContent], { type: 'text/plain' });

      lastMeetingTranscriptLink.href = URL.createObjectURL(blob);
      lastMeetingTranscriptLink.download = `Transcript.txt`;
    }
  })
}
