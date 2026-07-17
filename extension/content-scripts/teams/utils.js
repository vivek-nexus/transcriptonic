// @ts-check
/// <reference path="../../../types/chrome.d.ts" />
/// <reference path="../../../types/index.js" />

/**
   * @description Shows a responsive notification of specified type and message
   * @param {ContentScriptState} state
   * @param {ExtensionStatusJSON} extensionStatusJSON
   */
function showNotificationTeams(state, extensionStatusJSON) {
    // Banner CSS
    let html = document.querySelector("html")
    let obj = document.createElement("div")
    let logo = document.createElement("img")
    let text = document.createElement("p")

    logo.setAttribute(
        "src",
        "https://ejnana.github.io/transcripto-status/icon.png"
    )
    logo.setAttribute("height", "32px")
    logo.setAttribute("width", "32px")
    logo.style.cssText = "border-radius: 4px"
    text.style.cssText = "margin-top: 1rem; margin-bottom:1rem; font-size: medium"

    if (extensionStatusJSON.status === 200) {
        obj.style.cssText = getCommonCSS(state.platform, extensionStatusJSON.status)
        text.innerHTML = extensionStatusJSON.message

        // Remove banner once transcript is on
        waitForElement(`[data-tid="closed-caption-renderer-wrapper"]`).then(() => {
            obj.style.display = "none"
        })
    }
    else {
        obj.style.cssText = getCommonCSS(state.platform, extensionStatusJSON.status)
        text.innerHTML = extensionStatusJSON.message

        setTimeout(() => {
            obj.style.display = "none"
        }, 5000)
    }

    obj.prepend(text)
    obj.prepend(logo)
    if (html)
        html.append(obj)
}

function dispatchLiveCaptionsShortcut() {
    let key, code, modifiers

    // Mac: Command+Shift+A
    key = 'a'
    code = 'KeyA'
    modifiers = { metaKey: true, shiftKey: true, bubbles: true }

    let event = new KeyboardEvent('keydown', {
        key: key,
        code: code,
        ...modifiers
    })
    document.dispatchEvent(event)

    // Windows: Alt+Shift+C (defaulting non-Mac to Windows)
    key = 'c'
    code = 'KeyC'
    modifiers = { altKey: true, shiftKey: true, bubbles: true }

    event = new KeyboardEvent('keydown', {
        key: key,
        code: code,
        ...modifiers
    })
    document.dispatchEvent(event)
}