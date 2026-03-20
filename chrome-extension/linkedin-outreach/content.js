// Traffic AI LinkedIn Outreach - Content Script
// Injected into LinkedIn profile pages to click Connect and send messages

(function() {
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendConnectionRequest') {
      handleConnectionRequest(request.message)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // async response
    }

    if (request.action === 'checkProfilePage') {
      // Check if we're on a profile page and get profile info
      const isProfile = window.location.pathname.startsWith('/in/');
      sendResponse({ isProfile });
      return;
    }
  });

  async function handleConnectionRequest(message) {
    console.log('[TrafficAI] Handling connection request on:', window.location.href);

    // Wait for page to be fully loaded
    await waitFor(() => document.querySelector('main'), 5000);

    // Step 1: Find the Connect button
    let connectBtn = findConnectButton();

    // If no Connect button, try the "More" dropdown
    if (!connectBtn) {
      console.log('[TrafficAI] No direct Connect button, trying More dropdown...');
      const moreBtn = document.querySelector('button[aria-label="More actions"]') ||
        document.querySelector('.pvs-profile-actions__overflow-toggle') ||
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'More');

      if (moreBtn) {
        moreBtn.click();
        await sleep(500);
        connectBtn = findConnectInDropdown();
      }
    }

    if (!connectBtn) {
      // Check if already connected
      const alreadyConnected = [...document.querySelectorAll('span, button')]
        .some(el => {
          const text = el.textContent.trim().toLowerCase();
          return text === 'message' || text === 'pending';
        });

      if (alreadyConnected) {
        return { success: true, note: 'Already connected or pending' };
      }

      return { success: false, error: 'Connect button not found on profile page' };
    }

    // Step 2: Click Connect
    console.log('[TrafficAI] Clicking Connect button...');
    connectBtn.click();
    await sleep(1000);

    // Step 3: Handle the connection modal
    // Check if "Add a note" button appears
    const addNoteBtn = await waitFor(() => {
      return [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim().toLowerCase().includes('add a note'));
    }, 3000);

    if (addNoteBtn && message) {
      console.log('[TrafficAI] Clicking "Add a note"...');
      addNoteBtn.click();
      await sleep(500);

      // Find the textarea and type the message
      const textarea = await waitFor(() => {
        return document.querySelector('textarea[name="message"]') ||
          document.querySelector('#custom-message') ||
          document.querySelector('textarea.connect-button-send-invite__custom-message') ||
          document.querySelector('.send-invite textarea') ||
          document.querySelector('[role="dialog"] textarea');
      }, 2000);

      if (textarea) {
        console.log('[TrafficAI] Typing message...');
        textarea.focus();
        textarea.value = message;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);
      }
    }

    // Step 4: Click Send / Send now
    const sendBtn = await waitFor(() => {
      return [...document.querySelectorAll('button')]
        .find(b => {
          const text = b.textContent.trim().toLowerCase();
          return (text === 'send' || text === 'send now' || text.includes('send invitation')) &&
            !b.disabled;
        });
    }, 2000);

    if (sendBtn) {
      console.log('[TrafficAI] Clicking Send...');
      sendBtn.click();
      await sleep(1000);
      console.log('[TrafficAI] Connection request sent!');
      return { success: true };
    }

    // If no send button but we clicked Connect, it might have sent without a modal
    // (LinkedIn sometimes sends directly without a modal for "Connect" button)
    console.log('[TrafficAI] No send button found after clicking Connect - may have sent directly');
    return { success: true, note: 'Sent directly (no modal)' };
  }

  function findConnectButton() {
    // Try various selectors for the Connect button
    const selectors = [
      'button[aria-label*="Invite"][aria-label*="connect"]',
      'button[aria-label*="Connect"]',
      '.pvs-profile-actions button[aria-label*="connect" i]',
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && isVisible(btn)) return btn;
    }

    // Fallback: find button by text content
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const span = btn.querySelector('span') || btn;
      const text = span.textContent.trim().toLowerCase();
      if (text === 'connect' && isVisible(btn)) return btn;
    }

    return null;
  }

  function findConnectInDropdown() {
    const items = document.querySelectorAll('[role="menuitem"], .artdeco-dropdown__item');
    for (const item of items) {
      const text = item.textContent.trim().toLowerCase();
      if (text.includes('connect')) return item;
    }
    return null;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && !el.disabled;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function waitFor(fn, timeout = 5000) {
    return new Promise(resolve => {
      const result = fn();
      if (result) { resolve(result); return; }

      const interval = setInterval(() => {
        const result = fn();
        if (result) {
          clearInterval(interval);
          resolve(result);
        }
      }, 200);

      setTimeout(() => {
        clearInterval(interval);
        resolve(null);
      }, timeout);
    });
  }
})();
