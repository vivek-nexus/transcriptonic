// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")
  const versionElement = document.querySelector("#version")


  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === undefined) {
        autoModeRadio.checked = true
      }
      else if (resultSync.operationMode === "auto") {
        autoModeRadio.checked = true
      }
      else if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      }

      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })


  lastMeetingTranscriptLink?.addEventListener("click", () => {
    chrome.storage.local.get(["meetings", "meetingStartTimestamp", "meetingStartTimeStamp"], function (resultLocalUntyped) {
      const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

      // Check if user ever attended a meeting
      if (resultLocal.meetingStartTimestamp) {
        if (resultLocal.meetings && (resultLocal.meetings.length > 0)) {

          const meetingToDownload = resultLocal.meetings[resultLocal.meetings.length - 1]

          // Check if last meeting was successfully processed and added to meetings
          if (resultLocal.meetingStartTimestamp === meetingToDownload.meetingStartTimestamp) {
            /** @type {ExtensionMessage} */
            const message = {
              type: "download_transcript_at_index",
              index: resultLocal.meetings.length - 1
            }
            // Silent failure if last meeting is an empty meeting
            chrome.runtime.sendMessage(message, function (responseUntyped) {
              const response = /** @type {Response} */ (responseUntyped)
              console.log(response)
            })
          }
          // Last meeting was not processed for some reason. Need to recover that data, process and download it.
          else {
            /** @type {ExtensionMessage} */
            const message = {
              type: "recover_last_meeting"
            }
            // Silent failure if last meeting is an empty meeting
            chrome.runtime.sendMessage(message, function (responseUntyped) {
              const response = /** @type {Response} */ (responseUntyped)
              console.log(response)
            })
          }
        }
        // First meeting itself ended in a disaster. Need to recover that data, process and download it. Also handle recoveries of versions where "meetingStartTimeStamp" was used, because result.meetings will always be undefined in those versions.
        else {
          chrome.runtime.sendMessage({
            type: "recover_last_meeting",
          }, function (responseUntyped) {
            const response = /** @type {Response} */ (responseUntyped)
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