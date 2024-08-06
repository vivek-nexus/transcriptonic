//*********** GLOBAL VARIABLES **********//
const timeFormat = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
}
const extensionStatusJSON_bug = {
  "status": 400,
  "message": "<strong>TranscripTonic encountered a new error</strong> <br /> Please report it <a href='https://github.com/vivek-nexus/transcriptonic/issues' target='_blank'>here</a>."
}
const reportErrorMessage = "There is a bug in TranscripTonic. Please report it at https://github.com/vivek-nexus/transcriptonic/issues"
const mutationConfig = { childList: true, attributes: true, subtree: true }

// Name of the person attending the meeting
let userName = "You"
overWriteChromeStorage(["userName"], false)
// Transcript array that holds one or more transcript blocks
// Each transcript block (object) has personName, timeStamp and transcriptText key value pairs
let transcript = []
// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timeStampBuffer = undefined
// Buffer variables for deciding when to push a transcript block
let beforePersonName = "", beforeTranscriptText = ""
// Chat messages array that holds one or chat messages of the meeting
// Each message block(object) has personName, timeStamp and messageText key value pairs
let chatMessages = []
overWriteChromeStorage(["chatMessages"], false)

// Capture meeting start timestamp and sanitize special characters with "-" to avoid invalid filenames
let meetingStartTimeStamp = new Date().toLocaleString("default", timeFormat).replace(/[/:]/g, '-').toUpperCase()
let meetingTitle = document.title
overWriteChromeStorage(["meetingStartTimeStamp", "meetingTitle"], false)
// Capture invalid transcript and chat messages DOM element error for the first time
let isTranscriptDomErrorCaptured = false
let isChatMessagesDomErrorCaptured = false
// Capture meeting begin to abort userName capturing interval
let hasMeetingStarted = false
// Capture meeting end to suppress any errors
let hasMeetingEnded = false

let extensionStatusJSON


checkExtensionStatus().then(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (result) {
    extensionStatusJSON = result.extensionStatusJSON;
    console.log("Extension status " + extensionStatusJSON.status);

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status == 200) {
      // NON CRITICAL DOM DEPENDENCY. Attempt to get username before meeting starts. Abort interval if valid username is found or if meeting starts and default to "You".
      checkElement(".awLEm").then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
          userName = document.querySelector(".awLEm").textContent
          if (userName || hasMeetingStarted) {
            clearInterval(captureUserNameInterval)
            // Prevent overwriting default "You" where element is found, but valid userName is not available
            if (userName != "")
              overWriteChromeStorage(["userName"], false)
          }
        }, 100)
      })

      // 1. Meet UI prior to July/Aug 2024
      meetingRoutines(1)

      // 2. Meet UI post July/Aug 2024
      meetingRoutines(2)
    }
    else {
      // Show downtime message as extension status is 400
      showNotification(extensionStatusJSON)
    }
  })
})

// Fetches extension status from GitHub and saves to chrome storage. Defaults to 200, if remote server is unavailable.
async function checkExtensionStatus() {
  // Set default value as 200
  chrome.storage.local.set({
    extensionStatusJSON: { status: 200, message: "<strong>TranscripTonic is running</strong> <br /> Do not turn off captions" },
  });

  // https://stackoverflow.com/a/42518434
  await fetch(
    "https://ejnana.github.io/transcripto-status/status-prod.json",
    { cache: "no-store" }
  )
    .then((response) => response.json())
    .then((result) => {
      // Write status to chrome local storage
      chrome.storage.local.set({ extensionStatusJSON: result }, function () {
        console.log("Extension status fetched and saved")
      });
    })
    .catch((err) => {
      console.log(err);
    });
}


