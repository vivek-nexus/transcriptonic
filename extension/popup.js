window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
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
    // Unhandled case: if transcript and chatMessages variables in chrome storage are empty, but meetingStartTimestamp is somehow available (dev reload or 0 meetings attended), the button does not do anything
    chrome.storage.local.get(["recentTranscripts", "meetingStartTimestamp"], function (result) {
      if (result.meetingStartTimestamp) {
        if (result.recentTranscripts && (result.recentTranscripts.length > 0)) {

          const transcriptToDownload = result.recentTranscripts[result.recentTranscripts.length - 1]

          // Check if last meeting was successfully processed and added to recentTranscripts
          if (result.meetingStartTimestamp === transcriptToDownload.meetingStartTimestamp) {
            chrome.runtime.sendMessage({
              type: "download_transcript_at_index",
              index: result.recentTranscripts.length - 1
            }, function (response) {
              console.log(response)
            })
          }
          // Last meeting was not processed for some reason. Need to recover that data, process and download it.
          else {
            chrome.runtime.sendMessage({
              type: "recover_last_transcript_and_download",
            }, function (response) {
              console.log(response)
            })
          }
        }
        // First meeting itself ended in a disaster. Need to recover that data, process and download it.
        else {
          chrome.runtime.sendMessage({
            type: "recover_last_transcript_and_download",
          }, function (response) {
            console.log(response)
          })
        }
      }
      else {
        alert("Couldn't find any meeting transcript. May be attend one?")
      }
    })
  })
}