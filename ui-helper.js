(function () {
  "use strict";

  var alreadyMoved = false;
  var abortReorder = false;

  function isElementVisible(el) {
    if (!el) {
      console.log('[UI-DEBUG] isElementVisible: element is null/undefined');
      return false;
    }
    if (el.getAttribute("aria-hidden") === "true") {
      console.log('[UI-DEBUG] isElementVisible: element is aria-hidden', el.id || el.className);
      return false;
    }
    var cs = window.getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      cs.opacity === "0"
    ) {
      console.log('[UI-DEBUG] isElementVisible: element has display/visibility/opacity hidden', el.id || el.className, {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity
      });
      return false;
    }
    if (el.offsetWidth === 0 && el.offsetHeight === 0) {
      console.log('[UI-DEBUG] isElementVisible: element has zero dimensions', el.id || el.className);
      return false;
    }
    console.log('[UI-DEBUG] isElementVisible: element is visible', el.id || el.className);
    return true;
  }

  function areButtonsReady() {
    console.log('[UI-DEBUG] areButtonsReady: checking button readiness...');
    
    var changeEmailBtn = document.getElementById(
      "emailVerificationControl_but_change_claims"
    );
    var continueBtn = document.querySelector(
      "#attributeVerification > .buttons #continue"
    );
    var continueContainer = document.querySelector(
      "#attributeVerification > .buttons"
    );
    var emailButtonsContainer = document.querySelector(
      "#emailVerificationControl > .buttons"
    );
    
    console.log('[UI-DEBUG] areButtonsReady: elements found', {
      changeEmailBtn: !!changeEmailBtn,
      continueBtn: !!continueBtn,
      continueContainer: !!continueContainer,
      emailButtonsContainer: !!emailButtonsContainer
    });
    
    if (
      !changeEmailBtn ||
      !continueBtn ||
      !continueContainer ||
      !emailButtonsContainer
    ) {
      console.log('[UI-DEBUG] areButtonsReady: missing required elements, returning false');
      return false;
    }

    var changeVisible =
      isElementVisible(changeEmailBtn) &&
      changeEmailBtn.getAttribute("aria-hidden") === "false";
    var continueEnabled =
      continueBtn.getAttribute("aria-disabled") === "false" &&
      !continueBtn.disabled;
    
    console.log('[UI-DEBUG] areButtonsReady: button states', {
      changeVisible: changeVisible,
      changeEmailBtnAriaHidden: changeEmailBtn.getAttribute("aria-hidden"),
      continueEnabled: continueEnabled,
      continueBtnAriaDisabled: continueBtn.getAttribute("aria-disabled"),
      continueBtnDisabled: continueBtn.disabled
    });
    
    var result = changeVisible && continueEnabled;
    console.log('[UI-DEBUG] areButtonsReady: returning', result);
    return result;
  }

  function areOtherChangeEmailSiblingsVisible() {
    console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: checking for other visible siblings...');
    try {
      var container = document.querySelector(
        "#emailVerificationControl > .buttons"
      );
      if (!container) {
        console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: container not found');
        return false;
      }
      var buttons = Array.prototype.slice.call(
        container.querySelectorAll("button")
      );
      console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: found buttons', buttons.length);
      
      var others = buttons.filter(function (b) {
        return b.id !== "emailVerificationControl_but_change_claims";
      });
      console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: other buttons (excluding change email)', others.length);
      
      var hasVisibleOthers = others.some(function (btn) {
        var visible = isElementVisible(btn) && btn.getAttribute("aria-hidden") === "false";
        console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: button', btn.id || btn.className, 'visible:', visible);
        return visible;
      });
      
      console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: returning', hasVisibleOthers);
      return hasVisibleOthers;
    } catch (e) {
      console.log('[UI-DEBUG] areOtherChangeEmailSiblingsVisible: error caught', e);
      return false;
    }
  }

  function moveContinueBeforeChangeEmail() {
    console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: attempting to reorder buttons...');
    
    if (alreadyMoved) {
      console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: already moved, skipping');
      return;
    }
    
    var emailButtonsContainer = document.querySelector(
      "#emailVerificationControl > .buttons"
    );
    var continueContainer = document.querySelector(
      "#attributeVerification > .buttons"
    );
    
    console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: containers found', {
      emailButtonsContainer: !!emailButtonsContainer,
      continueContainer: !!continueContainer
    });
    
    if (!emailButtonsContainer || !continueContainer) {
      console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: missing containers, aborting');
      return;
    }

    console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: performing DOM manipulation...');
    alreadyMoved = true;

    var previousVisibility = continueContainer.style.visibility;
    continueContainer.style.visibility = "hidden";
    emailButtonsContainer.parentNode.insertBefore(
      continueContainer,
      emailButtonsContainer
    );
    continueContainer.setAttribute("data-reordered", "true");
    
    console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: DOM reordering complete, restoring visibility');
    requestAnimationFrame(function () {
      continueContainer.style.visibility = previousVisibility || "";
      console.log('[UI-DEBUG] moveContinueBeforeChangeEmail: visibility restored');
    });
  }

  function maybeReorder() {
    console.log('[UI-DEBUG] maybeReorder: checking if reorder should happen...');
    
    if (areOtherChangeEmailSiblingsVisible()) {
      console.log('[UI-DEBUG] maybeReorder: other siblings visible, aborting reorder');
      abortReorder = true;
      return false;
    }
    
    if (areButtonsReady()) {
      console.log('[UI-DEBUG] maybeReorder: buttons ready, proceeding with reorder');
      moveContinueBeforeChangeEmail();
      return true;
    }
    
    console.log('[UI-DEBUG] maybeReorder: buttons not ready yet');
    return false;
  }

  function init() {
    console.log('[UI-DEBUG] init: starting UI helper initialization...');
    console.log('[UI-DEBUG] init: initial state', { alreadyMoved: alreadyMoved, abortReorder: abortReorder });
    
    if (maybeReorder()) {
      console.log('[UI-DEBUG] init: immediate reorder successful, exiting');
      return;
    }
    
    console.log('[UI-DEBUG] init: setting up MutationObserver...');
    var observer = new MutationObserver(function (mutations) {
      console.log('[UI-DEBUG] MutationObserver: DOM change detected', mutations.length, 'mutations');
      
      if (alreadyMoved || abortReorder) {
        console.log('[UI-DEBUG] MutationObserver: operation complete or aborted, disconnecting', {
          alreadyMoved: alreadyMoved,
          abortReorder: abortReorder
        });
        observer.disconnect();
        return;
      }
      
      if (maybeReorder()) {
        console.log('[UI-DEBUG] MutationObserver: reorder successful, disconnecting');
        observer.disconnect();
      }
    });
    
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "aria-disabled",
        "disabled",
        "style",
        "class",
      ],
    });
    
    console.log('[UI-DEBUG] init: observer setup complete, scheduling fallback check...');
    setTimeout(function() {
      console.log('[UI-DEBUG] init: fallback timeout check after 50ms');
      maybeReorder();
    }, 50);
  }

  console.log('[UI-DEBUG] Script entry point: document.readyState =', document.readyState);
  
  if (document.readyState === "loading") {
    console.log('[UI-DEBUG] Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener("DOMContentLoaded", init);
  } else {
    console.log('[UI-DEBUG] Document ready, initializing immediately...');
    init();
  }
  
  window.b2cAreButtonsReady = areButtonsReady;
  console.log('[UI-DEBUG] Script loaded, b2cAreButtonsReady function exposed to window');
})();