function meetingRoutines(uiType) {
  const meetingEndIconData = {
    selector: "",
    text: ""
  }
  const captionsIconData = {
    selector: "",
    text: ""
  }
  // Different selector data for different UI versions
  switch (uiType) {
    case 1:
      meetingEndIconData.selector = ".google-material-icons"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".material-icons-extended"
      captionsIconData.text = "closed_caption_off"
      break;
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
    default:
      break;
  }

  // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
  checkElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    chrome.runtime.sendMessage({ type: "new_meeting_started" }, function (response) {
      console.log(response);
    });
    hasMeetingStarted = true



    try {
      //*********** MEETING START ROUTINES **********//
      // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
      setTimeout(() => updateMeetingTitle(), 5000)

      // **** TRANSCRIPT ROUTINES **** //
      // CRITICAL DOM DEPENDENCY
      const captionsButton = contains(captionsIconData.selector, captionsIconData.text)[0]


      // Click captions icon for non manual operation modes. Async operation.
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          console.log("Manual mode selected, leaving transcript off")
        else
          captionsButton.click()
      })

      // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
      const transcriptTargetNode = document.querySelector('.a4cQT')
      // Attempt to dim down the transcript
      try {
        transcriptTargetNode.firstChild.style.opacity = 0.2
      } catch (error) {
        console.error(error)
      }

      // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
      const transcriptObserver = new MutationObserver(transcriber)

      // Start observing the transcript element and chat messages element for configured mutations
      transcriptObserver.observe(transcriptTargetNode, mutationConfig)

      // **** CHAT MESSAGES ROUTINES **** //
      const chatMessagesButton = contains(".google-symbols", "chat")[0]
      // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
      chatMessagesButton.click()
      let chatMessagesObserver
      // Allow DOM to be updated and then register chatMessage mutation observer
      setTimeout(() => {
        chatMessagesButton.click()
        // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
        try {
          const chatMessagesTargetNode = document.querySelectorAll('div[aria-live="polite"]')[0]

          // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
          chatMessagesObserver = new MutationObserver(chatMessagesRecorder)

          chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
        } catch (error) {
          console.error(error)
          showNotification(extensionStatusJSON_bug)
        }
      }, 500)

      // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          showNotification({ status: 400, message: "<strong>TranscripTonic is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        else
          showNotification(extensionStatusJSON)
      })


      //*********** MEETING END ROUTINES **********//
      // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
      contains(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
        // To suppress further errors
        hasMeetingEnded = true
        transcriptObserver.disconnect()
        chatMessagesObserver.disconnect()

        // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
        if ((personNameBuffer != "") && (transcriptTextBuffer != ""))
          pushBufferToTranscript()
        // Save to chrome storage and send message to download transcript from background script
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (error) {
      console.error(error)
      showNotification(extensionStatusJSON_bug)
    }
  })
}


// Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the upper parents. 
function contains(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent);
  });
}

// Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
const checkElement = async (selector, text) => {
  if (text) {
    // loops for every animation frame change, until the required element is found
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  else {
    // loops for every animation frame change, until the required element is found
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return document.querySelector(selector);
}

// Shows a responsive notification of specified type and message
function showNotification(extensionStatusJSON) {
  // Banner CSS
  let html = document.querySelector("html");
  let obj = document.createElement("div");
  let logo = document.createElement("img");
  let text = document.createElement("p");

  logo.setAttribute(
    "src",
    "https://ejnana.github.io/transcripto-status/icon.png"
  );
  logo.setAttribute("height", "32px");
  logo.setAttribute("width", "32px");
  logo.style.cssText = "border-radius: 4px";

  // Remove banner after 5s
  setTimeout(() => {
    obj.style.display = "none";
  }, 5000);

  if (extensionStatusJSON.status == 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }
  else {
    obj.style.cssText = `color: orange; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }

  obj.prepend(text);
  obj.prepend(logo);
  if (html)
    html.append(obj);
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
    font-family: 'Google Sans',Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`;

// Callback function to execute when transcription mutations are observed. 
function transcriber(mutationsList, observer) {
  // Delay for 1000ms to allow for text corrections by Meet.
  mutationsList.forEach(mutation => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const people = document.querySelector('.a4cQT').firstChild.firstChild.childNodes
      // Begin parsing transcript
      if (document.querySelector('.a4cQT')?.firstChild?.firstChild?.childNodes.length > 0) {
        // Get the last person
        const person = people[people.length - 1]
        // CRITICAL DOM DEPENDENCY
        const currentPersonName = person.childNodes[0].textContent
        // CRITICAL DOM DEPENDENCY
        const currentTranscriptText = person.childNodes[1].lastChild.textContent

        // Starting fresh in a meeting or resume from no active transcript
        if (beforeTranscriptText == "") {
          personNameBuffer = currentPersonName
          timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
          beforeTranscriptText = currentTranscriptText
          transcriptTextBuffer = currentTranscriptText
        }
        // Some prior transcript buffer exists
        else {
          // New person started speaking 
          if (personNameBuffer != currentPersonName) {
            // Push previous person's transcript as a block
            pushBufferToTranscript()
            overWriteChromeStorage(["transcript"], false)
            // Update buffers for next mutation and store transcript block timeStamp
            beforeTranscriptText = currentTranscriptText
            personNameBuffer = currentPersonName
            timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
            transcriptTextBuffer = currentTranscriptText
          }
          // Same person speaking more
          else {
            transcriptTextBuffer = currentTranscriptText
            // Update buffers for next mutation
            beforeTranscriptText = currentTranscriptText
            // If a person is speaking for a long time, Google Meet does not keep the entire text in the spans. Starting parts are automatically removed in an unpredictable way as the length increases and TranscripTonic will miss them. So we force remove a lengthy transcript node in a controlled way. Google Meet will add a fresh person node when we remove it and continue transcription. TranscripTonic picks it up as a new person and nothing is missed.
            if (currentTranscriptText.length > 250)
              person.remove()
          }
        }
      }
      // No people found in transcript DOM
      else {
        // No transcript yet or the last person stopped speaking(and no one has started speaking next)
        console.log("No active transcript")
        // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
        if ((personNameBuffer != "") && (transcriptTextBuffer != "")) {
          pushBufferToTranscript()
          overWriteChromeStorage(["transcript"], false)
        }
        // Update buffers for the next person in the next mutation
        beforePersonName = ""
        beforeTranscriptText = ""
        personNameBuffer = ""
        transcriptTextBuffer = ""
      }
      console.log(transcriptTextBuffer)
      // console.log(transcript)
    } catch (error) {
      console.error(error)
      if (isTranscriptDomErrorCaptured == false && hasMeetingEnded == false) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
      }
      isTranscriptDomErrorCaptured = true
    }
  })
}

// Callback function to execute when chat messages mutations are observed. 
function chatMessagesRecorder(mutationsList, observer) {
  mutationsList.forEach(mutation => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const chatMessagesElement = document.querySelectorAll('div[aria-live="polite"]')[0]
      // Attempt to parse messages only if at least one message exists
      if (chatMessagesElement.children.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastChild
        // CRITICAL DOM DEPENDENCY.
        const personName = chatMessageElement.firstChild.firstChild.textContent
        const timeStamp = new Date().toLocaleString("default", timeFormat).toUpperCase()
        // CRITICAL DOM DEPENDENCY. Some mutations will have some noisy text at the end, which is handled in pushUniqueChatBlock function.
        const chatMessageText = chatMessageElement.lastChild.lastChild.textContent

        const chatMessageBlock = {
          personName: personName,
          timeStamp: timeStamp,
          chatMessageText: chatMessageText
        }

        // Lot of mutations fire for each message, pick them only once
        pushUniqueChatBlock(chatMessageBlock)
        overWriteChromeStorage(["chatMessages", false])
        console.log(chatMessages)
      }
    }
    catch (error) {
      console.error(error)
      if (isChatMessagesDomErrorCaptured == false && hasMeetingEnded == false) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
      }
      isChatMessagesDomErrorCaptured = true
    }
  })
}

