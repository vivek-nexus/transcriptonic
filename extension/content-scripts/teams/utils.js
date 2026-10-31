/**
   * @description Shows a responsive notification of specified type and message
   * @param {ExtensionStatusJSON} extensionStatusJSON
   */
function showNotificationTeams(extensionStatusJSON) {
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
        obj.style.cssText = `color: #2A9ACA ; bottom: 5%; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message

        // Remove banner once transcript is on
        waitForElement(`[data-tid="closed-caption-renderer-wrapper"]`).then(() => {
            obj.style.display = "none"
        })
    }
    else {
        obj.style.cssText = `color: orange ; bottom: 5%; ${commonCSS}`
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