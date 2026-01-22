/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║                          B2C CUSTOM SCRIPT - OTP RESEND FLOW HANDLER                             ║
 * ╠══════════════════════════════════════════════════════════════════════════════════════════════════╣
 * ║  FILE: script.js                                                                                  ║
 * ║  PURPOSE: Enables inline OTP resend without page navigation using a "hidden field trick"         ║
 * ║                                                                                                   ║
 * ║  PROBLEM SOLVED:                                                                                  ║
 * ║  ───────────────                                                                                  ║
 * ║  B2C's native DisplayControl for OTP resend requires a full page refresh and has limited         ║
 * ║  customization. We want a seamless UX where clicking "Send new code" regenerates and sends       ║
 * ║  a new OTP while keeping the user on the same page.                                              ║
 * ║                                                                                                   ║
 * ║  HOW IT WORKS:                                                                                    ║
 * ║  ──────────────                                                                                   ║
 * ║  1. B2C renders the OTP entry page with a hidden "isResendRequest" input field                   ║
 * ║  2. This script hides that field and injects a custom "Send new code" button                     ║
 * ║  3. When clicked, the button:                                                                     ║
 * ║     a) Sets isResendRequest = "true"                                                              ║
 * ║     b) Fills verificationCode with dummy "000000"                                                 ║
 * ║     c) Clicks the Continue button                                                                 ║
 * ║  4. B2C's ValidationTechnicalProfiles in SelfAsserted-EnterEmailOtp:                             ║
 * ║     - GenerateOtp runs (because isResendRequest=true) → New code created                         ║
 * ║     - SendEmailOtp runs (because isResendRequest=true) → Email sent                              ║
 * ║     - VerifyOtp runs (ALWAYS) → Fails because "000000" is wrong                                  ║
 * ║  5. The failure keeps user on page. This script detects the re-render via MutationObserver,     ║
 * ║     hides the error, and shows a success message.                                                 ║
 * ║                                                                                                   ║
 * ║  COORDINATION WITH POLICY:                                                                        ║
 * ║  ─────────────────────────                                                                        ║
 * ║  This script MUST be used with:                                                                   ║
 * ║    - TrustFrameworkExtensions.xml → SelfAsserted-EnterEmailOtp technical profile                 ║
 * ║    - The isResendRequest ClaimType defined in BuildingBlocks                                     ║
 * ║    - selfAsserted.html with CSS to hide .isResendRequest_li                                      ║
 * ║                                                                                                   ║
 * ║  SECURITY NOTE:                                                                                   ║
 * ║  ──────────────                                                                                   ║
 * ║  The VerifyOtp validation ALWAYS runs (no precondition), so even if a malicious user sets        ║
 * ║  isResendRequest=true manually, they still can't bypass OTP - they'd just trigger a resend.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
 */
