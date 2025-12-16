/**
 * Traffic AI Pixel - Website Visitor Tracking Script
 *
 * This script captures visitor behavior and sends it to Traffic AI for
 * identification and enrichment. Similar to Customers.ai pixel.
 */
(function(window, document) {
  'use strict';

  // Configuration - endpoint can be overridden via TrafficAI config
  var CONFIG = {
    endpoint: null, // Will be set from config or default
    version: '1.1.0',
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    heartbeatInterval: 30 * 1000, // 30 seconds
    scrollThreshold: 25, // Track scroll at 25%, 50%, 75%, 100%
  };

  // Get pixel IDs and config from the queue
  var pixelIds = [];
  if (window.TrafficAI && Array.isArray(window.TrafficAI)) {
    window.TrafficAI.forEach(function(item) {
      if (item.pixelId) {
        pixelIds.push(item.pixelId);
      }
      if (item.endpoint) {
        CONFIG.endpoint = item.endpoint;
      }
    });
  }

  // Default endpoint if not configured
  if (!CONFIG.endpoint) {
    // Try to detect from script src
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('pixel.js') !== -1) {
        var url = new URL(src);
        CONFIG.endpoint = url.origin + '/api/pixel/track';
        break;
      }
    }
    // Fallback to production endpoint
    if (!CONFIG.endpoint) {
      CONFIG.endpoint = 'https://app.trafficai.io/api/pixel/track';
    }
  }

  if (pixelIds.length === 0) {
    console.warn('Traffic AI: No pixel ID found');
    return;
  }

  // Visitor identification
  var visitorId = getOrCreateVisitorId();
  var sessionId = getOrCreateSessionId();
  var pageLoadTime = Date.now();
  var maxScrollDepth = 0;
  var clickCount = 0;
  var lastActivityTime = Date.now();

  /**
   * Generate a unique ID
   */
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get or create visitor ID (persisted in localStorage)
   */
  function getOrCreateVisitorId() {
    var key = '_tai_vid';
    var vid = null;

    try {
      vid = localStorage.getItem(key);
      if (!vid) {
        vid = generateId();
        localStorage.setItem(key, vid);
      }
    } catch (e) {
      // Fallback to cookie if localStorage not available
      vid = getCookie(key);
      if (!vid) {
        vid = generateId();
        setCookie(key, vid, 365 * 2); // 2 years
      }
    }

    return vid;
  }

  /**
   * Get or create session ID (expires after inactivity)
   */
  function getOrCreateSessionId() {
    var key = '_tai_sid';
    var sid = null;
    var lastActive = null;

    try {
      sid = sessionStorage.getItem(key);
      lastActive = sessionStorage.getItem(key + '_time');

      // Check if session expired
      if (sid && lastActive) {
        if (Date.now() - parseInt(lastActive) > CONFIG.sessionTimeout) {
          sid = null; // Session expired
        }
      }

      if (!sid) {
        sid = generateId();
      }

      sessionStorage.setItem(key, sid);
      sessionStorage.setItem(key + '_time', Date.now().toString());
    } catch (e) {
      sid = generateId();
    }

    return sid;
  }

  /**
   * Cookie helpers
   */
  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var nameEQ = name + '=';
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  /**
   * Get browser fingerprint data
   */
  function getFingerprint() {
    var fp = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: screen.width,
      screenHeight: screen.height,
      screenColorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
    };

    // Canvas fingerprint (basic)
    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Traffic AI', 2, 2);
      fp.canvasHash = canvas.toDataURL().slice(-50);
    } catch (e) {
      fp.canvasHash = null;
    }

    return fp;
  }

  /**
   * Get page information
   */
  function getPageInfo() {
    return {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      host: window.location.host,
    };
  }

  /**
   * Safe JSON stringify that handles circular references
   */
  function safeStringify(obj) {
    var seen = new WeakSet();
    return JSON.stringify(obj, function(key, value) {
      // Skip React internal properties and DOM nodes
      if (key.startsWith('__react') || key.startsWith('_react')) {
        return undefined;
      }
      if (value instanceof Node || value instanceof Element) {
        return '[DOM Element]';
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }

  /**
   * Send event to Traffic AI
   */
  function sendEvent(eventType, eventData) {
    var payload = {
      pixelIds: pixelIds,
      visitorId: visitorId,
      sessionId: sessionId,
      eventType: eventType,
      eventData: eventData || {},
      page: getPageInfo(),
      fingerprint: getFingerprint(),
      timestamp: new Date().toISOString(),
      version: CONFIG.version,
    };

    // Use sendBeacon for reliability, fallback to fetch
    var data = safeStringify(payload);

    if (navigator.sendBeacon) {
      // Use Blob with correct MIME type for sendBeacon
      var blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(CONFIG.endpoint, blob);
    } else {
      fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true,
      }).catch(function() {});
    }
  }

  /**
   * Track page view
   */
  function trackPageView() {
    sendEvent('pageview', {
      loadTime: performance.timing ?
        performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart : null,
    });
  }

  /**
   * Track scroll depth
   */
  function trackScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    var scrollPercent = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;

    // Track at thresholds
    var thresholds = [25, 50, 75, 100];
    thresholds.forEach(function(threshold) {
      if (scrollPercent >= threshold && maxScrollDepth < threshold) {
        maxScrollDepth = threshold;
        sendEvent('scroll', { depth: threshold });
      }
    });
  }

  /**
   * Track clicks
   */
  function trackClick(event) {
    clickCount++;
    var target = event.target;

    // Safely get className as string (could be DOMTokenList)
    var className = '';
    try {
      className = typeof target.className === 'string'
        ? target.className
        : (target.className && target.className.toString ? target.className.toString() : '');
    } catch (e) {
      className = '';
    }

    // Safely get href
    var href = null;
    try {
      href = target.href || (target.closest && target.closest('a') ? target.closest('a').href : null);
    } catch (e) {
      href = null;
    }

    var data = {
      tagName: target.tagName || null,
      id: target.id || null,
      className: className || null,
      text: (target.innerText || '').substring(0, 100),
      href: href,
    };

    // Only send click events for important elements
    var isImportant = false;
    try {
      isImportant = target.tagName === 'A' || target.tagName === 'BUTTON' ||
          (target.closest && (target.closest('a') || target.closest('button')));
    } catch (e) {
      isImportant = false;
    }

    if (isImportant) {
      sendEvent('click', data);
    }
  }

  /**
   * Track form submissions
   */
  function trackFormSubmit(event) {
    var form = event.target;
    var data = {
      formId: form.id || null,
      formName: form.name || null,
      formAction: form.action || null,
      fieldCount: form.elements.length,
    };

    // Capture email from form fields for visitor identification
    var email = null;
    var name = null;
    var phone = null;

    try {
      Array.from(form.elements).forEach(function(el) {
        var fieldName = (el.name || '').toLowerCase();
        var fieldId = (el.id || '').toLowerCase();
        var fieldType = (el.type || '').toLowerCase();
        var placeholder = (el.placeholder || '').toLowerCase();
        var value = el.value || '';

        // Capture email - check type, name, id, and placeholder
        if (!email && value && (
          fieldType === 'email' ||
          fieldName.includes('email') ||
          fieldId.includes('email') ||
          placeholder.includes('email')
        )) {
          // Basic email validation
          if (value.indexOf('@') > 0 && value.indexOf('.') > 0) {
            email = value;
          }
        }

        // Capture name - check various patterns
        if (!name && value && (
          fieldName.includes('name') ||
          fieldId.includes('name') ||
          fieldName === 'fullname' ||
          fieldName === 'full_name' ||
          fieldName === 'your_name' ||
          fieldName === 'yourname' ||
          placeholder.includes('name')
        )) {
          // Skip if it's an email field that happens to have "name" in it
          if (!fieldName.includes('email') && !fieldId.includes('email')) {
            name = value;
          }
        }

        // Capture phone
        if (!phone && value && (
          fieldType === 'tel' ||
          fieldName.includes('phone') ||
          fieldName.includes('mobile') ||
          fieldName.includes('tel') ||
          fieldId.includes('phone') ||
          fieldId.includes('mobile')
        )) {
          phone = value;
        }
      });
    } catch (e) {
      // Ignore errors accessing form elements
    }

    data.email = email;
    data.name = name;
    data.phone = phone;
    data.hasEmailField = !!email;

    sendEvent('form_submit', data);

    // If we captured an email, also send an identify event
    if (email) {
      sendEvent('identify', { email: email, name: name, phone: phone });
    }
  }

  /**
   * Track time on page (heartbeat)
   */
  function sendHeartbeat() {
    var timeOnPage = Math.round((Date.now() - pageLoadTime) / 1000);
    sendEvent('heartbeat', {
      timeOnPage: timeOnPage,
      maxScrollDepth: maxScrollDepth,
      clickCount: clickCount,
    });
  }

  /**
   * Track page exit
   */
  function trackExit() {
    var timeOnPage = Math.round((Date.now() - pageLoadTime) / 1000);
    sendEvent('exit', {
      timeOnPage: timeOnPage,
      maxScrollDepth: maxScrollDepth,
      clickCount: clickCount,
    });
  }

  /**
   * Initialize tracking
   */
  function init() {
    // Track initial page view
    if (document.readyState === 'complete') {
      trackPageView();
    } else {
      window.addEventListener('load', trackPageView);
    }

    // Track scroll
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(trackScroll, 100);
    }, { passive: true });

    // Track clicks
    document.addEventListener('click', trackClick, true);

    // Track form submissions
    document.addEventListener('submit', trackFormSubmit, true);

    // Heartbeat for time tracking
    setInterval(sendHeartbeat, CONFIG.heartbeatInterval);

    // Track exit
    window.addEventListener('beforeunload', trackExit);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        trackExit();
      }
    });

    // Track activity for session management
    ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function(event) {
      document.addEventListener(event, function() {
        lastActivityTime = Date.now();
        try {
          sessionStorage.setItem('_tai_sid_time', Date.now().toString());
        } catch (e) {}
      }, { passive: true });
    });

    console.log('Traffic AI Pixel initialized:', pixelIds.join(', '));
  }

  // Start tracking
  init();

  // Expose API for manual tracking
  window.TrafficAI = {
    track: function(eventType, eventData) {
      sendEvent(eventType, eventData);
    },
    identify: function(email, data) {
      sendEvent('identify', { email: email, userData: data });
    },
    getVisitorId: function() {
      return visitorId;
    },
    getSessionId: function() {
      return sessionId;
    },
  };

})(window, document);