// Pushes data in the buffer to transcript array as a transcript block
function pushBufferToTranscript() {
  transcript.push({
    "personName": personNameBuffer,
    "timeStamp": timeStampBuffer,
    "personTranscript": transcriptTextBuffer
  })
}

// Pushes object to array only if it doesn't already exist. chatMessage is checked for substring since some trailing text(keep Pin message) is present from a button that allows to pin the message.
function pushUniqueChatBlock(chatBlock) {
  const isExisting = chatMessages.some(item =>
    item.personName == chatBlock.personName &&
    item.timeStamp == chatBlock.timeStamp &&
    chatBlock.chatMessageText.includes(item.chatMessageText)
  )
  if (!isExisting)
    chatMessages.push(chatBlock);
}

// Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  // Hard coded list of keys that are accepted
  if (keys.includes("userName"))
    objectToSave.userName = userName
  if (keys.includes("transcript"))
    objectToSave.transcript = transcript
  if (keys.includes("meetingTitle"))
    objectToSave.meetingTitle = meetingTitle
  if (keys.includes("meetingStartTimeStamp"))
    objectToSave.meetingStartTimeStamp = meetingStartTimeStamp
  if (keys.includes("chatMessages"))
    objectToSave.chatMessages = chatMessages

  chrome.storage.local.set(objectToSave, function () {
    if (sendDownloadMessage) {
      // Download only if any transcript is present, irrespective of chat messages
      if (transcript.length > 0) {
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response);
        })
      }
    }
  })
}

// Grabs updated meeting title, if available. Replaces special characters with underscore to avoid invalid file names.
function updateMeetingTitle() {
  try {
    // NON CRITICAL DOM DEPENDENCY
    const title = document.querySelector(".u6vdEc").textContent
    const invalidFilenameRegex = /[^\w\-_.() ]/g
    meetingTitle = title.replace(invalidFilenameRegex, '_')
    overWriteChromeStorage(["meetingTitle"], false)
  } catch (error) {
    console.error(error)
  }
}