(function () {
  // Skip this script entirely on the Forgot Password flow (different page, no OTP entry)
  if (window.location.href.indexOf('claimsexchange=ForgotPasswordExchange') > -1) {
    return;
  }

  const CONFIG = {
    MAX_RETRIES: 10, // How many times to retry initialization if jQuery isn't loaded yet
  };

  // Internal state management
  const state = {
    isInitialized: false,   // Prevents double-initialization
    retryCount: 0,          // Tracks initialization retry attempts
    observer: null,         // MutationObserver instance
    rafId: null,            // requestAnimationFrame ID for cleanup
    pendingResend: false,   // Flag to track if we just did a resend (for UX feedback)
  };

  // Prefixed console logging for easier debugging
  const logger = {
    debug: (msg, ...args) => console.log(`[B2C Custom Script] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[B2C Custom Script] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[B2C Custom Script] ${msg}`, ...args),
  };

  /**
   * Main handler that runs whenever B2C updates the DOM.
   * 
   * This function:
   * 1. Handles post-resend UX (hide error, show success message)
   * 2. Hides the isResendRequest field from the user
   * 3. Makes the email field read-only (user shouldn't change it mid-OTP)
   * 4. Injects the custom "Send new code" button
   */
  function handleB2CContent() {
    logger.debug('handleB2CContent() called');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: POST-RESEND UX HANDLING
    // After a resend, B2C shows an error (because VerifyOtp intentionally failed).
    // We hide that error and show a friendly "code sent" message instead.
    // ═══════════════════════════════════════════════════════════════════════════
    if (state.pendingResend) {
      const errorEl = $('#claimVerificationServerError:visible');
      if (errorEl.length > 0) {
        logger.debug('Hiding error after resend');
        errorEl.hide();
        
        // Show success message
        $('#resendSuccessMsg').remove();
        const successMsg = $('<div id="resendSuccessMsg" class="resend-success-msg">New code sent to your email</div>');
        $('#attributeList').before(successMsg);
        
        // Clear the dummy code and focus the input for user to enter new code
        $('#verificationCode').val('').focus();
        
        // Hide success message once user starts typing
        $('#verificationCode').one('input', () => {
          $('#resendSuccessMsg').fadeOut();
          state.pendingResend = false;
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: FIND KEY DOM ELEMENTS
    // ═══════════════════════════════════════════════════════════════════════════
    const verifyBtn = $('#continue');
    const buttonsContainer = verifyBtn.parent();
    logger.debug('Continue button found:', verifyBtn.length > 0);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: HIDE THE isResendRequest INPUT
    // B2C renders this as a visible text field. We hide it and control it via JS.
    // The CSS in selfAsserted.html also hides it (.isResendRequest_li) as backup.
    // ═══════════════════════════════════════════════════════════════════════════
    const resendInput = $('#isResendRequest');
    logger.debug('isResendRequest input found:', resendInput.length > 0);
    if (resendInput.length > 0) {
      resendInput.closest('li').hide();
      resendInput.val('false'); // Reset to false on every render
      logger.debug('isResendRequest hidden and set to false');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: MAKE EMAIL READ-ONLY
    // The email was already verified during sign-in. User shouldn't change it here.
    // ═══════════════════════════════════════════════════════════════════════════
    const emailInput = $("input#signInNames\\.emailAddress, input#email");
    logger.debug('Email input found:', emailInput.length > 0);
    if (emailInput.length > 0) {
      emailInput.prop('readonly', true);
      emailInput.css('background-color', '#eee');
      logger.debug('Email input set to readonly');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: INJECT THE CUSTOM RESEND BUTTON
    // Only create it once (check for existing button to prevent duplicates)
    // ═══════════════════════════════════════════════════════════════════════════
    const existingBtn = $('#customResendBtn');
    logger.debug('Custom button already exists:', existingBtn.length > 0);

    if (verifyBtn.length > 0 && existingBtn.length === 0) {
      logger.debug('Creating custom resend button...');
      const resendBtn = $(
        '<button type="button" id="customResendBtn" class="custom-resend-btn">Send new code</button>'
      );

      // ═══════════════════════════════════════════════════════════════════════
      // RESEND BUTTON CLICK HANDLER - THE CORE TRICK
      // ═══════════════════════════════════════════════════════════════════════
      resendBtn.click(function () {
        logger.debug('Custom resend button clicked!');

        // Mark that we're doing a resend (for post-render UX handling)
        state.pendingResend = true;

        // Set the hidden flag to "true" - this triggers GenerateOtp and SendEmailOtp
        // in the policy's ValidationTechnicalProfiles
        if (resendInput.length > 0) {
          resendInput.val('true');
          logger.debug('isResendRequest set to:', resendInput.val());
        } else {
          logger.warn('isResendRequest input not found!');
        }

        // Fill a dummy code - REQUIRED because verificationCode is a mandatory field.
        // VerifyOtp will fail (000000 is wrong), but that's intentional:
        // - GenerateOtp already ran and created a new code
        // - SendEmailOtp already sent the email
        // - The "failure" just keeps the user on this page
        const codeInput = $('#verificationCode');
        codeInput.val('000000');
        logger.debug('Filled dummy code for resend');

        // Trigger form submission by clicking Continue
        // B2C will execute all ValidationTechnicalProfiles in order
        logger.debug('Triggering continue button click...');
        verifyBtn.click();
      });

      buttonsContainer.append(resendBtn);
      verifyBtn.css('margin-right', '10px');
      logger.debug('Custom button added to page!');
      
      state.isInitialized = true;
    } else if (verifyBtn.length === 0) {
      logger.warn('Continue button not found, skipping button creation');
    }
  }

  /**
   * Sets up a MutationObserver on the #api div.
   * 
   * WHY WE NEED THIS:
   * B2C dynamically injects and updates content inside #api. After a form submission
   * (like our resend flow), B2C re-renders the entire form. We need to:
   * 1. Re-inject our custom button (it gets wiped out)
   * 2. Re-hide the isResendRequest field
   * 3. Handle post-resend UX (hide error, show success)
   * 
   * The MutationObserver watches for ANY DOM changes inside #api and re-runs
   * handleB2CContent() each time.
   */
  function setupObserver() {
    logger.debug('Setting up MutationObserver...');
    
    if (state.observer) {
      logger.debug('Observer already exists, skipping');
      return;
    }

    state.observer = new MutationObserver(function (mutations) {
      logger.debug('Mutation detected, calling handleB2CContent()');
      handleB2CContent();
    });

    // #api is the container where B2C injects all its dynamic content
    const resultDiv = document.getElementById('api');
    logger.debug('API div found:', resultDiv !== null);
    
    if (resultDiv) {
      // Watch for any child element changes, including nested elements
      state.observer.observe(resultDiv, { childList: true, subtree: true });
      logger.debug('MutationObserver started successfully');
    } else {
      logger.error('API div (#api) not found! Cannot observe mutations.');
    }
  }

  /**
   * Cleanup function to disconnect observer when page unloads.
   * Prevents memory leaks and orphaned observers.
   */
  function cleanupObserver() {
    if (state.observer) {
      logger.debug('Cleaning up observer');
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.rafId) {
      logger.debug('Canceling pending RAF');
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  /**
   * Main initialization function.
   * Waits for jQuery (injected by B2C) before setting up our custom behavior.
   */
  function initialize() {
    if (state.isInitialized) {
      logger.debug('Already initialized, skipping');
      return;
    }

    logger.debug('Running initialization...');

    // B2C injects jQuery, but it may not be loaded yet when our script runs
    if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
      logger.warn('jQuery not loaded yet, will retry');
      return;
    }

    $(document).ready(function () {
      logger.debug('DOM Ready fired inside initialize()');
      setupObserver();
      handleB2CContent();
    });
  }

  /**
   * Fallback retry mechanism using requestAnimationFrame.
   * 
   * WHY WE NEED THIS:
   * B2C's page loading is complex - our script might load before jQuery or before
   * B2C injects its content. This retry loop ensures we eventually initialize
   * even if the timing is unpredictable.
   */
  function scheduleFallbackRetry() {
    if (state.retryCount >= CONFIG.MAX_RETRIES) {
      logger.error('Max retries reached, giving up');
      return;
    }

    state.retryCount++;
    logger.debug(`Scheduling fallback attempt #${state.retryCount}`);

    state.rafId = requestAnimationFrame(() => {
      if (!state.isInitialized) {
        logger.debug(`Fallback initialization attempt #${state.retryCount}`);
        initialize();
        scheduleFallbackRetry();
      } else {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    });
  }

  /**
   * Entry point - kicks off the initialization process.
   * Handles both "document still loading" and "document already loaded" cases.
   */
  function startInitialization() {
    logger.debug('Script loaded');

    if (document.readyState === 'loading') {
      logger.debug('Document still loading, adding DOMContentLoaded listener');
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      logger.debug('Document already loaded, initializing immediately');
      initialize();
    }

    // Start retry loop as a safety net
    scheduleFallbackRetry();

    // Clean up when user navigates away
    window.addEventListener('beforeunload', cleanupObserver);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCRIPT ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════════════════
  startInitialization();
})();

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║                                    DEBUGGING TIPS                                                 ║
 * ╠══════════════════════════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                                                   ║
 * ║  1. Open browser DevTools Console to see "[B2C Custom Script]" logs                              ║
 * ║                                                                                                   ║
 * ║  2. Check the Network tab for the REST API call to your SendEmailOtp endpoint                    ║
 * ║                                                                                                   ║
 * ║  3. If resend isn't working:                                                                      ║
 * ║     - Verify isResendRequest input exists: $('#isResendRequest') in console                      ║
 * ║     - Check that TrustFrameworkExtensions.xml has the isResendRequest ClaimType                  ║
 * ║     - Verify SelfAsserted-EnterEmailOtp has isResendRequest in InputClaims AND OutputClaims     ║
 * ║                                                                                                   ║
 * ║  4. If button doesn't appear:                                                                     ║
 * ║     - Check that this script URL is accessible (CORS, HTTPS)                                     ║
 * ║     - Verify selfAsserted.html includes this script                                              ║
 * ║     - Check browser console for JavaScript errors                                                ║
 * ║                                                                                                   ║
 * ║  5. Use Application Insights to trace the B2C policy execution:                                  ║
 * ║     - Search by CorrelationId from the error page URL                                            ║
 * ║     - Look for "ValidationTechnicalProfile" events to see which profiles ran                    ║
 * ║                                                                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
 */
