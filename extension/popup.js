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

  enableBeta?.addEventListener("click", () => {
    chrome.permissions.request({
      origins: ["https://*.zoom.us/*", "https://teams.live.com/*", "https://teams.microsoft.com/*"],
      permissions: ["notifications"]
    }).then((granted) => {
      if (granted) {
        /** @type {ExtensionMessage} */
        const message = {
          type: "register_content_scripts",
        }
        chrome.runtime.sendMessage(message, (responseUntyped) => {
          const response = /** @type {ExtensionResponse} */ (responseUntyped)
          // Prevent alert as well as notification from background script
          if (response.success) {
            if (response.message !== "Zoom and Teams content scripts registered") {
              alert("Already enabled! Go ahead, enjoy your day!")
            }
          }
          else {
            console.error(response.message)
            alert("Failed to enable. Please try again.")
          }
        })
      }
      else {
        alert("Permission denied")
      }
    }).catch((error) => {
      console.error(error)
      alert("Could not enable Zoom and Teams transcripts")
    })
  })

  // notice?.addEventListener("click", () => {
  //   alert("The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.")
  // })
}