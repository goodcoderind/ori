/**
 * ProSocratic Content Script
 *
 * Injected into every webpage. Responsibilities:
 * 1. Mount the overlay React app inside a Shadow DOM (style isolation)
 * 2. Run the behavioral sensor (scroll, keystroke, idle detection)
 * 3. Extract page topic via DOM parsing (ephemeral — never stored)
 * 4. Route messages to/from the background service worker
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../overlay/App'

// ─── Prevent double-injection ─────────────────────────────────
if (!document.getElementById('prosocratic-root')) {
  initOverlay()
}

function initOverlay() {
  // 1. Create mount point
  const mountPoint = document.createElement('div')
  mountPoint.id = 'prosocratic-root'
  mountPoint.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 0 !important;
    height: 0 !important;
    overflow: visible !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  `
  document.body.appendChild(mountPoint)

  // 2. Shadow DOM = complete style isolation from host page
  //    This is critical — without it, Tailwind classes bleed into Wikipedia, YouTube, etc.
  const shadowRoot = mountPoint.attachShadow({ mode: 'open' })

  // 3. Inject styles into shadow root
  //    We inline the critical styles and also load the compiled CSS
  const styleEl = document.createElement('style')
  styleEl.textContent = getBaseStyles()
  shadowRoot.appendChild(styleEl)

  // Load Inter font
  const fontLink = document.createElement('link')
  fontLink.rel = 'stylesheet'
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
  shadowRoot.appendChild(fontLink)

  // 4. Create React container
  const container = document.createElement('div')
  container.id = 'prosocratic-app'
  shadowRoot.appendChild(container)

  // 5. Mount React
  // NOTE: We use createElement instead of JSX here deliberately.
  // The content script entry is processed by CRXJS before Vite's React transform
  // runs, so JSX syntax in THIS file specifically will cause a parse error.
  // All other files (.tsx components) are fine to use JSX as normal.
  const root = createRoot(container)
  root.render(createElement(App, null))

  // 6. Extract page context and send to background
  extractAndSendPageContext()
}

// ─── Page Context Extraction ──────────────────────────────────
// Reads the PUBLIC webpage HTML (not student notes/input) — per privacy framework
// This is ephemeral: used once per session, never stored
function extractAndSendPageContext() {
  // Simple topic extraction from page metadata and content
  const title = document.title || ''
  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const h1 = document.querySelector('h1')?.textContent || ''

  // Get first meaningful paragraph for topic detection
  const paragraphs = Array.from(document.querySelectorAll('p'))
  const firstMeaningful = paragraphs
    .map(p => p.textContent?.trim() || '')
    .filter(t => t.length > 50)
    .slice(0, 3)
    .join(' ')

  const topic = [title, h1, metaDescription].filter(Boolean).join(' — ')

  // Send to background service worker
  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTEXT',
      payload: {
        topic: topic.slice(0, 500),
        url: window.location.href,
        textLength: firstMeaningful.length,
      },
    })
  } catch {
    // Extension context may not be available in dev mode
  }
}

// ─── Base Styles (inlined for guaranteed loading) ─────────────
function getBaseStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    #prosocratic-app {
      position: fixed;
      bottom: 0;
      right: 0;
      width: 0;
      height: 0;
      overflow: visible;
      z-index: 2147483647;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      pointer-events: none;
    }

    /* Scrollbar styling for the chat */
    ::-webkit-scrollbar {
      width: 4px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    /* Animation keyframes */
    @keyframes breathe {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.02); }
    }

    @keyframes pulse-amber {
      0%, 100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.3); }
      50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.6); }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes float-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes typing-dot {
      0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-4px); }
    }
  `
}
