import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const source = fs.readFileSync(new URL("../extension/content-scripts/common-utils.js", import.meta.url), "utf8")

function loadFab() {
    const sandbox = {
        console,
        document: { querySelector: () => null },
        window: { innerWidth: 1440 },
        setInterval: () => 1,
        clearInterval: () => {},
        chrome: { runtime: { onMessage: { addListener() {} } } },
    }
    vm.createContext(sandbox)
    new vm.Script(source, { filename: "common-utils.js" }).runInContext(sandbox)
    const timerText = { textContent: "0:00:00" }
    const fab = { querySelector: () => timerText, getBoundingClientRect: () => ({ left: 0, right: 0 }), style: {} }
    return { startFabTimer: sandbox.startFabTimer, fab, timerText }
}

// Every Meet/Teams/Zoom content script resets chrome.storage.local.meetingStartTimestamp
// to null when it loads, and storage.onChanged hands that null to startFabTimer() in every
// open meeting tab. new Date(null) is the Unix epoch, so the FAB showed ~498150:16:26.
test("a cleared start timestamp keeps the running FAB timer instead of counting from 1970", () => {
    const { startFabTimer, fab, timerText } = loadFab()
    startFabTimer(fab, new Date(Date.now() - (5 * 60 + 3) * 1000).toISOString())
    assert.equal(timerText.textContent, "0:05:03")

    for (const cleared of [null, undefined, "", "not a date"]) {
        startFabTimer(fab, cleared)
        assert.equal(timerText.textContent, "0:05:03", `startIso=${JSON.stringify(cleared)}`)
    }
})

test("a fresh FAB never shows an epoch-sized time for a cleared start timestamp", () => {
    const { startFabTimer, fab, timerText } = loadFab()
    startFabTimer(fab, null)
    assert.equal(timerText.textContent, "0:00:00")
})
