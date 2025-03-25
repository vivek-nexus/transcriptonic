window.onload = function () {
  const autoModeRadio = document.querySelector('#auto-mode')
  const manualModeRadio = document.querySelector('#manual-mode')
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")

  document.querySelector("#version").innerHTML = `v${chrome.runtime.getManifest().version}`

  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined)
      autoModeRadio.checked = true
    else if (result.operationMode == "auto")
      autoModeRadio.checked = true
    else if (result.operationMode == "manual")
      manualModeRadio.checked = true
  })

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { })
  })
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { })
  })
  lastMeetingTranscriptLink.addEventListener("click", () => {
    chrome.storage.local.get(["recentTranscripts"], function (result) {
      if (result.recentTranscripts && (result.recentTranscripts.length > 0)) {
        const transcriptToDownload = result.recentTranscripts[result.recentTranscripts.length - 1]

        if ((transcriptToDownload.transcript != "") || (transcriptToDownload.chatMessages != "")) {
          chrome.runtime.sendMessage({
            type: "download_transcript_at_index",
            index: result.recentTranscripts.length - 1
          }, function (response) {
            console.log(response)
          })
        }
        else {
          alert("Last meeting transcript is empty :(")
        }
      }
      else {
        alert("Couldn't find the last meeting's transcript. May be attend one?")
      }
    })
  })
}