let transcript = []
let personNameBuffer = "", transcriptTextBuffer = ""
let beforePersonName = "", beforeTranscriptText = ""
let meetingStartTimeStamp = new Date().toLocaleString()
const extensionStatusJSON_bug = {
  "status": 400,
  "message": "<strong>Transcripto seems to have an error</strong> <br /> Please report it <a href='https://github.com/vivek-nexus/transcripto/issues' target='_blank'>here</a>."
}

checkExtensionStatus().then(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (result) {
    let extensionStatusJSON = result.extensionStatusJSON;
    console.log("Extension status " + extensionStatusJSON.status);

    if (extensionStatusJSON.status == 200) {
      checkElement(".google-material-icons", "call_end").then(() => {
        if (contains(".material-icons-extended", "closed_caption_off")[0]) {
          const captionsButton = contains(".material-icons-extended", "closed_caption_off")[0]

          console.log("Meeting started")
          chrome.storage.sync.get(["operationMode"], function (result) {
            if (result.operationMode == "manual")
              console.log("Manual mode selected, leaving transcript off")
            else
              captionsButton.click()
          })

          const targetNode = document.querySelector('.a4cQT') ? document.querySelector('.a4cQT') : undefined
          const config = { childList: true, attributes: true, subtree: true };
          // Create an observer instance linked to the callback function
          const observer = new MutationObserver(transcriber);

          // Start observing the target node for configured mutations
          if (targetNode) {
            observer.observe(targetNode, config)
            chrome.storage.sync.get(["operationMode"], function (result) {
              if (result.operationMode == "manual")
                showNotification({ status: 400, message: "<strong>Transcripto is not running</strong> <br /> Turn on captions, if needed" })
              else
                showNotification(extensionStatusJSON)
            })
          }
          else {
            showNotification(extensionStatusJSON_bug)
          }

          contains(".google-material-icons", "call_end")[0].parentElement.addEventListener("click", () => {
            if (personNameBuffer != "" || transcriptTextBuffer != "") {
              transcript.push({
                "personName": personNameBuffer,
                "personTranscript": transcriptTextBuffer
              })
              chrome.storage.local.set({ transcript: transcript }, function () { })
            }
            observer.disconnect();
            console.log(`Transcript length ${transcript.length}`)
            if (transcript.length > 0)
              downloadTranscript()
          })

          window.addEventListener("beforeunload", function () {
            transcript.push({
              "personName": personNameBuffer,
              "personTranscript": transcriptTextBuffer
            })
            chrome.runtime.sendMessage({ transcript: transcript }, function (response) {
              console.log(response);
            });
          })
        }
        else {
          showNotification(extensionStatusJSON_bug)
        }
      })
    }
    else {
      checkElement(".google-material-icons", "call_end").then(() => {
        showNotification(extensionStatusJSON);
      })
    }
  })
})

function contains(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent);
  });
}

const checkElement = async (selector, text) => {
  if (text) {
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  else {
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return document.querySelector(selector);
}

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



function downloadTranscript() {
  // Create an array to store lines of the text file
  const lines = [];

  // Iterate through the transcript array and format each entry
  transcript.forEach(entry => {
    lines.push(entry.personName);
    lines.push(entry.personTranscript);
    lines.push(''); // Add an empty line between entries
  });

  lines.push("---")
  lines.push("Transcript generated using Transcripto Chrome extension")

  // Join the lines into a single string
  const textContent = lines.join('\n');

  // Create a Blob from the text content
  const blob = new Blob([textContent], { type: 'text/plain' });

  // Create a download notification
  let html = document.querySelector("html");
  let obj = document.createElement("div");
  let downloadLink = document.createElement("a")
  downloadLink.setAttribute("id", "transcript-download-button")

  obj.prepend(downloadLink)
  if (html) {
    html.append(obj)
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `Transcript-${document.querySelector('div[data-meeting-title]') ? document.querySelector('div[data-meeting-title]').getAttribute("data-meeting-title") : document.title} ${meetingStartTimeStamp}.txt`;

    downloadLink.click();
  }
}

function transcriber(mutationsList, observer) {
  // Callback function to execute when mutations are observed
  setTimeout(() => {
    mutationsList.forEach(mutation => {
      if (document.querySelector('.a4cQT').firstChild.firstChild.childNodes.length > 0) {
        const people = document.querySelector('.a4cQT').firstChild.firstChild.childNodes

        const person = people[people.length - 1]
        const currentPersonName = person.childNodes[1] ? person.childNodes[1].textContent : ""
        const currentTranscriptText = person.childNodes[2].lastChild ? person.childNodes[2].lastChild.textContent : ""

        if (beforeTranscriptText == "") {
          personNameBuffer = currentPersonName
          beforeTranscriptText = currentTranscriptText
          transcriptTextBuffer += currentTranscriptText
        }
        else {
          if (personNameBuffer != currentPersonName) {
            transcript.push({
              "personName": personNameBuffer,
              "personTranscript": transcriptTextBuffer
            })
            chrome.storage.local.set({ transcript: transcript }, function () { })
            beforeTranscriptText = currentTranscriptText
            personNameBuffer = currentPersonName;
            transcriptTextBuffer = currentTranscriptText;
          }
          else {
            transcriptTextBuffer += currentTranscriptText.substring(currentTranscriptText.indexOf(beforeTranscriptText) + beforeTranscriptText.length)
            beforeTranscriptText = currentTranscriptText
          }
        }
      }
      else {
        console.log("No active transcript")
        if ((personNameBuffer != "") && (transcriptTextBuffer != "")) {
          transcript.push({
            "personName": personNameBuffer,
            "personTranscript": transcriptTextBuffer
          })
          chrome.storage.local.set({ transcript: transcript }, function () { })
        }
        beforePersonName = ""
        beforeTranscriptText = ""
        personNameBuffer = ""
        transcriptTextBuffer = ""
      }
      console.log(transcriptTextBuffer)
      console.log(transcript)
    })
  }, 500);
}

async function checkExtensionStatus() {
  // Set default value as 200
  chrome.storage.local.set({
    extensionStatusJSON: { status: 200, message: "<strong>Transcripto is running</strong> <br /> Do not turn off captions" },
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


