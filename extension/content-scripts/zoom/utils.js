// @ts-check
/// <reference path="../../../types/chrome.d.ts" />
/// <reference path="../../../types/index.js" />

/**
   * @param {HTMLIFrameElement} iframe
   * @returns {Promise<boolean>}
   */
function hasIframeLoaded(iframe) {
    return new Promise((resolve) => {
        if (iframe.contentDocument?.readyState) {
            resolve(true)
        }
        else {
            iframe?.addEventListener("load", () => {
                resolve(true)
            })
        }
    })
}

/**
   * @description Shows a responsive notification of specified type and message
   * @param {ExtensionStatusJSON} extensionStatusJSON
   */
function showNotificationZoom(extensionStatusJSON) {
    const iframe = /** @type {HTMLIFrameElement} */ (document.querySelector(SELECTORS_ZOOM.IFRAME))
    const iframeDOM = iframe.contentDocument

    if (iframeDOM) {
        // Banner CSS
        let html = iframeDOM.querySelector("html")
        let obj = iframeDOM.createElement("div")
        let logo = iframeDOM.createElement("img")
        let text = iframeDOM.createElement("p")

        logo.setAttribute(
            "src",
            "https://ejnana.github.io/transcripto-status/icon.png"
        )
        logo.setAttribute("height", "32px")
        logo.setAttribute("width", "32px")
        logo.style.cssText = "border-radius: 4px"
        text.style.cssText = "margin-top: 1rem; margin-bottom:1rem"

        if (extensionStatusJSON.status === 200) {
            obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
            text.innerHTML = extensionStatusJSON.message

            // Remove banner once transcript is on
            waitForElement(SELECTORS_ZOOM.TRANSCRIPT_CONTAINER, undefined, iframe).then(() => {
                obj.style.display = "none"
            })
        }
        else {
            obj.style.cssText = `color: orange; ${commonCSS}`
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
}

/**
   * @description Find person name using various strategies
   * @param {ChildNode} currentTranscriptBlock
   * @param {Document | null | undefined} iframeDOM
   */
function getPersonName(currentTranscriptBlock, iframeDOM) {
    const currentPersonElement =  /** @type {HTMLElement | null} */ (currentTranscriptBlock.firstChild)
    let currentPersonName = ""

    if (currentPersonElement?.tagName === "IMG") {
        // @ts-ignore
        const avatarSrc = currentPersonElement.src
        const avatarElements = iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)
        // Check if another image of same src exists on the page and grab name from the video tile
        if (avatarElements && avatarElements.length > 1) {
            currentPersonName = /** @type {string} */ (iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)[0]?.parentElement?.nextSibling?.textContent)
            // Store avatarSrc and name in local storage for future meetings
            localStorage.setItem(avatarSrc, currentPersonName)
        }
        // Try to read if avatarSrc and name is available in local storage 
        else {
            if (localStorage.getItem(avatarSrc)) {
                currentPersonName = /** @type {string} */ (localStorage.getItem(avatarSrc))
            }
            // Generate a 10 digit constant hash from image url
            else {
                getAvatarIdentifier(avatarSrc).then((hash) => {
                    currentPersonName = "Person " + hash
                    return currentPersonName
                })
            }
        }
    }
    else {
        currentPersonName = /** @type {string} */ (currentPersonElement?.textContent)
    }

    return currentPersonName
}

/**
   * @param {string | undefined} url
   */
function getAvatarIdentifier(url) {
    return new Promise((resolve, reject) => {
        // Check if the URL is valid
        if (!url || typeof url !== 'string') {
            reject("invalid_url")
        }

        try {
            // Encode the URL into a buffer
            const msgUint8 = new TextEncoder().encode(url)

            // Hash the URL using SHA-256
            crypto.subtle.digest('SHA-256', msgUint8).then((hashBuffer) => {
                // Convert the hash buffer to a hexadecimal string
                const hashArray = Array.from(new Uint8Array(hashBuffer))
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

                // Return the first 10 characters of the hash as the identifier
                resolve(hashHex.substring(0, 10))
            })
        } catch (error) {
            console.error('Error hashing URL:', error)
            reject("hashing_error")
        }
    })
}

/**
   * @description Finds the new part of string2 that has been added relative to string1.
   * @param {string} string1 The original string.
   * @param {string} string2 The modified string.
   * @returns {string} The new part of the string, or string2 if no common part is found.
   */
function findNewPart(string1, string2) {
    // Scenario 1: string2 has characters added to the end.
    if (string2.startsWith(string1)) {
        return string2.substring(string1.length)
    }

    // Scenario 2: string2 has been truncated at the beginning and has a new part at the end.
    let tempString1 = string1
    while (tempString1.length > 0) {
        if (string2.startsWith(tempString1)) {
            return string2.substring(tempString1.length)
        }
        // Chop off one character from the beginning of the temporary string for next loop iteration
        tempString1 = tempString1.substring(1)
    }

    // No common suffix and prefix between the two strings. So the second string must be entirely new.
    return string2
}