// CURRENT GOOGLE MEET TRANSCRIPT DOM

{/* <div class="a4cQT" jsaction="bz0DVc:HWTqGc;TpIHXe:c0270d;v2nhid:YHhXNc;kDAVge:lUFH9b;QBUr8:lUFH9b;stc2ve:oh3Xke"
  jscontroller="D1tHje" style="right: 16px; left: 16px; bottom: 80px;">
  <div>
    <div class="iOzk7" jsname="dsyhDe" style="">
      //PERSON 1
      <div class="TBMuR bj4p3b" style="">
        <div><img alt="" class="KpxDtd r6DyN"
            src="https://lh3.googleusercontent.com/a/some-url"
            data-iml="453">
          <div class="zs7s8d jxFHg">Person 1</div>
        </div>
        <div jsname="YSxPC" class="Mz6pEf wY1pdd" style="height: 28.4444px;">
          <div jsname="tgaKEf" class="iTTPOb VbkSUe">
          <span>Some transcript text.</span>
          <span>Some more text.</span></div>
        </div>
      </div>
      
      // PERSON 2
      <div class="TBMuR bj4p3b" style="">
        <div><img alt="" class="KpxDtd r6DyN"
            src="https://lh3.googleusercontent.com/a/some-url"
            data-iml="453">
          <div class="zs7s8d jxFHg">Person 2</div>
        </div>
        <div jsname="YSxPC" class="Mz6pEf wY1pdd" style="height: 28.4444px;">
          <div jsname="tgaKEf" class="iTTPOb VbkSUe">
          <span>Some transcript text.</span>
          <span>Some more text.</span></div>
        </div>
      </div>
    </div>
    <div class="iOzk7" jsname="APQunf" style="display: none;"></div>
  </div>
  <More divs />
</div> */}

// CURRENT GOOGLE MEET CHAT MESSAGES DOM
{/* <div jsname="xySENc" aria-live="polite" jscontroller="Mzzivb" jsaction="nulN2d:XL2g4b;vrPT5c:XL2g4b;k9UrDc:ClCcUe"
  class="Ge9Kpc z38b6">
  <div class="Ss4fHf" jsname="Ypafjf" tabindex="-1" jscontroller="LQRnv"
    jsaction="JIbuQc:sCzVOd(aUCive),T4Iwcd(g21v4c),yyLnsd(iJEnyb),yFT8A(RNMM1e),Cg1Rgf(EZbOH)" style="order: 0;">
    <div class="QTyiie">
      <div class="poVWob">You</div>
      <div jsname="biJjHb" class="MuzmKe">17:00</div>
    </div>
    <div class="beTDc">
      <div class="er6Kjc chmVPb">
        <div class="ptNLrf">
          <div jsname="dTKtvb">
            <div jscontroller="RrV5Ic" jsaction="rcuQ6b:XZyPzc" data-is-tv="false">Hello</div>
          </div>
          <div class="pZBsfc">Hover over a message to pin it<i class="google-material-icons VfPpkd-kBDsod WRc1Nb"
              aria-hidden="true">keep</i></div>
          <div class="MMfG3b"><span tooltip-id="ucc-17"></span><span data-is-tooltip-wrapper="true"><button
                class="VfPpkd-Bz112c-LgbsSe yHy1rc eT1oJ tWDL4c Brnbv pFZkBd" jscontroller="soHxf"
                jsaction="click:cOuCgd; mousedown:UX7yZ; mouseup:lbsD7e; mouseenter:tfO1Yc; mouseleave:JywGue; touchstart:p6p2H; touchmove:FwuNnf; touchend:yfqBxc; touchcancel:JMtRjd; focus:AHmuwe; blur:O22p3e; contextmenu:mg9Pef;mlnRJb:fLiPzd"
                jsname="iJEnyb" data-disable-idom="true" aria-label="Pin message" data-tooltip-enabled="true"
                data-tooltip-id="ucc-17" data-tooltip-x-position="3" data-tooltip-y-position="2" role="button"
                data-message-id="1714476309237">
                <div jsname="s3Eaab" class="VfPpkd-Bz112c-Jh9lGc"></div>
                <div class="VfPpkd-Bz112c-J1Ukfc-LhBDec"></div><i class="google-material-icons VfPpkd-kBDsod VjEpdd"
                  aria-hidden="true">keep</i>
              </button>
              <div class="EY8ABd-OWXEXe-TAWMXe" role="tooltip" aria-hidden="true" id="ucc-17">Pin message</div>
            </span></div>
        </div>
      </div>
    </div>
  </div>
</div> */}