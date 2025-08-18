(function () {
  "use strict";

  var alreadyMoved = false;
  var abortReorder = false;

  function isElementVisible(el) {
    if (!el) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    var cs = window.getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      cs.opacity === "0"
    )
      return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    return true;
  }

  function areButtonsReady() {
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
    if (
      !changeEmailBtn ||
      !continueBtn ||
      !continueContainer ||
      !emailButtonsContainer
    )
      return false;

    var changeVisible =
      isElementVisible(changeEmailBtn) &&
      changeEmailBtn.getAttribute("aria-hidden") === "false";
    var continueEnabled =
      continueBtn.getAttribute("aria-disabled") === "false" &&
      !continueBtn.disabled;
    return changeVisible && continueEnabled;
  }

  function areOtherChangeEmailSiblingsVisible() {
    try {
      var container = document.querySelector(
        "#emailVerificationControl > .buttons"
      );
      if (!container) return false;
      var buttons = Array.prototype.slice.call(
        container.querySelectorAll("button")
      );
      var others = buttons.filter(function (b) {
        return b.id !== "emailVerificationControl_but_change_claims";
      });
      return others.some(function (btn) {
        return (
          isElementVisible(btn) && btn.getAttribute("aria-hidden") === "false"
        );
      });
    } catch (e) {
      return false;
    }
  }

  function moveContinueBeforeChangeEmail() {
    if (alreadyMoved) return;
    var emailButtonsContainer = document.querySelector(
      "#emailVerificationControl > .buttons"
    );
    var continueContainer = document.querySelector(
      "#attributeVerification > .buttons"
    );
    if (!emailButtonsContainer || !continueContainer) return;

    alreadyMoved = true;

    var previousVisibility = continueContainer.style.visibility;
    continueContainer.style.visibility = "hidden";
    emailButtonsContainer.parentNode.insertBefore(
      continueContainer,
      emailButtonsContainer
    );
    continueContainer.setAttribute("data-reordered", "true");
    requestAnimationFrame(function () {
      continueContainer.style.visibility = previousVisibility || "";
    });
  }

  function maybeReorder() {
    if (areOtherChangeEmailSiblingsVisible()) {
      abortReorder = true;
      return false;
    }
    if (areButtonsReady()) {
      moveContinueBeforeChangeEmail();
      return true;
    }
    return false;
  }

  function init() {
    if (maybeReorder()) return;
    var observer = new MutationObserver(function () {
      if (alreadyMoved || abortReorder) {
        observer.disconnect();
        return;
      }
      if (maybeReorder()) observer.disconnect();
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
    setTimeout(maybeReorder, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.b2cAreButtonsReady = areButtonsReady;
})();
