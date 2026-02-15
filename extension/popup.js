// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const enableBeta = document.querySelector("#enable-beta")
  // const notice = document.querySelector("#notice")


  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      }
      else {
        autoModeRadio.checked = true
      }


      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })

  enableBeta?.addEventListener("click", () => {

    /** @type {ExtensionMessage} */
    const message = {
      type: "enable_beta_with_notification",
    }
    chrome.runtime.sendMessage(message, function (responseUntyped) {
      const response = /** @type {ExtensionResponse} */ (responseUntyped)
      if (response.success) {
        if (response.message === "Enabled") {
          alert("Enabled! Join Teams/Zoom meetings on the browser. Refresh any existing Zoom/Teams pages")
        }
        else {
          alert("Already enabled! Go ahead, enjoy your day!")
        }
      }
      else {
        alert(response.message)
      }
    })
  })

  // notice?.addEventListener("click", () => {
  //   alert("The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.")
  // })
}