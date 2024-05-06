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

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { })
  })
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { })
  })
  lastMeetingTranscriptLink.addEventListener("click", () => {
    chrome.storage.local.get(["transcript"], function (result) {
      if (result.transcript)
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response)
        })
      else
        alert("Couldn't find the last meeting's transcript. May be attend one?")
    })
  })
}