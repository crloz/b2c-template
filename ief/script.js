(function () {
  if (window.location.href.indexOf('claimsexchange=ForgotPasswordExchange') > -1) {
    return;
  }
  const CONFIG = {
    MAX_RETRIES: 10,
  };

  const state = {
    isInitialized: false,
    retryCount: 0,
    observer: null,
    rafId: null,
    pendingResend: false,
  };

  const logger = {
    debug: (msg, ...args) => console.log(`[B2C Custom Script] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[B2C Custom Script] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[B2C Custom Script] ${msg}`, ...args),
  };

  function handleB2CContent() {
    logger.debug('handleB2CContent() called');

    // If we just did a resend, hide errors and show success message
    if (state.pendingResend) {
      const errorEl = $('#claimVerificationServerError:visible');
      if (errorEl.length > 0) {
        logger.debug('Hiding error after resend');
        errorEl.hide();
        
        $('#resendSuccessMsg').remove();
        const successMsg = $('<div id="resendSuccessMsg" class="resend-success-msg">New code sent to your email</div>');
        $('#attributeList').before(successMsg);
        
        $('#verificationCode').val('').focus();
        $('#verificationCode').one('input', () => {
          $('#resendSuccessMsg').fadeOut();
          state.pendingResend = false;
        });
      }
    }

    const verifyBtn = $('#continue');
    const buttonsContainer = verifyBtn.parent();
    logger.debug('Continue button found:', verifyBtn.length > 0);

    const resendInput = $('#isResendRequest');
    logger.debug('isResendRequest input found:', resendInput.length > 0);
    if (resendInput.length > 0) {
      resendInput.closest('li').hide();
      resendInput.val('false');
      logger.debug('isResendRequest hidden and set to false');
    }

    const emailInput = $("input#signInNames\\.emailAddress, input#email");
    logger.debug('Email input found:', emailInput.length > 0);
    if (emailInput.length > 0) {
      emailInput.prop('readonly', true);
      emailInput.css('background-color', '#eee');
      logger.debug('Email input set to readonly');
    }

    const existingBtn = $('#customResendBtn');
    logger.debug('Custom button already exists:', existingBtn.length > 0);

    if (verifyBtn.length > 0 && existingBtn.length === 0) {
      logger.debug('Creating custom resend button...');
      const resendBtn = $(
        '<button type="button" id="customResendBtn" class="custom-resend-btn">Send new code</button>'
      );

      resendBtn.click(function () {
        logger.debug('Custom resend button clicked!');

        state.pendingResend = true;

        if (resendInput.length > 0) {
          resendInput.val('true');
          logger.debug('isResendRequest set to:', resendInput.val());
        } else {
          logger.warn('isResendRequest input not found!');
        }

        // Fill dummy code - required because field is mandatory, VerifyOtp will fail and keep user on page
        const codeInput = $('#verificationCode');
        codeInput.val('000000');
        logger.debug('Filled dummy code for resend');

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

    const resultDiv = document.getElementById('api');
    logger.debug('API div found:', resultDiv !== null);
    
    if (resultDiv) {
      state.observer.observe(resultDiv, { childList: true, subtree: true });
      logger.debug('MutationObserver started successfully');
    } else {
      logger.error('API div (#api) not found! Cannot observe mutations.');
    }
  }

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

  function initialize() {
    if (state.isInitialized) {
      logger.debug('Already initialized, skipping');
      return;
    }

    logger.debug('Running initialization...');

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

  function startInitialization() {
    logger.debug('Script loaded');

    if (document.readyState === 'loading') {
      logger.debug('Document still loading, adding DOMContentLoaded listener');
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      logger.debug('Document already loaded, initializing immediately');
      initialize();
    }

    scheduleFallbackRetry();

    window.addEventListener('beforeunload', cleanupObserver);
  }

  startInitialization();
})();
