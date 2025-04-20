// Loads and saves the OpenAI API key to chrome.storage.local

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const statusDiv = document.getElementById('status');

  // Load current key
  chrome.storage.local.get(['OPENAI_API_KEY'], (result) => {
    if (result.OPENAI_API_KEY) {
      apiKeyInput.value = result.OPENAI_API_KEY;
    }
  });

  // Save on submit
  document.getElementById('apiKeyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = apiKeyInput.value.trim();
    if (key && key.startsWith('sk-')) {
      chrome.storage.local.set({ OPENAI_API_KEY: key }, () => {
        statusDiv.textContent = 'API key saved!';
        setTimeout(() => statusDiv.textContent = '', 2000);
      });
    } else {
      statusDiv.textContent = 'Enter a valid OpenAI API key.';
    }
  });
});
