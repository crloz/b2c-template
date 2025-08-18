(function () {
  "use strict";

  function isContinueBtnEnabled(btn) {
    if (!btn) return false;
    var computedStyle = window.getComputedStyle(btn);
    // is enabled when aria-disabled is false and opacity is 1
    console.log(
      "[UI-DEBUG] isContinueBtnEnabled: checking if continue button is enabled",
      btn.getAttribute("aria-disabled"),
      computedStyle.opacity
    );
    if (btn.getAttribute("aria-disabled") === "true") return false;
    if (computedStyle.opacity !== "1") return false;
    console.log("[UI-DEBUG] isContinueBtnEnabled: continue button is enabled");
    return true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    console.log("[UI-DEBUG] Document loaded, initializing UI helper...");
    var alreadyMoved = false;
    var abortReorder = false;
    var continueBtn = document.querySelector("#continue");
  });
})();
