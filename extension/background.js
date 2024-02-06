chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log(request.transcript)
    chrome.storage.local.set({ transcript: request.transcript }, function () {
        console.log("Saved transcript.")
    })
    return true
})