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
    chrome.storage.local.get(["meetings", "meetingStartTimestamp", "meetingStartTimeStamp"], function (result) {
      // Check if user ever attended a meeting
      if (result.meetingStartTimestamp) {
        if (result.meetings && (result.meetings.length > 0)) {

          const meetingToDownload = result.meetings[result.meetings.length - 1]

          // Check if last meeting was successfully processed and added to meetings
          if (result.meetingStartTimestamp === meetingToDownload.meetingStartTimestamp) {
            // Silent failure if last meeting is an empty meeting
            chrome.runtime.sendMessage({
              type: "download_transcript_at_index",
              index: result.meetings.length - 1
            }, function (response) {
              console.log(response)
            })
          }
          // Last meeting was not processed for some reason. Need to recover that data, process and download it.
          else {
            // Silent failure if last meeting is an empty meeting
            chrome.runtime.sendMessage({
              type: "recover_last_meeting",
            }, function (response) {
              console.log(response)
            })
          }
        }
        // First meeting itself ended in a disaster. Need to recover that data, process and download it. Also handle recoveries of versions where "meetingStartTimeStamp" was used, because result.meetings will always be undefined in those versions.
        else {
          chrome.runtime.sendMessage({
            type: "recover_last_meeting",
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