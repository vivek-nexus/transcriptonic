// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

let isMainRunning = false

setInterval(() => {
  // Use a regular expression to match the URL pattern
  const urlPattern = /^https:\/\/app\.zoom\.us\/wc\/\d+\/.+$/
  const isUrlMatching = urlPattern.test(location.href)

  // If on the URL and main is not running, call main
  if (isUrlMatching && !isMainRunning) {
    main()
    isMainRunning = true
  }
  // Main already running on the right URL, don't do anything
  else if (isUrlMatching && isMainRunning) {
    return
  }
  // Not the right URL, so reset main for next visit
  else {
    isMainRunning = false
  }
}, 2000)


function main() {

  //*********** GLOBAL VARIABLES **********//
  /** @type {ExtensionStatusJSON} */
  const extensionStatusJSON_bug = {
    "status": 400,
    "message": `<strong>TranscripTonic encountered a new error</strong> <br /> Please report it <a href="https://github.com/vivek-nexus/transcriptonic/issues" target="_blank">here</a>.`
  }

  const reportErrorMessage = "There is a bug in TranscripTonic. Please report it at https://github.com/vivek-nexus/transcriptonic/issues"
  /** @type {MutationObserverInit} */
  const mutationConfig = { childList: true, attributes: true, subtree: true, characterData: true }

  // Name of the person attending the meeting
  let userName = "You"

  // Transcript array that holds one or more transcript blocks
  /** @type {TranscriptBlock[]} */
  let transcript = []

  // Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
  let personNameBuffer = "", transcriptTextBuffer = "", timestampBuffer = ""

  // Chat messages array that holds one or more chat messages of the meeting
  /** @type {ChatMessage[]} */
  let chatMessages = []

  // Capture meeting start timestamp, stored in ISO format
  let meetingStartTimestamp = new Date().toISOString()
  let meetingTitle = document.title

  // Capture invalid transcript and chatMessages DOM element error for the first time and silence for the rest of the meeting to prevent notification noise
  let isTranscriptDomErrorCaptured = false
  let isChatMessagesDomErrorCaptured = false

  // Capture meeting begin to abort userName capturing interval
  let hasMeetingStarted = false

  // Capture meeting end to suppress any errors
  let hasMeetingEnded = false

  /** @type {ExtensionStatusJSON} */
  let extensionStatusJSON





  // Attempt to recover last meeting, if any. Abort if it takes more than 2 seconds to prevent current meeting getting messed up.
  Promise.race([
    recoverLastMeeting(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Recovery timed out')), 2000)
    )
  ]).
    catch((error) => {
      console.error(error)
    }).
    finally(() => {
      // Save current meeting data to chrome storage once recovery is complete or is aborted
      overWriteChromeStorage(["meetingStartTimestamp", "meetingTitle", "transcript", "chatMessages"], false)
    })




  //*********** MAIN FUNCTIONS **********//
  checkExtensionStatus().finally(() => {
    console.log("Extension status " + extensionStatusJSON.status)

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status === 200) {

      meetingRoutines()
    }
    else {
      // Show downtime message as extension status is 400
      showNotification(extensionStatusJSON)
    }
  })



  function meetingRoutines() {
    waitForElement(document, "#webclient").then(() => {
      console.log(`Found iframe`)
      const iframe = /** @type {HTMLIFrameElement | null} */ (document.querySelector("#webclient"))

      iframe && hasIframeLoaded(iframe).then(() => {
        console.log("Iframe loaded")
        const iframeDOM = iframe.contentDocument

        // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
        iframeDOM && waitForElement(iframeDOM, "#audioOptionMenu").then(() => {
          console.log("Meeting started")
          /** @type {ExtensionMessage} */
          const message = {
            type: "new_meeting_started"
          }
          chrome.runtime.sendMessage(message, function () { })
          hasMeetingStarted = true
          // Update meeting startTimestamp
          meetingStartTimestamp = new Date().toISOString()
          overWriteChromeStorage(["meetingStartTimestamp"], false)

          //*********** MEETING START ROUTINES **********//
          updateMeetingTitle()

          /** @type {MutationObserver} */
          let transcriptObserver

          // **** REGISTER TRANSCRIPT LISTENER **** //
          // Wait for transcript node to be visible. When user is waiting in meeting lobbing for someone to let them in, the call end icon is visible, but the captions icon is still not visible.
          waitForElement(iframeDOM, ".live-transcription-subtitle__box").then(() => {
            console.log("Found captions container")
            // CRITICAL DOM DEPENDENCY. Grab the transcript element.
            let transcriptTargetNode = iframeDOM?.querySelector(`.live-transcription-subtitle__box`)

            if (transcriptTargetNode) {
              console.log("Registering mutation observer on .live-transcription-subtitle__box")

              // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
              transcriptObserver = new MutationObserver(transcriptMutationCallback)

              // Start observing the transcript element and chat messages element for configured mutations
              transcriptObserver.observe(transcriptTargetNode, mutationConfig)
            }
            else {
              throw new Error("Transcript element not found in DOM")
            }
          })
            .catch((err) => {
              console.error(err)
              isTranscriptDomErrorCaptured = true
              showNotification(extensionStatusJSON_bug)

              logError("001", err)
            })

          // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
          if (!isTranscriptDomErrorCaptured) {
            showNotification(extensionStatusJSON)
          }

          //*********** MEETING END ROUTINES **********//
          try {
            // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
            selectElements(iframeDOM, ".footer__leave-btn-container")[0].firstChild.addEventListener("click", () => {
              console.log("Meeting ended")
              // To suppress further errors
              hasMeetingEnded = true
              if (transcriptObserver) {
                transcriptObserver.disconnect()
              }

              // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
              if ((personNameBuffer !== "") && (transcriptTextBuffer !== "")) {
                pushBufferToTranscript()
              }
              // Save to chrome storage and send message to download transcript from background script
              overWriteChromeStorage(["transcript", "chatMessages"], true)
            })
          } catch (err) {
            console.error(err)
            showNotification(extensionStatusJSON_bug)

            logError("004", err)
          }
        })
      })
    })
  }





  //*********** CALLBACK FUNCTIONS **********//
  // Callback function to execute when transcription mutations are observed. 
  /**
   * @param {MutationRecord[]} mutationsList
   */
  function transcriptMutationCallback(mutationsList) {
    mutationsList.forEach(async (mutation) => {
      console.log(mutation)

      try {

        const iframe = /** @type {HTMLIFrameElement | null} */ (document.querySelector("#webclient"))
        const iframeDOM = iframe?.contentDocument
        const transcriptTargetNode = iframeDOM?.querySelector(`.live-transcription-subtitle__box`)

        const currentPerson = transcriptTargetNode?.lastChild

        if (currentPerson && currentPerson.childNodes.length > 1) {
          const currentTranscriptText = currentPerson.lastChild?.textContent

          const currentPersonElement =  /** @type {HTMLElement | null} */ (currentPerson.firstChild)
          let currentPersonName = ""

          if (currentPersonElement?.tagName === "IMG") {
            // @ts-ignore
            const avatarSrc = currentPersonElement.src
            const avatarElements = iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)
            if (avatarElements && avatarElements.length > 1) {
              currentPersonName = /** @type {string} */ (iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)[0]?.parentElement?.nextSibling?.textContent)
            }
            else {
              currentPersonName = await getAvatarIdentifier(avatarSrc)
            }
          }
          else {
            currentPersonName = /** @type {string} */ (currentPersonElement?.textContent)
          }


          console.log("currentPersonName" + currentPersonName)
          console.log("currentTranscriptText" + currentTranscriptText)

          if (currentPersonName && currentTranscriptText) {
            // Starting fresh in a meeting or resume from no active transcript
            if (transcriptTextBuffer === "") {
              personNameBuffer = currentPersonName
              timestampBuffer = new Date().toISOString()
              transcriptTextBuffer = currentTranscriptText
            }
            // Some prior transcript buffer exists
            else {
              // New person started speaking 
              if (personNameBuffer !== currentPersonName) {
                // Push previous person's transcript as a block
                pushBufferToTranscript()

                // Update buffers for next mutation and store transcript block timestamp
                personNameBuffer = currentPersonName
                timestampBuffer = new Date().toISOString()
                transcriptTextBuffer = currentTranscriptText
              }
              // Same person speaking more
              else {
                // Update buffers for next mutation
                // Append only the new part of the transcript
                transcriptTextBuffer = transcriptTextBuffer + findNewPart(transcriptTextBuffer, currentTranscriptText)
              }
            }
          }
        }

        // Logs to indicate that the extension is working
        if (transcriptTextBuffer.length > 125) {
          console.log(transcriptTextBuffer.slice(0, 50) + " ... " + transcriptTextBuffer.slice(-50))
        }
        else {
          console.log(transcriptTextBuffer)
        }
      }
      catch (err) {
        console.error(err)
        if (!isTranscriptDomErrorCaptured && !hasMeetingEnded) {
          console.log(reportErrorMessage)
          showNotification(extensionStatusJSON_bug)

          logError("005", err)
        }
        isTranscriptDomErrorCaptured = true
      }
    })
  }









  //*********** HELPER FUNCTIONS **********//

  /**
   * Finds the new part of string2 that has been added relative to string1.
   *
   * @param {string} string1 The original string.
   * @param {string} string2 The modified string.
   * @returns {string|null} The new part of the string, or null if no common part is found.
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
      // Chop off one character from the beginning of the temporary string.
      tempString1 = tempString1.substring(1)
    }

    // No common suffix and prefix between the two strings. So the second string must be entirely new.
    return string2
  }

  /**
   * @param {string | undefined} url
   */
  async function getAvatarIdentifier(url) {
    // Check if the URL is valid
    if (!url || typeof url !== 'string') {
      return 'invalid_url'
    }

    try {
      // Encode the URL into a buffer
      const msgUint8 = new TextEncoder().encode(url)

      // Hash the URL using SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)

      // Convert the hash buffer to a hexadecimal string
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Return the first 10 characters of the hash as the identifier
      return hashHex.substring(0, 10)
    } catch (error) {
      console.error('Error hashing URL:', error)
      return 'hashing_error'
    }
  }

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

  // Pushes data in the buffer to transcript array as a transcript block
  function pushBufferToTranscript() {
    transcript.push({
      "personName": personNameBuffer === "You" ? userName : personNameBuffer,
      "timestamp": timestampBuffer,
      "transcriptText": transcriptTextBuffer
    })

    overWriteChromeStorage(["transcript"], false)
  }

  // Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
  /**
   * @param {Array<"transcript" | "meetingTitle" | "meetingStartTimestamp" | "chatMessages">} keys
   * @param {boolean} sendDownloadMessage
   */
  function overWriteChromeStorage(keys, sendDownloadMessage) {
    const objectToSave = {}
    // Hard coded list of keys that are accepted
    if (keys.includes("transcript")) {
      objectToSave.transcript = transcript
    }
    if (keys.includes("meetingTitle")) {
      objectToSave.meetingTitle = meetingTitle
    }
    if (keys.includes("meetingStartTimestamp")) {
      objectToSave.meetingStartTimestamp = meetingStartTimestamp
    }
    if (keys.includes("chatMessages")) {
      objectToSave.chatMessages = chatMessages
    }

    chrome.storage.local.set(objectToSave, function () {
      // Helps people know that the extension is working smoothly in the background
      pulseStatus()
      if (sendDownloadMessage) {
        /** @type {ExtensionMessage} */
        const message = {
          type: "meeting_ended"
        }
        chrome.runtime.sendMessage(message, (responseUntyped) => {
          const response = /** @type {ExtensionResponse} */ (responseUntyped)
          if (!response.success) {
            console.error(response.message)
          }
        })
      }
    })
  }

  function pulseStatus() {
    const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `
    const iframe = /** @type {HTMLIFrameElement} */ (document.querySelector("#webclient"))
    const iframeDOM = iframe.contentDocument

    if (iframeDOM) {
      /** @type {HTMLDivElement | null}*/
      let activityStatus = iframeDOM.querySelector(`#transcriptonic-status`)
      if (!activityStatus) {
        let html = iframeDOM.querySelector("html")
        activityStatus = iframeDOM.createElement("div")
        activityStatus.setAttribute("id", "transcriptonic-status")
        activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
        html?.appendChild(activityStatus)
      }
      else {
        activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
      }

      setTimeout(() => {
        activityStatus.style.cssText = `background-color: transparent; ${statusActivityCSS}`
      }, 3000)
    }
  }


  // Grabs updated meeting title, if available
  function updateMeetingTitle() {
    setTimeout(() => {
      // NON CRITICAL DOM DEPENDENCY
      meetingTitle = document.title
    }, 5000)
  }

  // Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the parents. 
  /**
   * @param {Document} iframe
   * @param {string} selector
   * @param {string | RegExp} [text]
   */
  function selectElements(iframe, selector, text) {
    var elements = iframe.querySelectorAll(selector)
    return Array.prototype.filter.call(elements, function (/** @type {{ textContent: string; }} */ element) {
      return RegExp(text ? text : "").test(element.textContent)
    })
  }

  // Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
  /**
   * @param {Document} iframe
   * @param {string} selector
   * @param {string | RegExp} [text]
   */
  async function waitForElement(iframe, selector, text) {
    if (text) {
      // loops for every animation frame change, until the required element is found
      while (!Array.from(iframe.querySelectorAll(selector)).find(element => element.textContent === text)) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
    }
    else {
      // loops for every animation frame change, until the required element is found
      while (!iframe.querySelector(selector)) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
    }
    return iframe.querySelector(selector)
  }

  // Shows a responsive notification of specified type and message
  /**
   * @param {ExtensionStatusJSON} extensionStatusJSON
   */
  function showNotification(extensionStatusJSON) {
    const iframe = /** @type {HTMLIFrameElement} */ (document.querySelector("#webclient"))
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

      // Remove banner once transcript is on
      waitForElement(iframeDOM, ".live-transcription-subtitle__box").then(() => {
        obj.style.display = "none"
      })

      if (extensionStatusJSON.status === 200) {
        obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
      }
      else {
        obj.style.cssText = `color: orange; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
      }

      obj.prepend(text)
      obj.prepend(logo)
      if (html)
        html.append(obj)
    }
  }

  // CSS for notification
  const commonCSS = `background: rgb(255 255 255 / 10%); 
    backdrop-filter: blur(16px); 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`


  // Logs anonymous errors to a Google sheet for swift debugging   
  /**
   * @param {string} code
   * @param {any} err
   */
  function logError(code, err) {
    fetch(`https://script.google.com/macros/s/AKfycbxiyQSDmJuC2onXL7pKjXgELK1vA3aLGZL5_BLjzCp7fMoQ8opTzJBNfEHQX_QIzZ-j4Q/exec?version=${chrome.runtime.getManifest().version}&code=${code}&error=${encodeURIComponent(err)}`, { mode: "no-cors" })
  }

  /**
   * @param {string} oldVer
   * @param {string} newVer
   */
  function meetsMinVersion(oldVer, newVer) {
    const oldParts = oldVer.split('.')
    const newParts = newVer.split('.')
    for (var i = 0; i < newParts.length; i++) {
      const a = ~~newParts[i] // parse int
      const b = ~~oldParts[i] // parse int
      if (a > b) return false
      if (a < b) return true
    }
    return true
  }



  // Fetches extension status from GitHub and saves to chrome storage. Defaults to 200, if remote server is unavailable.
  function checkExtensionStatus() {
    return new Promise((resolve, reject) => {
      // Set default value as 200
      extensionStatusJSON = { status: 200, message: "<strong>TranscripTonic is running</strong> <br /> Please switch on Zoom captions" }

      // https://stackoverflow.com/a/42518434
      fetch(
        "https://script.google.com/macros/s/AKfycbxR5JrVay-WRSDmxTbJnmRiv68HhjMRwKRZgO0OlOmZx6xu10kx-4OZRee0noiNA1BZ/exec",
        { cache: "no-store" }
      )
        .then((response) => response.json())
        .then((result) => {
          const minVersion = result.minVersion

          // Disable extension if extension is not of the required version
          if (!meetsMinVersion(chrome.runtime.getManifest().version, minVersion)) {
            extensionStatusJSON.status = 400
            extensionStatusJSON.message = `<strong>TranscripTonic is not running</strong> <br /> Please update to v${minVersion} by following <a href="https://github.com/vivek-nexus/transcriptonic/wiki/Manually-update-TranscripTonic" target="_blank">these instructions</a>`
          }
          else {
            // Update status based on response
            extensionStatusJSON.status = result.status
            extensionStatusJSON.message = result.message
          }

          console.log("Extension status fetched and saved")
          resolve("Extension status fetched and saved")
        })
        .catch((err) => {
          console.error(err)
          reject("Could not fetch extension status")

          logError("008", err)
        })
    })
  }

  function recoverLastMeeting() {
    return new Promise((resolve, reject) => {
      /** @type {ExtensionMessage} */
      const message = {
        type: "recover_last_meeting",
      }
      chrome.runtime.sendMessage(message, function (responseUntyped) {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if (response.success) {
          resolve("Last meeting recovered successfully or recovery not needed")
        }
        else {
          reject(response.message)
        }
      })
    })
  }
}