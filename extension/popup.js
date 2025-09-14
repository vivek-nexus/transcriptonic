// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const enableZoom = document.querySelector("#enable-zoom")


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

  enableZoom?.addEventListener("click", () => {
    chrome.scripting
      .getRegisteredContentScripts()
      .then((scripts) => {
        let isContentZoomRegistered = false
        scripts.forEach((script) => {
          if (script.id === "content-zoom") {
            isContentZoomRegistered = true
            alert("Zoom transcripts are already enabled. Please join Zoom meetings on the browser. Refresh any existing Zoom pages.")
          }
        })

        if (!isContentZoomRegistered) {
          chrome.permissions.request({
            origins: ["https://*.zoom.us/*"],
            permissions: ["notifications"]
          }).then((granted) => {
            if (granted) {
              alert("Zoom transcripts enabled")
            } else {
              alert("Permission denied")
            }
          }).catch((error) => {
            console.error(error)
            alert("Could not enable Zoom transcripts")
          })
        }
      })
  })
}