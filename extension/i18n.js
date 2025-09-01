function t(key, fallback = "") {
  try {
    const v = chrome.i18n.getMessage(key)
    if (v) return v
  } catch (e) {}
  return fallback || key
}

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (!key) return
    const msg = t(key)
    if (!msg) return
    if (el.getAttribute('data-i18n-html') === '1') el.innerHTML = msg
    else el.textContent = msg
  })
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const spec = el.getAttribute('data-i18n-attr')
    if (!spec) return
    spec.split('|').forEach(pair => {
      const [attr, key] = pair.split(':')
      if (attr && key) {
        const msg = t(key)
        if (msg) el.setAttribute(attr, msg)
      }
    })
  })
}

document.addEventListener('DOMContentLoaded', () => applyI18n())