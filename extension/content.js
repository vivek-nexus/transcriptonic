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
  "message": "<strong>TranscripTonic seems to have an error</strong> <br /> Please report it <a href='https://github.com/vivek-nexus/transcriptonic/issues' target='_blank'>here</a>."
}
const mutationConfig = { childList: true, attributes: true, subtree: true }
// Transcript array that holds one or more transcript blocks
// Each transcript block (object) has personName and transcriptText key value pairs
let transcript = []
// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timeStampBuffer = undefined
// Buffer variables for deciding when to push a transcript block
let beforePersonName = "", beforeTranscriptText = ""

// Capture meeting start timestamp and sanitise special characters with "-" to avoid invalid filenames
let meetingStartTimeStamp = new Date().toLocaleString("default", timeFormat).replace(/[/:]/g, '-').toUpperCase()
let meetingTitle = document.title
// Capture invalid transcript DOM element error for the first time
let isTranscriptDomErrorCaptured = false


checkExtensionStatus().then(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (result) {
    let extensionStatusJSON = result.extensionStatusJSON;
    console.log("Extension status " + extensionStatusJSON.status);

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status == 200) {
      // CRITICAL DOM ELEMENT. Wait until the meeting end icon appears, used to detect meeting start
      checkElement(".google-material-icons", "call_end").then(() => {
        console.log("Meeting started")

        try {
          //*********** MEETING START ROUTINES **********//
          // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
          setTimeout(() => {
            meetingTitle = updateMeetingTitle()
          }, 5000)

          // CRITICAL DOM ELEMENT
          const captionsButton = contains(".material-icons-extended", "closed_caption_off")[0]

          // Click captions icon for non manual operation modes. Async operation.
          chrome.storage.sync.get(["operationMode"], function (result) {
            if (result.operationMode == "manual")
              console.log("Manual mode selected, leaving transcript off")
            else
              captionsButton.click()
          })

          // CRITICAL DOM ELEMENT. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
          const targetNode = document.querySelector('.a4cQT')

          // Create an observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
          const observer = new MutationObserver(transcriber);

          // Start observing the transcript element for configured mutations
          observer.observe(targetNode, mutationConfig)
          // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
          chrome.storage.sync.get(["operationMode"], function (result) {
            if (result.operationMode == "manual")
              showNotification({ status: 400, message: "<strong>TranscripTonic is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
            else
              showNotification(extensionStatusJSON)
          })


          //*********** MEETING END ROUTINES **********//
          // Event listener to capture browser tab or window close
          window.addEventListener("beforeunload", unloadCallback)

          // CRITICAL DOM ELEMENT. Event listener to capture meeting end button click by user
          contains(".google-material-icons", "call_end")[0].parentElement.addEventListener("click", () => {
            // Remove unload event listener registered earlier, to prevent double downloads. Otherwise, unload event will trigger the callback, when user navigates away from meeting end page.
            window.removeEventListener("beforeunload", unloadCallback)
            observer.disconnect()

            // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Mutation observer should do this, but this is just for safety.
            if ((personNameBuffer != "") && (transcriptTextBuffer != ""))
              pushToTranscript()
            // Save to chrome storage and send message to download transcript from background script
            overWriteChromeStorage(true)
          })
        } catch (error) {
          console.log(error)
          showNotification(extensionStatusJSON_bug)
        }
      })
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
const commonCSS = `background: rgb(255 255 255 / 25%); 
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

// Pushes any data in the buffer to transcript and tells background script to save it and download it
function unloadCallback() {
  // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Mutation observer should do this, but this is just for safety.
  if ((personNameBuffer != "") && (transcriptTextBuffer != ""))
    pushToTranscript()
  // Send a message to save to chrome storage as well as download. Saving is offloaded to background script, since browser often aborts this long operation on unload
  chrome.runtime.sendMessage(
    {
      type: "save_and_download",
      transcript: transcript,
      meetingTitle: meetingTitle,
      meetingStartTimeStamp: meetingStartTimeStamp,
    },
    function (response) {
      console.log(response)
    })
}

function transcriber(mutationsList, observer) {
  // Callback function to execute when mutations are observed. Delay for 1000ms to allow for text corrections by Meet.
  setTimeout(() => {
    mutationsList.forEach(mutation => {
      try {
        // CRITICAL DOM ELEMENT. Get all people in the transcript
        const people = document.querySelector('.a4cQT').firstChild.firstChild.childNodes
        // Begin parsing transcript
        if (document.querySelector('.a4cQT')?.firstChild?.firstChild?.childNodes.length > 0) {
          // Get the last person
          const person = people[people.length - 1]
          // CRITICAL DOM ELEMENT
          const currentPersonName = person.childNodes[0].textContent
          // CRITICAL DOM ELEMENT
          const currentTranscriptText = person.childNodes[1].lastChild.textContent

          // Starting fresh in a meeting or resume from no active transcript
          if (beforeTranscriptText == "") {
            personNameBuffer = currentPersonName
            timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
            beforeTranscriptText = currentTranscriptText
            transcriptTextBuffer += currentTranscriptText
          }
          // Some prior transcript buffer exists
          else {
            // New person started speaking 
            if (personNameBuffer != currentPersonName) {
              // Push previous person's transcript as a block
              pushToTranscript()
              overWriteChromeStorage()
              // Update buffers for next mutation and store transcript block timeStamp
              beforeTranscriptText = currentTranscriptText
              personNameBuffer = currentPersonName
              timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
              transcriptTextBuffer = currentTranscriptText
            }
            // Same person speaking more
            else {
              // String subtraction to append only new characters to the buffer
              transcriptTextBuffer += currentTranscriptText.substring(currentTranscriptText.indexOf(beforeTranscriptText) + beforeTranscriptText.length)
              // Update buffers for next mutation
              beforeTranscriptText = currentTranscriptText
            }
          }
        }
        // No people found in transcript DOM
        else {
          // No transcript yet or the last person stopped speaking(and no one has started speaking next)
          console.log("No active transcript")
          // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
          if ((personNameBuffer != "") && (transcriptTextBuffer != "")) {
            pushToTranscript()
            overWriteChromeStorage()
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
        console.log(error)
        console.log("There is a bug in TranscripTonic. Please report it at https://github.com/vivek-nexus/transcriptonic/issues")
        if (isTranscriptDomErrorCaptured == false)
          showNotification(extensionStatusJSON_bug)
        isTranscriptDomErrorCaptured = true
      }
    })
  }, 1000);
}

// Pushes data in the buffer to transcript array as a transcript block
function pushToTranscript() {
  transcript.push({
    "personName": personNameBuffer,
    "timeStamp": timeStampBuffer,
    "personTranscript": transcriptTextBuffer
  })
}

// Saves transcriot variable, meetingTitle and meetingStartTimeStamp to chrome storage. Optionally, can send message to background script to download, post saving.
function overWriteChromeStorage(sendDownloadMessage) {
  chrome.storage.local.set({
    transcript: transcript,
    meetingTitle: meetingTitle,
    meetingStartTimeStamp: meetingStartTimeStamp
  }, function () {
    if (sendDownloadMessage) {
      console.log(`Transcript length ${transcript.length}`)
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
    const title = document.querySelector(".u6vdEc").textContent
    const invalidFilenameRegex = /[^\w\-_.() ]/g;
    return title.replace(invalidFilenameRegex, '_')
  } catch (error) {
    console.log(error)
    return document.title
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